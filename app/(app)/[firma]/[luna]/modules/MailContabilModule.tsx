'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import VeziButon from '@/components/ui/VeziButon'
import { CATEGORII, draftRaspuns, type MailContabil, type Punct, type StatusPunct } from '@/lib/mail-contabil-tipuri'
import PachetContabil from './PachetContabil'

interface Firma { id: string; slug: string; nume: string; culoare: string }
type Mail = MailContabil & { imaginiUrl?: string[] }

const STATUS: Record<StatusPunct, { label: string; cls: string }> = {
  rezolvat: { label: '✓ Rezolvat', cls: 'badge badge-success' },
  partial: { label: 'Parțial', cls: 'badge badge-warning' },
  nerezolvat: { label: 'De făcut', cls: 'badge badge-danger' },
  neclar: { label: 'Neclar', cls: 'badge badge-warning' },
  nou: { label: 'Se verifică…', cls: 'badge' },
}
const SURSA: Record<string, string> = { tranzactie: 'Extras', document: 'Document', factura_5stardesk: '5StarDesk', rezervare: 'Borderou', factura_asteptata: 'De asociat' }
const statusEfectiv = (p: Punct): StatusPunct => p.rezolvatManual ? 'rezolvat' : p.status
const lei = (v: number | null) => v == null ? '' : `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} lei`
const MUTED: React.CSSProperties = { fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }
const INP: React.CSSProperties = { width: '100%', fontSize: 'var(--fs-md)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }

function toast(text: string, tip: 'ok' | 'err' = 'ok') { window.dispatchEvent(new CustomEvent('cf:toast', { detail: { text, tone: tip === 'ok' ? 'success' : 'error' } })) }

// Capturile de ecran se micsoreaza in browser (max 2000px, JPEG) - corpul cererii ramane mic.
async function micsoreaza(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url })
    const k = Math.min(1, 2000 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88)
  } finally { URL.revokeObjectURL(url) }
}

function MailNou({ firma, lunaId, onCreat }: { firma: Firma; lunaId: string; onCreat: (m: Mail) => void }) {
  const [text, setText] = useState('')
  const [imagini, setImagini] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function adauga(files: File[]) {
    const img = files.filter(f => f.type.startsWith('image/'))
    if (!img.length) return
    const noi = await Promise.all(img.map(micsoreaza))
    setImagini(prev => [...prev, ...noi].slice(0, 6))
  }

  async function trimite() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/mail-contabil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, lunaId, text, imagini }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Citirea mailului a eșuat'); return }
      setText(''); setImagini([])
      onCreat(d.mail)
    } catch { setError('Conexiunea s-a întrerupt') } finally { setBusy(false) }
  }

  return (
    <div className="card card-pad" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); adauga([...e.dataTransfer.files]) }}>
      <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Mail nou de la contabil</div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '2px 0 12px' }}>
        Lipește textul mailului sau o captură de ecran (Ctrl/⌘+V, tragere sau buton). AI-ul îl împarte în situații, caută fiecare situație în ContaFlow (extrase, documente, facturi 5StarDesk, borderouri — toate lunile) și spune ce e deja rezolvat și ce mai e de făcut.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={e => { const f = [...e.clipboardData.files]; if (f.some(x => x.type.startsWith('image/'))) { e.preventDefault(); adauga(f) } }}
        placeholder="Bună ziua, rog să mă ajutați cu următoarele lipsuri…"
        rows={6}
        style={{ ...INP, resize: 'vertical' }}
      />
      {imagini.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {imagini.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Captura ${i + 1}`} style={{ height: '72px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }} />
              <button className="btn btn-sm btn-icon" aria-label="Elimină captura" onClick={() => setImagini(prev => prev.filter((_, k) => k !== i))} style={{ position: 'absolute', top: '-8px', right: '-8px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', marginTop: '8px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={trimite} disabled={busy || (!text.trim() && !imagini.length)}>{busy ? 'AI-ul citește mailul…' : 'Analizează cu AI'}</button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>Adaugă captură</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { adauga([...(e.target.files || [])]); e.target.value = '' }} />
        {busy && <span style={MUTED}>durează ~20-30 secunde</span>}
      </div>
    </div>
  )
}

function PunctCard({ p, mailId, onSchimbat, onReverifica, reverificare }: { p: Punct; mailId: string; onSchimbat: (puncte: Punct[]) => void; onReverifica: () => void; reverificare: boolean }) {
  const [nota, setNota] = useState(p.nota || '')
  const [dovezi, setDovezi] = useState(false)
  const [busy, setBusy] = useState(false)
  const st = statusEfectiv(p)

  async function salveaza(patch: { rezolvatManual?: boolean; nota?: string }) {
    setBusy(true)
    const res = await fetch('/api/mail-contabil', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mailId, punctId: p.id, ...patch }) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) onSchimbat(d.puncte); else toast(d.error || 'Salvarea a eșuat', 'err')
    setBusy(false)
  }

  return (
    <div style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', opacity: st === 'rezolvat' ? 0.85 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span className="badge">{CATEGORII[p.categorie] || p.categorie}</span>
        <span style={{ flex: '1 1 200px', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', minWidth: 0 }}>{p.titlu}</span>
        {p.sumaDiferenta != null && <span className="num" style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, color: 'var(--warning)' }}>dif. {lei(p.sumaDiferenta)}</span>}
        <span className={STATUS[st].cls}>{reverificare ? 'Se verifică…' : STATUS[st].label}</span>
      </div>
      {p.citat && <div style={{ ...MUTED, fontStyle: 'italic' }}>„{p.citat}”</div>}
      {p.constatare && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Ce am găsit:</b> {p.constatare}</div>}
      {p.recomandare && st !== 'rezolvat' && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', borderLeft: '3px solid var(--accent)' }}>
          <b>Ce e de făcut:</b> {p.recomandare}
          {p.pasi.length > 0 && <ol style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--text-secondary)' }}>{p.pasi.map((x, i) => <li key={i}>{x}</li>)}</ol>}
        </div>
      )}
      {p.analizatAt && (
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => setDovezi(v => !v)} style={{ paddingLeft: 0 }}>
            {dovezi ? '▾' : '▸'} Căutat în platformă: {p.dovezi.length ? `${p.dovezi.length} rezultate` : 'nimic găsit'}
          </button>
          {dovezi && p.dovezi.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              {p.dovezi.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', fontSize: 'var(--fs-sm)', padding: '6px 8px', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }}>
                  <span className="badge" style={{ flexShrink: 0 }}>{SURSA[d.sursa] || d.sursa}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 550 }}>{d.titlu}</span>
                  <span style={{ ...MUTED, flex: '1 1 220px', minWidth: 0 }}>{d.detalii}{d.luna ? ` · ${d.luna}` : ''} · potrivit după {d.potrivire || '—'}</span>
                  {d.documentUrl && <VeziButon url={d.documentUrl} nume={d.titlu} />}
                  {d.href && <Link href={d.href} prefetch={false} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--accent)' }}>Deschide</Link>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={nota} onChange={e => setNota(e.target.value)} onBlur={() => { if (nota !== (p.nota || '')) salveaza({ nota }) }}
          placeholder="Notă / ce am făcut (intră în răspunsul către contabil)" style={{ ...INP, flex: '1 1 240px', width: 'auto', padding: '6px 10px', fontSize: 'var(--fs-sm)' }} />
        <button className="btn btn-sm" onClick={onReverifica} disabled={reverificare}>Re-verifică</button>
        <button className={p.rezolvatManual ? 'btn btn-sm' : 'btn btn-sm btn-primary'} disabled={busy} onClick={() => salveaza({ rezolvatManual: !p.rezolvatManual, nota })}>
          {p.rezolvatManual ? 'Redeschide' : '✓ Am rezolvat'}
        </button>
      </div>
    </div>
  )
}

function MailCard({ m, onUpdate, onSters, deschis: deschisInit }: { m: Mail; onUpdate: (m: Mail) => void; onSters: () => void; deschis: boolean }) {
  const [deschis, setDeschis] = useState(deschisInit)
  const [original, setOriginal] = useState(false)
  const [raspuns, setRaspuns] = useState(false)
  const [lucru, setLucru] = useState<Set<string>>(new Set())
  const [arataRezolvate, setArataRezolvate] = useState(false)
  const mRef = useRef(m); mRef.current = m

  const verifica = useCallback(async (punctIds?: string[]) => {
    const ids = punctIds || mRef.current.puncte.filter(p => !p.analizatAt).map(p => p.id)
    if (!ids.length) return
    setLucru(prev => new Set([...prev, ...ids]))
    try {
      for (let i = 0; i < 10; i++) {
        const res = await fetch('/api/mail-contabil/analizeaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, punctIds }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { toast(d.error || 'Verificarea a eșuat', 'err'); break }
        onUpdate({ ...mRef.current, puncte: d.puncte })
        if (d.eroare) toast(`Unele situații nu au putut fi analizate: ${d.eroare}`, 'err')
        if (!d.ramase || punctIds) break
      }
    } catch { toast('Conexiunea s-a întrerupt', 'err') }
    setLucru(prev => { const n = new Set(prev); ids.forEach(x => n.delete(x)); return n })
  }, [m.id, onUpdate])

  // Situatiile inca neverificate (mail nou sau verificare intrerupta) se verifica automat.
  useEffect(() => { if (m.puncte.some(p => !p.analizatAt)) verifica() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rezolvate = m.puncte.filter(p => statusEfectiv(p) === 'rezolvat')
  const deFacut = m.puncte.filter(p => statusEfectiv(p) !== 'rezolvat')
  const textRaspuns = draftRaspuns(m)

  async function sterge() {
    if (!confirm('Ștergi acest mail și analiza lui?')) return
    const res = await fetch(`/api/mail-contabil?id=${m.id}`, { method: 'DELETE' })
    if (res.ok) onSters(); else toast('Ștergerea a eșuat', 'err')
  }

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => setDeschis(v => !v)} style={{ flex: '1 1 260px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>{deschis ? '▾' : '▸'} {m.subiect || 'Mail contabil'}</div>
          <div style={MUTED}>{m.data_mail ? `mail din ${m.data_mail.split('-').reverse().join('.')} · ` : ''}adăugat {new Date(m.created_at).toLocaleDateString('ro-RO')} · {m.puncte.length} situații</div>
        </button>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {deFacut.length > 0 ? <span className="badge badge-danger">{deFacut.length} de rezolvat</span> : <span className="badge badge-success">✓ tot rezolvat</span>}
          {rezolvate.length > 0 && <span className="badge badge-success">{rezolvate.length} rezolvate</span>}
          {lucru.size > 0 && <span className="badge">se verifică {lucru.size}…</span>}
        </div>
      </div>

      {deschis && (
        <>
          {m.rezumat && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>{m.rezumat}</p>}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => setRaspuns(v => !v)}>{raspuns ? 'Ascunde răspunsul' : 'Răspuns către contabil'}</button>
            <button className="btn btn-sm" onClick={() => verifica(m.puncte.filter(p => !p.rezolvatManual).map(p => p.id))} disabled={lucru.size > 0}>Re-verifică tot</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setOriginal(v => !v)}>{original ? 'Ascunde mailul' : 'Mailul original'}</button>
            <button className="btn btn-sm btn-ghost" onClick={sterge} style={{ color: 'var(--danger)' }}>Șterge</button>
          </div>

          {original && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {m.text_mail && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: 'var(--r-md)', margin: 0 }}>{m.text_mail}</pre>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(m.imaginiUrl || []).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Captura ${i + 1}`} style={{ maxWidth: '100%', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }} /></a>)}
            </div>
          )}

          {raspuns && (
            <div>
              <textarea readOnly value={textRaspuns} rows={Math.min(18, textRaspuns.split('\n').length + 1)} style={{ ...INP, resize: 'vertical', fontSize: 'var(--fs-sm)' }} />
              <button className="btn btn-sm" style={{ marginTop: '6px' }} onClick={() => navigator.clipboard.writeText(textRaspuns).then(() => toast('Răspuns copiat'))}>Copiază răspunsul</button>
              <span style={{ ...MUTED, marginLeft: '8px' }}>Compus din constatările AI; notele tale au prioritate.</span>
            </div>
          )}

          {deFacut.map(p => <PunctCard key={p.id} p={p} mailId={m.id} reverificare={lucru.has(p.id)} onReverifica={() => verifica([p.id])} onSchimbat={puncte => onUpdate({ ...mRef.current, puncte })} />)}
          {rezolvate.length > 0 && (
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => setArataRezolvate(v => !v)} style={{ paddingLeft: 0 }}>{arataRezolvate ? '▾' : '▸'} Rezolvate ({rezolvate.length})</button>
              {arataRezolvate && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {rezolvate.map(p => <PunctCard key={p.id} p={p} mailId={m.id} reverificare={lucru.has(p.id)} onReverifica={() => verifica([p.id])} onSchimbat={puncte => onUpdate({ ...mRef.current, puncte })} />)}
              </div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function MailContabilModule({ firma, lunaId }: { firma: Firma; lunaId: string }) {
  const [mailuri, setMailuri] = useState<Mail[] | null>(null)
  const [error, setError] = useState('')
  const [nou, setNou] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/mail-contabil?firmaId=${firma.id}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setMailuri(d.mailuri || [])
    }).catch(() => setError('Conexiunea s-a întrerupt'))
  }, [firma.id])

  const update = useCallback((m: Mail) => setMailuri(prev => (prev || []).map(x => x.id === m.id ? { ...x, ...m } : x)), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PachetContabil firma={firma} lunaId={lunaId} raspuns={mailuri?.length ? draftRaspuns(mailuri[0]) : null} />
      <MailNou firma={firma} lunaId={lunaId} onCreat={m => { setNou(m.id); setMailuri(prev => [m, ...(prev || [])]) }} />
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{error}</p>}
      {mailuri === null && !error && <div className="skeleton" style={{ height: '120px' }} />}
      {mailuri?.length === 0 && <div className="empty-state" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Niciun mail adăugat încă pentru {firma.nume}.</div>}
      {mailuri?.map((m, i) => (
        <MailCard key={m.id} m={m} deschis={m.id === nou || i === 0} onUpdate={update} onSters={() => setMailuri(prev => (prev || []).filter(x => x.id !== m.id))} />
      ))}
    </div>
  )
}
