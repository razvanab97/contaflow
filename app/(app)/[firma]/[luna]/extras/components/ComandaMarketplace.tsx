'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tx } from './types'
import { deschideDocument } from '@/lib/vizualizare'
import type { Comanda, DocTx, LinieComanda } from '@/lib/comenzi-marketplace'

// Comanda marketplace pe o plata din extras: o plata, mai multi vanzatori, cate o factura de la fiecare.
// Fara comanda: „Împarte plata pe facturi” (captura / PDF / text al comenzii -> AI -> verifici -> salvezi).
// Cu comanda: reconcilierea pe vanzatori - ce factura a venit, ce lipseste, ce s-a anulat - si atasarea directa.

interface Candidat { id: string; furnizor: string | null; numar_document: string | null; suma: number; fisier_nume: string; data_document: string | null }
interface Stare { comanda: Comanda | null; linii: LinieComanda[]; docs: DocTx[]; lipsaMigrare?: boolean; candidati?: Record<string, Candidat[]> }
interface LinieDraft { vanzator: string; emitent: string | null; subtotal: string; stare: 'asteptata' | 'anulata'; produse?: string | null }
interface Draft { platforma: string; numar_comanda: string; data_comanda: string; total: string; linii: LinieDraft[] }

const MARKETPLACE = /emag|trendyol|altex|flanco|payu|amazon|aliexpress|temu|cel\.ro|evomag|elefant|libris|vivre|answear|notino|fashion ?days|okazii|shein|skroutz|allegro|ebay/i
const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (s: string) => Number(String(s).replace(/\s/g, '').replace(',', '.'))
const box: React.CSSProperties = { padding: '14px 16px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)' }
const inp: React.CSSProperties = { height: '32px', minWidth: 0, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 'var(--fs-md)' }

export default function ComandaMarketplace({ tx, firmaId, lunaId, onRefresh }: { tx: Tx; firmaId: string; lunaId: string; onRefresh: () => void }) {
  const [st, setSt] = useState<Stare | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deschis, setDeschis] = useState(false)
  const [busy, setBusy] = useState('')
  const [eroare, setEroare] = useState('')
  const [text, setText] = useState('')
  const [confirmSterge, setConfirmSterge] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const upRef = useRef<HTMLInputElement>(null)
  const [upLinie, setUpLinie] = useState<LinieComanda | null>(null)

  const incarca = useCallback(() => fetch(`/api/comenzi-marketplace?txId=${tx.id}`).then(r => r.json()).then((d: Stare) => setSt(d)).catch(() => setSt({ comanda: null, linii: [], docs: [] })), [tx.id])
  useEffect(() => { setSt(null); setDraft(null); setDeschis(false); setEroare(''); setText(''); incarca() }, [incarca])

  if (tx.tip !== 'debit' || !st) return null
  // Oferta de impartire doar unde are sens: plati catre marketplace-uri sau plati care au deja 2+ facturi
  if (!st.comanda && !draft && !MARKETPLACE.test(`${tx.descriere || ''} ${tx.descriere_curatata || ''}`) && (tx.documenteToate?.length || 0) < 2) return null

  const draftNou = (): Draft => ({ platforma: 'eMAG', numar_comanda: tx.referinta?.match(/\d{6,}/)?.[0] || '', data_comanda: '', total: String(tx.suma), linii: [{ vanzator: '', emitent: null, subtotal: '', stare: 'asteptata' }] })
  const dinComanda = (): Draft | null => st.comanda ? ({ platforma: st.comanda.platforma, numar_comanda: st.comanda.numar_comanda || '', data_comanda: st.comanda.data_comanda || '', total: String(st.comanda.total), linii: st.linii.map(l => ({ vanzator: l.vanzator, emitent: l.emitent, subtotal: String(l.subtotal), stare: l.stare === 'anulata' ? 'anulata' : 'asteptata' })) }) : null

  async function citeste(file?: File) {
    setBusy('citeste'); setEroare('')
    const fd = new FormData(); if (file) fd.append('file', file); if (text.trim()) fd.append('text', text)
    const r = await fetch('/api/comenzi-marketplace/citeste', { method: 'POST', body: fd }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(''); if (fileRef.current) fileRef.current.value = ''
    if (!r?.ok) { setEroare(d.error || 'Comanda nu a putut fi citită'); return }
    setDraft({ platforma: d.platforma || 'Marketplace', numar_comanda: d.numar_comanda || '', data_comanda: d.data_comanda || '', total: String(d.total ?? tx.suma), linii: d.linii.map((l: LinieDraft & { subtotal: number }) => ({ ...l, subtotal: String(l.subtotal) })) })
  }

  async function salveaza() {
    if (!draft) return
    setBusy('salveaza'); setEroare('')
    const r = await fetch('/api/comenzi-marketplace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txId: tx.id, ...draft, total: num(draft.total), linii: draft.linii.map(l => ({ ...l, subtotal: num(l.subtotal) })) }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setEroare(d.error || 'Comanda nu s-a salvat'); return }
    setDraft(null); setDeschis(true); await incarca(); onRefresh()
  }

  async function linie(l: LinieComanda, patch: Record<string, unknown>) {
    setBusy(l.id); setEroare('')
    const r = await fetch('/api/comenzi-marketplace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, txId: tx.id, ...patch }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setEroare(d.error || 'Nu s-a salvat'); return }
    await incarca(); onRefresh()
  }

  async function ataseazaInbox(l: LinieComanda, c: Candidat) {
    setBusy(l.id); setEroare('')
    const r = await fetch('/api/inbox-facturi/asociaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facturaId: c.id, tranzactieId: tx.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setBusy(''); setEroare(d.error || 'Factura nu s-a putut atașa'); return }
    await linie(l, { document_id: c.id })
  }

  async function incarcaFactura(file: File) {
    const l = upLinie; if (!l) return
    setBusy(l.id); setEroare('')
    const fd = new FormData()
    fd.append('file', file); fd.append('txId', tx.id); fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    fd.append('tip', 'factura'); fd.append('furnizor', l.emitent || l.vanzator); fd.append('suma', String(l.subtotal)); fd.append('mode', 'add')
    const r = await fetch('/api/tranzactii/doc', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (upRef.current) upRef.current.value = ''
    if (!r.ok) { setBusy(''); setEroare(d.error || 'Factura nu s-a încărcat'); return }
    const docId = d.documents?.[0]?.docId || d.docId
    if (docId) await linie(l, { document_id: docId }); else { setBusy(''); await incarca(); onRefresh() }
  }

  async function sterge() {
    setBusy('sterge')
    await fetch(`/api/comenzi-marketplace?txId=${tx.id}`, { method: 'DELETE' })
    setBusy(''); setConfirmSterge(false); await incarca(); onRefresh()
  }

  const eroareEl = eroare && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)', marginTop: '8px' }}>{eroare}</div>

  // ---------- Editorul (citire AI / completare manuala / editare) ----------
  if (draft) {
    const suma = draft.linii.reduce((s, l) => s + (num(l.subtotal) || 0), 0)
    const dif = Math.round((num(draft.total) - suma) * 100) / 100
    return (
      <div style={{ padding: '0 28px 18px' }}>
        <div style={box}>
          <div className="eyebrow" style={{ marginBottom: '10px' }}>Comandă cu mai mulți vânzători · verifică și salvează</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            <label style={{ display: 'grid', gap: '3px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Platformă<input style={inp} value={draft.platforma} onChange={e => setDraft({ ...draft, platforma: e.target.value })} /></label>
            <label style={{ display: 'grid', gap: '3px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Nr. comandă<input style={inp} value={draft.numar_comanda} onChange={e => setDraft({ ...draft, numar_comanda: e.target.value })} /></label>
            <label style={{ display: 'grid', gap: '3px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Data comenzii<input style={inp} type="date" value={draft.data_comanda} onChange={e => setDraft({ ...draft, data_comanda: e.target.value })} /></label>
            <label style={{ display: 'grid', gap: '3px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Total comandă<input style={inp} inputMode="decimal" value={draft.total} onChange={e => setDraft({ ...draft, total: e.target.value })} /></label>
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {draft.linii.map((l, i) => (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', opacity: l.stare === 'anulata' ? .55 : 1, paddingBottom: '6px', borderBottom: '1px dashed var(--border-subtle)' }}>
                <input style={{ ...inp, flex: '1 1 160px' }} placeholder="Vânzător (ex. Flanco)" value={l.vanzator} aria-label="Vânzător" onChange={e => setDraft({ ...draft, linii: draft.linii.map((x, j) => j === i ? { ...x, vanzator: e.target.value } : x) })} />
                <input style={{ ...inp, flex: '1 1 160px' }} placeholder="Emitent factură (opțional)" value={l.emitent || ''} aria-label="Emitent factură" onChange={e => setDraft({ ...draft, linii: draft.linii.map((x, j) => j === i ? { ...x, emitent: e.target.value } : x) })} />
                <input style={{ ...inp, width: '110px', textAlign: 'right', fontFamily: 'var(--font-mono)' }} inputMode="decimal" placeholder="0,00" value={l.subtotal} aria-label="Subtotal" onChange={e => setDraft({ ...draft, linii: draft.linii.map((x, j) => j === i ? { ...x, subtotal: e.target.value } : x) })} />
                <label style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}><input type="checkbox" checked={l.stare === 'anulata'} onChange={e => setDraft({ ...draft, linii: draft.linii.map((x, j) => j === i ? { ...x, stare: e.target.checked ? 'anulata' : 'asteptata' } : x) })} />anulat</label>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="Șterge rândul" onClick={() => setDraft({ ...draft, linii: draft.linii.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft({ ...draft, linii: [...draft.linii, { vanzator: '', emitent: null, subtotal: '', stare: 'asteptata' }] })}>+ Vânzător</button>
            <span style={{ fontSize: 'var(--fs-sm)', color: Math.abs(dif) > 0.01 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
              {draft.linii.length} {draft.linii.length === 1 ? 'vânzător' : 'vânzători'} · {lei(suma)} din {lei(num(draft.total) || 0)}{Math.abs(dif) > 0.01 ? ` · diferență ${lei(dif)} (transport / reduceri?)` : ' ✓'}
              {Math.abs(num(draft.total) - tx.suma) > 0.01 && <span style={{ color: 'var(--warning)' }}> · plata din extras: {lei(tx.suma)}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy === 'salveaza'} onClick={salveaza}>{busy === 'salveaza' ? 'Se salvează…' : 'Salvează comanda'}</button>
            <button type="button" className="btn btn-sm" onClick={() => { setDraft(null); setEroare('') }}>Anulează</button>
          </div>
          {eroareEl}
        </div>
      </div>
    )
  }

  // ---------- Fara comanda: oferta de impartire ----------
  if (!st.comanda) {
    return (
      <div style={{ padding: '0 28px 18px' }}>
        <div style={{ ...box, background: 'var(--surface-sunken)', borderStyle: 'dashed' }}>
          <button type="button" onClick={() => setDeschis(d => !d)} aria-expanded={deschis} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '10px', border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' }}>
            <span><strong style={{ fontSize: 'var(--fs-md)' }}>Comandă cu mai mulți vânzători?</strong> <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>eMAG, Trendyol, Altex… — o plată, mai multe facturi</span></span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{deschis ? 'Închide' : 'Împarte pe facturi'}</span>
          </button>
          {deschis && (
            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {st.lipsaMigrare && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warning)' }}>Comenzile nu se pot salva încă — rulează migrarea SQL pentru comenzile marketplace.</div>}
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Încarcă o captură sau PDF-ul comenzii (pagina „Comenzile mele” sau mailul de confirmare) ori lipește textul ei. AI-ul extrage vânzătorii și subtotalurile; fiecare devine o factură așteptată.</div>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="(opțional) Lipește aici textul comenzii…" rows={3} style={{ ...inp, height: 'auto', padding: '8px', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && citeste(e.target.files[0])} />
                <button type="button" className="btn btn-sm btn-primary" disabled={!!busy || st.lipsaMigrare} onClick={() => fileRef.current?.click()}>{busy === 'citeste' ? 'Citesc comanda…' : 'Încarcă captura / PDF'}</button>
                <button type="button" className="btn btn-sm" disabled={!!busy || !text.trim() || st.lipsaMigrare} onClick={() => citeste()}>Citește textul</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={st.lipsaMigrare} onClick={() => setDraft(draftNou())}>Completez manual</button>
              </div>
              {eroareEl}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------- Comanda salvata: reconcilierea ----------
  const c = st.comanda
  const active = st.linii.filter(l => l.stare !== 'anulata')
  const primite = active.filter(l => l.stare === 'primita')
  const lipsa = active.filter(l => l.stare === 'asteptata')
  const sumaPrimita = primite.reduce((s, l) => s + l.subtotal, 0), sumaActiva = active.reduce((s, l) => s + l.subtotal, 0)
  const nefolosite = st.docs.filter(d => !st.linii.some(l => l.document_id === d.id))
  const completa = lipsa.length === 0

  return (
    <div style={{ padding: '0 28px 18px' }}>
      <input ref={upRef} type="file" accept="application/pdf,image/png,image/jpeg" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && incarcaFactura(e.target.files[0])} />
      <div style={{ ...box, borderColor: completa ? 'color-mix(in srgb, var(--success) 40%, var(--border))' : 'color-mix(in srgb, var(--warning) 45%, var(--border))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">{c.platforma} · comanda {c.numar_comanda || '—'}{c.data_comanda ? ` · ${c.data_comanda.split('-').reverse().join('.')}` : ''}</div>
            <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, marginTop: '3px', color: completa ? 'var(--success)' : 'var(--text-primary)' }}>
              {completa ? `✓ Toate cele ${active.length} facturi sunt atașate` : `${primite.length} din ${active.length} facturi · lipsesc ${lipsa.length} (${lei(lipsa.reduce((s, l) => s + l.subtotal, 0))} lei)`}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-md)', fontWeight: 600 }}>{lei(sumaPrimita)} / {lei(sumaActiva)} lei</span>
        </div>
        <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-sunken)', overflow: 'hidden', margin: '10px 0 6px' }}>
          <div style={{ height: '100%', width: `${sumaActiva ? Math.min(100, sumaPrimita / sumaActiva * 100) : 0}%`, background: completa ? 'var(--success)' : 'var(--warning)', borderRadius: 'inherit' }} />
        </div>

        <div style={{ display: 'grid' }}>
          {st.linii.map(l => {
            const d = st.docs.find(x => x.id === l.document_id)
            const cand = st.candidati?.[l.id] || []
            const lucru = busy === l.id
            return (
              <div key={l.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'flex-start', padding: '9px 0', borderTop: '1px solid var(--border-subtle)', opacity: l.stare === 'anulata' ? .6 : 1 }}>
                <span style={{ flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%', marginTop: '6px', background: l.stare === 'primita' ? 'var(--success)' : l.stare === 'anulata' ? 'var(--text-muted)' : 'var(--warning)' }} />
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, textDecoration: l.stare === 'anulata' ? 'line-through' : 'none' }}>{l.vanzator}{l.emitent && l.emitent !== l.vanzator && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}> · factura de la {l.emitent}</span>}</div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {l.stare === 'primita' && d ? <>factura {d.numar_document || ''} <button type="button" onClick={() => deschideDocument(`/api/tranzactii/document?id=${encodeURIComponent(d.id)}`, d.fisier_nume || 'factura')} style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>{d.fisier_nume}</button>{d.suma != null && Math.abs(Number(d.suma) - l.subtotal) > 0.05 && <span style={{ color: 'var(--warning)' }}> · suma facturii {lei(Number(d.suma))} ≠ {lei(l.subtotal)}</span>}</>
                      : l.stare === 'anulata' ? <>anulat / returnat{l.nota ? ` · ${l.nota}` : ''}</>
                      : 'factură în așteptare'}
                  </div>
                  {l.stare === 'asteptata' && (cand.length > 0 || nefolosite.length > 0) && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {cand.map(x => <button key={x.id} type="button" className="btn btn-sm" style={{ height: 'auto', minHeight: '28px', whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%' }} disabled={lucru} title={x.fisier_nume} onClick={() => ataseazaInbox(l, x)}>Găsită: {x.furnizor?.split('|')[0] || x.fisier_nume} {lei(x.suma)} → atașează</button>)}
                      {nefolosite.length > 0 && (
                        <select aria-label="Alege dintre facturile atașate plății" value="" disabled={lucru} onChange={e => e.target.value && linie(l, { document_id: e.target.value })} style={{ ...inp, height: '28px', fontSize: 'var(--fs-xs)' }}>
                          <option value="">Alege dintre facturile atașate…</option>
                          {nefolosite.map(x => <option key={x.id} value={x.id}>{(x.furnizor || '').split('|')[0] || x.fisier_nume} · {x.suma != null ? lei(Number(x.suma)) : '—'}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: '5px', marginLeft: 'auto' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-md)', fontWeight: 600 }}>{lei(l.subtotal)}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {l.stare === 'asteptata' && <button type="button" className="btn btn-sm btn-primary" disabled={lucru} onClick={() => { setUpLinie(l); upRef.current?.click() }}>{lucru ? '…' : 'Încarcă factura'}</button>}
                    {l.stare === 'asteptata' && <button type="button" className="btn btn-sm btn-ghost" disabled={lucru} title="Produs anulat sau returnat — nu vine factură" onClick={() => linie(l, { stare: 'anulata' })}>Anulat</button>}
                    {l.stare === 'anulata' && <button type="button" className="btn btn-sm btn-ghost" disabled={lucru} onClick={() => linie(l, { stare: 'asteptata' })}>Reactivează</button>}
                    {l.stare === 'primita' && <button type="button" className="btn btn-sm btn-ghost" disabled={lucru} title="Desparte factura de acest vânzător" onClick={() => linie(l, { document_id: null })}>Desparte</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {Math.abs(c.total - st.linii.reduce((s, l) => s + l.subtotal, 0)) > 0.01 && (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginTop: '6px' }}>Suma vânzătorilor diferă de totalul comenzii cu {lei(c.total - st.linii.reduce((s, l) => s + l.subtotal, 0))} lei (transport / reduceri) — e notat pentru contabil.</div>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(dinComanda())}>Editează comanda</button>
          {confirmSterge
            ? <><button type="button" className="btn btn-sm" style={{ color: 'var(--danger)' }} disabled={busy === 'sterge'} onClick={sterge}>Confirm: șterge împărțirea</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmSterge(false)}>Nu</button></>
            : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmSterge(true)}>Șterge împărțirea</button>}
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', alignSelf: 'center' }}>Facturile atașate plății rămân; se șterge doar lista de vânzători.</span>
        </div>
        {eroareEl}
      </div>
    </div>
  )
}
