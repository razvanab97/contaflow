'use client'
import VeziButon from '@/components/ui/VeziButon'
import { useEffect, useState, useCallback } from 'react'
import ProiectWorkflow from '@/components/ProiectWorkflow'
import SincronizareProiectMail from './proiect-mail/SincronizareProiectMail'
import { ProceduraAchizitii, BugetAchizitii, PasiAchizitie, AchizitieNoua, type AchizitieNouaDate } from './SistemAchizitii'
import type { DocDosar, LinieBuget } from '@/lib/achizitii-procedura'

interface Achizitie {
  id: string
  denumire: string
  valoare: number | null
  sursa: string | null
  status: string
  scadenta: string | null
  nota: string | null
  created_at: string
  linie_buget?: string | null
}
interface AchizitieDoc { id: string; fisier_nume: string; tip_document: string; created_at: string }
interface Sugestie {
  id: string
  achizitie_id: string | null
  actiune: 'creare' | 'actualizare_status' | 'neclar'
  denumire: string | null
  valoare: number | null
  sursa: string | null
  status_propus: string | null
  incredere: 'sigur' | 'posibil'
  sursa_subiect: string | null
  sursa_data: string | null
  sursa_rezumat: string | null
}

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string }

const STATUS_ORDER = ['oferta', 'nota_semnata', 'plata_initiata', 'dovada_trimisa', 'finalizat'] as const
const STATUS_LABEL: Record<string, string> = {
  oferta: 'Ofertă',
  nota_semnata: 'Notă semnată',
  plata_initiata: 'Plată inițiată',
  dovada_trimisa: 'Dovadă trimisă',
  finalizat: 'Finalizat',
}

const INP: React.CSSProperties = { fontSize: 'var(--fs-md)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-md)', padding: '8px 12px', color: 'var(--c-dddddd)', outline: 'none' }

// Tipurile de documente din dosarul de achizitie (vezi lib/achizitii-procedura.ts) - numele ales intra
// in numele fisierului, ca verificarea dosarului sa-l recunoasca.
const TIPURI_DOSAR: Record<string, string> = { cerere: 'Cerere de ofertă (Anexa 2)', oferta: 'Ofertă', nota: 'Notă privind determinarea valorii (Anexa 1)', contract: 'Contract', proforma: 'Proformă / comandă', factura: 'Factură fiscală', plata: 'Dovadă plată (extras / OP)', pv: 'PV recepție (Anexa 3)', poza: 'Poză echipament' }

function AchizitieDocumente({ achizitieId, culoare, etapaCuranta, onChange }: { achizitieId: string; culoare: string; etapaCuranta: string; onChange?: () => void }) {
  const [docs, setDocs] = useState<AchizitieDoc[]>([])
  const [busy, setBusy] = useState(false)
  const [tipDosar, setTipDosar] = useState('')

  const load = useCallback(() => {
    fetch(`/api/achizitii/documente?achizitieId=${achizitieId}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []))
  }, [achizitieId])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('achizitieId', achizitieId); fd.append('etapa', etapaCuranta)
    if (tipDosar) fd.append('tipDosar', tipDosar)
    await fetch('/api/achizitii/documente', { method: 'POST', body: fd })
    onChange?.()
    setBusy(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Ștergi documentul?')) return
    await fetch(`/api/chitante/document?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--c-999999)' }}>
          <span style={{ padding: '1px 6px', borderRadius: 'var(--r-full)', background: 'var(--c-1a1a1a)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-777777)' }}>{STATUS_LABEL[d.tip_document] || d.tip_document}</span>
          <VeziButon url={`/api/chitante/document?id=${d.id}`} />
          <a href={`/api/chitante/document?id=${d.id}`} style={{ color:'var(--accent)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</a>
          <button onClick={() => remove(d.id)} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-xs)' }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <select value={tipDosar} onChange={e => setTipDosar(e.target.value)} aria-label="Tipul documentului" style={{ fontSize: 'var(--fs-xs)', padding: '3px 6px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}>
        <option value="">Tip document…</option>
        {Object.entries(TIPURI_DOSAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color:'var(--accent)', cursor: 'pointer', opacity: busy ? .5 : 1 }}>
        {busy ? 'Se încarcă...' : `+ Adaugă document${tipDosar ? ` (${TIPURI_DOSAR[tipDosar]})` : ` (${STATUS_LABEL[etapaCuranta]})`}`}
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={busy}
          onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = '' }} />
      </label>
      </div>
    </div>
  )
}

function SugestieBanner({ s, culoare, onConfirm, onReject, busy }: { s: Sugestie; culoare: string; onConfirm: () => void; onReject: () => void; busy: boolean }) {
  const sigur = s.incredere === 'sigur'
  const titlu = s.actiune === 'actualizare_status' && s.status_propus
    ? `Mail propune trecerea la etapa "${STATUS_LABEL[s.status_propus] || s.status_propus}"`
    : s.actiune === 'neclar'
      ? 'Mail posibil legat de o achiziție, dar neclar'
      : `Achiziție nouă găsită în email${s.denumire ? `: ${s.denumire}` : ''}`
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap',
      padding: '10px 12px', borderRadius: 'var(--r-md)', marginTop: '10px',
      background: sigur ? 'rgba(74,222,128,.08)' : 'rgba(251,146,60,.08)',
      border: `1px solid ${sigur ? 'rgba(74,222,128,.3)' : 'rgba(251,146,60,.3)'}`,
      opacity: busy ? .6 : 1,
    }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: sigur ? 'var(--success)' : 'var(--warning)' }}>✨ {titlu}</div>
        {s.valoare != null && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-999999)', marginTop: '2px' }}>{s.valoare.toLocaleString('ro-RO')} RON{s.sursa ? ` · ${s.sursa}` : ''}</div>}
        {s.sursa_rezumat && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-999999)', marginTop: '3px' }}>{s.sursa_rezumat}</div>}
        {(s.sursa_subiect || s.sursa_data) && (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-666666)', marginTop: '3px' }}>
            {s.sursa_subiect}{s.sursa_data ? ` · ${new Date(s.sursa_data).toLocaleDateString('ro-RO')}` : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button onClick={onConfirm} disabled={busy || (s.actiune !== 'actualizare_status' && !s.denumire)} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--accent-solid)', color: '#08210f', cursor: 'pointer', opacity: (s.actiune !== 'actualizare_status' && !s.denumire) ? .5 : 1 }}>Confirmă</button>
        <button onClick={onReject} disabled={busy} style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-888888)', background: 'transparent', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-sm)', padding: '6px 10px', cursor: 'pointer' }}>Respinge</button>
      </div>
    </div>
  )
}

export default function AchizitiiModule({ firma, lunaId }: Props) {
  const [items, setItems] = useState<Achizitie[] | null>(null)
  const [sugestii, setSugestii] = useState<Sugestie[]>([])
  const [sugestieBusy, setSugestieBusy] = useState<string | null>(null)
  const [dosare, setDosare] = useState<Record<string, DocDosar[]>>({})
  const [pornesteBusy, setPornesteBusy] = useState<string | null>(null)
  const [eroare, setEroare] = useState('')
  // Formularul Word deschis din pasii unei achizitii (cerere / nota / receptie) + reimprospatare documente
  const [formular, setFormular] = useState<{ id: string; kind: 'oferta' | 'nota' | 'receptie' } | null>(null)
  const [versiuneDocs, setVersiuneDocs] = useState(0)
  const [tab, setTab] = useState<'curs' | 'finalizate' | 'buget' | 'procedura'>('curs')
  const [formNou, setFormNou] = useState(false)
  const [creez, setCreez] = useState(false)

  async function creeazaNoua(d: AchizitieNouaDate) {
    setCreez(true); setEroare('')
    const res = await fetch('/api/achizitii', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, lunaId, ...d }) }).catch(() => null)
    setCreez(false)
    if (!res?.ok) { setEroare('Achiziția nu a putut fi creată'); return }
    setFormNou(false); setTab('curs'); load()
  }

  const load = useCallback(() => {
    fetch(`/api/achizitii?firmaId=${firma.id}`).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : []))
    fetch(`/api/achizitii/sugestii?firmaId=${firma.id}`).then(r => r.json()).then(d => setSugestii(Array.isArray(d) ? d : []))
    fetch(`/api/achizitii/dosare?firmaId=${firma.id}`).then(r => r.json()).then(d => setDosare(d && !d.error ? d : {})).catch(() => {})
  }, [firma.id])

  // Achizitie noua pornita dintr-o linie de buget: denumire, buget (cu TVA) si sursa precompletate.
  async function porneste(l: LinieBuget) {
    setPornesteBusy(l.cod); setEroare('')
    const faraTva = Math.round((l.valoare / 1.21) * 100) / 100
    const res = await fetch('/api/achizitii', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      firmaId: firma.id, lunaId, denumire: l.denumire, valoare: l.valoare, sursa: l.sursa, linieBuget: l.cod,
      nota: `Linia de buget ${l.cod} (${l.sursa === 'grant' ? 'subvenție' : 'cofinanțare'}): ${l.valoare.toLocaleString('ro-RO')} lei cu TVA ≈ ${faraTva.toLocaleString('ro-RO')} lei fără TVA (buget maxim pentru oferte). Pasul 1: specificațiile minime + cererea de ofertă (Anexa 2) din „Formulare achiziție”.`,
    }) }).catch(() => null)
    setPornesteBusy(null)
    if (!res?.ok) { setEroare('Achiziția nu a putut fi pornită'); return }
    setTab('curs'); load()
  }
  async function patch(id: string, body: Record<string, unknown>, local: Partial<Achizitie>) {
    setEroare('')
    setItems(prev => prev ? prev.map(i => i.id === id ? { ...i, ...local } : i) : prev)
    const res = await fetch(`/api/achizitii/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    if (!res?.ok) { const d = res ? await res.json().catch(() => ({})) : {}; setEroare(d.error || 'Salvarea a eșuat'); load() }
  }

  useEffect(() => { load() }, [load])

  async function confirmSugestie(id: string) {
    setSugestieBusy(id)
    await fetch('/api/achizitii/sugestii/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestieId: id }) })
    setSugestieBusy(null)
    load()
  }

  async function respingeSugestie(id: string) {
    setSugestieBusy(id)
    setSugestii(prev => prev.filter(s => s.id !== id))
    await fetch('/api/achizitii/sugestii/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sugestieId: id }) })
    setSugestieBusy(null)
  }



  async function setStatus(id: string, status: string) {
    setItems(prev => prev ? prev.map(i => i.id === id ? { ...i, status } : i) : prev)
    await fetch(`/api/achizitii/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
  }

  async function remove(id: string) {
    if (!confirm('Ștergi achiziția și toate documentele ei?')) return
    await fetch(`/api/achizitii/${id}`, { method: 'DELETE' })
    load()
  }

  if (!items) return <div style={{ padding: '24px', fontSize: 'var(--fs-md)', color: 'var(--c-999999)' }}>Se încarcă...</div>

  const sugestiiNoi = sugestii.filter(s => !s.achizitie_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SincronizareProiectMail firmaId={firma.id} culoare={firma.culoare} onSynced={load} />

      {/* Navigare: ce e în lucru, ce s-a terminat, bugetul, procedura - plus achiziție nouă */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {([['curs', `În curs (${items.filter(i => i.status !== 'finalizat').length})`], ['finalizate', `Finalizate (${items.filter(i => i.status === 'finalizat').length})`], ['buget', 'Buget'], ['procedura', 'Procedura']] as const).map(([k, et]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ height: '36px', padding: '0 16px', borderRadius: 'var(--r-full)', fontSize: 'var(--fs-md)', fontWeight: tab === k ? 700 : 550, cursor: 'pointer', border: `1px solid ${tab === k ? 'var(--accent-solid)' : 'var(--border)'}`, background: tab === k ? 'var(--accent-solid)' : 'var(--surface)', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>{et}</button>
        ))}
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setFormNou(true); setTab('curs') }}>+ Achiziție nouă</button>
      </div>
      {eroare && <div role="alert" style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{eroare}</div>}
      {formNou && <AchizitieNoua items={items} busy={creez} onCreeaza={creeazaNoua} onAnuleaza={() => setFormNou(false)} />}

      {tab === 'procedura' && <ProceduraAchizitii deschisInitial />}
      {tab === 'buget' && <BugetAchizitii items={items} onPorneste={porneste} busy={pornesteBusy} />}

      {tab === 'curs' && sugestiiNoi.length > 0 && (
        <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-999999)', marginBottom: '4px' }}>Sugestii din email</div>
          {sugestiiNoi.map(s => (
            <SugestieBanner key={s.id} s={s} culoare={firma.culoare} busy={sugestieBusy === s.id}
              onConfirm={() => confirmSugestie(s.id)} onReject={() => respingeSugestie(s.id)} />
          ))}
        </div>
      )}

      {tab === 'curs' && !formNou && !items.some(i => i.status !== 'finalizat') && (
        <div style={{ padding: '28px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Nicio achiziție în curs</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', maxWidth: '560px' }}>Pornește una din bugetul planului de afaceri (liniile încă necumpărate) sau creează o achiziție nouă. Cele {items.filter(i => i.status === 'finalizat').length} finalizate sunt în tab-ul „Finalizate”.</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-primary" onClick={() => setFormNou(true)}>+ Achiziție nouă</button>
            <button type="button" className="btn" onClick={() => setTab('buget')}>Alege din buget</button>
          </div>
        </div>
      )}

      {(tab === 'curs' || tab === 'finalizate') && items.filter(i => (i.status === 'finalizat') === (tab === 'finalizate')).map((item, poz, lista) => {
        const idx = STATUS_ORDER.indexOf(item.status as typeof STATUS_ORDER[number])
        // titlu de grup: "În curs" / "Finalizate", la prima achizitie din fiecare grup
        const grupNou = poz === 0 || (lista[poz - 1].status === 'finalizat') !== (item.status === 'finalizat')
        const titluGrup = grupNou && poz === 0 && tab === 'finalizate' ? `${lista.length} achiziții finalizate — dosarele lor, cu ce mai lipsește pentru arhivă` : null
        const next = STATUS_ORDER[idx + 1]
        return (
          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {titluGrup && <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)', marginTop: poz ? '10px' : 0 }}>{titluGrup}</div>}
          <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--c-eeeeee)' }}>{item.denumire}</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {item.valoare != null ? `${item.valoare.toLocaleString('ro-RO')} RON` : 'fără valoare'} · {item.sursa === 'grant' ? 'subvenție' : item.sursa === 'cofinantare' ? 'cofinanțare' : item.sursa || 'sursă nealeasă'}
                </div>
                {item.nota && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '820px', lineHeight: 1.5 }}>{item.nota}</div>}
              </div>
              <button onClick={() => remove(item.id)} style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Șterge</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
              {STATUS_ORDER.map((s, i) => (
                <span key={s} style={{
                  fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-full)',
                  background: i <= idx ? `${firma.culoare}22` : 'var(--c-1a1a1a)',
                  color: i <= idx ? firma.culoare : 'var(--c-666666)',
                  border: `1px solid ${i <= idx ? firma.culoare : 'var(--c-262626)'}`,
                }}>
                  {STATUS_LABEL[s]}
                </span>
              ))}
              {next && (
                <button onClick={() => setStatus(item.id, next)} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-full)', border: 'none', background:'var(--accent-solid)', color: '#fff', cursor: 'pointer' }}>
                  → {STATUS_LABEL[next]}
                </button>
              )}
            </div>

            <PasiAchizitie item={item} docs={dosare[item.id] || []}
              onLinie={v => patch(item.id, { linieBuget: v || null }, { linie_buget: v || null })}
              onSursa={v => patch(item.id, { sursa: v || null }, { sursa: v || null })}
              onUploaded={() => { load(); setVersiuneDocs(v => v + 1) }}
              onGenereaza={k => { setFormular({ id: item.id, kind: k }); setTimeout(() => document.getElementById(`formulare-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }}
              onStatus={st => setStatus(item.id, st)} />

            <details id={`formulare-${item.id}`} open={formular?.id === item.id || undefined} style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, scrollMarginTop: '80px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-md)', fontWeight: 650, color: firma.culoare }}>Formulare achiziție (Word): cerere ofertă, notă estimare, recepție</summary>
              <div style={{ marginTop: 16 }}><ProiectWorkflow firmaId={firma.id} purchaseId={item.id} formKind={formular?.id === item.id ? formular.kind : undefined} /></div>
            </details>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>Toate documentele ({(dosare[item.id] || []).length})</summary>
              <AchizitieDocumente key={versiuneDocs} achizitieId={item.id} culoare={firma.culoare} etapaCuranta={item.status} onChange={load} />
            </details>

            {sugestii.filter(s => s.achizitie_id === item.id).map(s => (
              <SugestieBanner key={s.id} s={s} culoare={firma.culoare} busy={sugestieBusy === s.id}
                onConfirm={() => confirmSugestie(s.id)} onReject={() => respingeSugestie(s.id)} />
            ))}
          </div>
          </div>
        )
      })}
    </div>
  )
}
