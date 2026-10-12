'use client'
import { useState } from 'react'
import Icon from '@/components/ui/Icon'

// "Completeaza din memoria proiectului": propune continutul raportului lunar (autorizatii, obiective,
// activitati) din memoria proiectului + planul de afaceri + datele ContaFlow. Utilizatorul vede
// propunerea si o aplica in raport (campurile se salveaza apoi automat, ca la editarea manuala).
export interface PropunereRaport { perioada: string; dataRaport: string; autorizatii: string[]; obiective: string[]; activitati: string[]; lipsuri: string[]; surse: string[]; memorieFolosita: number }

const box: React.CSSProperties = { border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))', borderRadius: 16, padding: '18px 20px', background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 70%, var(--surface)) 0%, var(--surface) 55%)', display: 'grid', gap: 14, boxShadow: 'var(--shadow-xs)' }
const chip: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)' }
const MUTED: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }

function lunaImplicita(luna: string): string {
  const m = luna.match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : new Date().toISOString().slice(0, 7)
}

export default function RaportDinMemorie({ firmaId, luna, onApply }: { firmaId: string; luna: string; onApply: (p: PropunereRaport) => void }) {
  const [deschis, setDeschis] = useState(false)
  const [lunaRaport, setLunaRaport] = useState(lunaImplicita(luna))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prop, setProp] = useState<PropunereRaport | null>(null)

  async function genereaza() {
    setBusy(true); setError(''); setProp(null)
    try {
      const r = await fetch('/api/proiect/raport-din-memorie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, luna: lunaRaport }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Propunerea nu a putut fi generată')
      setProp(d)
    } catch (e) { setError(e instanceof Error ? e.message : 'Eroare') } finally { setBusy(false) }
  }

  if (!deschis) return (
    <div style={{ ...box, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={chip}><Icon name="sparkles" size={18} /></div>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 'var(--fs-base)', color: 'var(--text-primary)' }}>Completează din memoria proiectului</div>
        <div style={{ ...MUTED, marginTop: 2, lineHeight: 1.5 }}>AI-ul propune autorizațiile, obiectivele și activitățile lunii din ce s-a reținut în „Plan & AI proiect”. Tu verifici și aplici.</div>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => setDeschis(true)}><Icon name="sparkles" size={14} /> Completează cu AI</button>
    </div>
  )

  const Lista = ({ titlu, items }: { titlu: string; items: string[] }) => (
    <div>
      <div style={{ fontWeight: 650, color: 'var(--text-primary)', fontSize: 'var(--fs-md)' }}>{titlu}</div>
      {items.length ? <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <div style={MUTED}>—</div>}
    </div>
  )

  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={chip}><Icon name="sparkles" size={18} /></div>
        <div style={{ fontWeight: 650, fontSize: 'var(--fs-base)', color: 'var(--text-primary)', flex: 1, minWidth: 200 }}>Completează din memoria proiectului</div>
        <label style={MUTED}>Luna raportată{' '}
          <input type="month" value={lunaRaport} onChange={e => { setLunaRaport(e.target.value); setProp(null) }}
            style={{ fontSize: 'var(--fs-sm)', height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
        </label>
        <button type="button" className="btn btn-primary" onClick={genereaza} disabled={busy || !lunaRaport}>{busy ? 'Pregătesc propunerea…' : prop ? 'Generează din nou' : 'Generează propunerea'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setDeschis(false); setProp(null) }}>Închide</button>
      </div>
      {busy && <div style={MUTED}>Citesc memoria proiectului, planul și starea activităților (~20–40 s)…</div>}
      {error && <div role="alert" style={{ ...MUTED, color: 'var(--danger)' }}>{error}</div>}
      {prop && (
        <>
          <div style={MUTED}>Perioada: <strong>{prop.perioada}</strong> · {prop.memorieFolosita ? `${prop.memorieFolosita} fapte din memoria lunii` : 'nicio intrare în memorie pentru luna asta — propunerea se bazează pe raportul anterior și pe plan'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <Lista titlu="1. Autorizații" items={prop.autorizatii} />
            <Lista titlu="2. Obiective realizate" items={prop.obiective} />
            <Lista titlu="4. Activități derulate" items={prop.activitati} />
          </div>
          {prop.lipsuri.length > 0 && <div style={{ border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)', background: 'var(--warning-soft)', borderRadius: 12, padding: '10px 14px' }}><Lista titlu="De verificat înainte de trimitere" items={prop.lipsuri} /></div>}
          {prop.surse.length > 0 && <details><summary style={{ ...MUTED, cursor: 'pointer' }}>Surse ({prop.surse.length})</summary><ul style={{ ...MUTED, paddingLeft: 18, margin: '4px 0 0' }}>{prop.surse.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => { onApply(prop); setDeschis(false); setProp(null) }}>Aplică în raport</button>
            <span style={MUTED}>Înlocuiește perioada, autorizațiile, obiectivele și activitățile din raport; poți edita apoi orice rând.</span>
          </div>
        </>
      )}
    </div>
  )
}
