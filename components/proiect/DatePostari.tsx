'use client'
import { useState } from 'react'

// „📅 Date din postări": AI citește Anexele (PDF cu capturi de postări), propune perioada de implementare,
// iar din ea datele actelor — Decizia cu 7 zile înainte de prima postare, Raportul la o lună după ultima.
// Confirmi, apoi se setează datele pe Decizie și Raport (le bagi în documente cu „✨ Pregătește").

interface Propunere {
  prima: string; ultima: string | null; perioadaText: string; nota?: string
  decizieData: string; raportData: string
  decizieDocId: string | null; decizieNume: string | null
  raportDocId: string | null; raportNume: string | null
  anexaNume: string | null
}
const roData = (iso?: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''
const mono: React.CSSProperties = { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }

export default function DatePostari({ firmaId, api, activitateId, zona, an, onActualizat }: {
  firmaId: string; api: string; activitateId?: string; zona?: string; an?: number
  onActualizat: (doc: unknown) => void
}) {
  const [busy, setBusy] = useState('')
  const [prop, setProp] = useState<Propunere | null>(null)
  const [mesaj, setMesaj] = useState('')
  const [gata, setGata] = useState('')

  async function citeste() {
    setBusy('r'); setMesaj(''); setGata(''); setProp(null)
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'date-din-postari', activitateId, zona, an }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.prima) setProp(d as Propunere)
      else setMesaj((d.error || 'Nu am putut citi anexele') + (d.nota ? ` (${d.nota})` : ''))
    } catch { setMesaj('Citirea a eșuat') } finally { setBusy('') }
  }
  async function aplica() {
    if (!prop) return
    setBusy('a'); setMesaj('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        firmaId, actiune: 'aplica-date-postari', activitateId,
        decizieDocId: prop.decizieDocId, decizieData: prop.decizieData,
        raportDocId: prop.raportDocId, raportData: prop.raportData, perioadaText: prop.perioadaText,
      }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMesaj(d.error || 'Nu s-au putut aplica datele'); return }
      if (d.decizie) onActualizat(d.decizie)
      if (d.raport) onActualizat(d.raport)
      setProp(null)
      setGata('Datele au fost puse pe acte. Apasă „✨ Pregătește" pe Decizie și pe Raport ca să intre data în document.')
    } catch { setMesaj('Aplicarea a eșuat') } finally { setBusy('') }
  }

  const randData = (eticheta: string, nume: string | null, data: string, gasit: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'var(--fs-xs)' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 54 }}>{eticheta}</span>
      {gasit
        ? <><strong style={{ ...mono, color: 'var(--text-primary)' }}>{roData(data)}</strong>{nume && <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 230 }}>· {nume}</span>}</>
        : <span style={{ color: 'var(--accent-amber, #e0a84a)' }}>document negăsit — îl pui manual</span>}
    </div>
  )

  return (
    <div style={{ marginBottom: 10 }}>
      {!prop && (
        <button onClick={citeste} disabled={busy === 'r'} className="gsoc-solid" title="AI citește Anexele (capturi de postări) și propune datele actelor: Decizia cu 7 zile înainte, Raportul la o lună după"
          style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', opacity: busy === 'r' ? 0.6 : 1 }}>
          📅 {busy === 'r' ? 'Citesc anexele…' : 'Date din postări (Anexe)'}
        </button>
      )}
      {prop && (
        <div style={{ border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))', borderRadius: 'var(--r-md)', background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))', padding: 12, display: 'grid', gap: 7 }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>Perioada postărilor: <span style={mono}>{prop.perioadaText}</span></div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>din „{prop.anexaNume}"{prop.nota ? ` · ${prop.nota}` : ''}</div>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
          {randData('Decizia', prop.decizieNume, prop.decizieData, !!prop.decizieDocId)}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginLeft: 62 }}>cu 7 zile înainte de prima postare</div>
          {randData('Raportul', prop.raportNume, prop.raportData, !!prop.raportDocId)}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginLeft: 62 }}>la o lună după ultima postare</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button onClick={aplica} disabled={busy === 'a' || (!prop.decizieDocId && !prop.raportDocId)} className="gsoc-solid"
              style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '8px 15px', borderRadius: 999, cursor: 'pointer', opacity: busy === 'a' || (!prop.decizieDocId && !prop.raportDocId) ? 0.6 : 1 }}>{busy === 'a' ? 'Se aplică…' : '✓ Aplică datele'}</button>
            <button onClick={() => { setProp(null); setMesaj('') }} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Renunță</button>
            <button onClick={citeste} disabled={busy === 'r'} title="Recitește anexele" style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>↻ recitește</button>
          </div>
        </div>
      )}
      {gata && <div style={{ marginTop: 7, fontSize: 'var(--fs-xs)', color: 'var(--accent-green)' }}>✓ {gata}</div>}
      {mesaj && <div style={{ marginTop: 7, fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{mesaj}</div>}
    </div>
  )
}
