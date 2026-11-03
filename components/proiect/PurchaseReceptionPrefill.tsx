'use client'
import { useEffect, useRef, useState } from 'react'
import type { Draft } from '@/lib/proiect-workflow'
import VeziButon from '@/components/ui/VeziButon'

type Propunere = { draft: Draft; verificari: string[]; surse: string[]; citite: { rol: string; id: string; nume: string }[] }

// Asistentul Anexei 3: citeste factura, comanda si dovada platii din dosar si propune tot PV-ul
// (furnizor, referinta, comanda online, produse cu pret fara TVA, constatari si anexe). Utilizatorul
// verifica lista "de confirmat" si preia propunerea in formular; salvarea ramane manuala.
export default function PurchaseReceptionPrefill({ firmaId, scope, draft, onApply }: { firmaId: string; scope: string; draft: Draft; onApply: (draft: Draft) => void }) {
  const [propunere, setPropunere] = useState<Propunere | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function read() {
    const request = new AbortController(); controller.current = request
    setBusy(true); setMessage(''); setPropunere(null)
    try {
      const response = await fetch('/api/achizitii/receptie/precompletare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal, body: JSON.stringify({ firmaId, scope }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'PV-ul nu a putut fi propus.')
      if (!request.signal.aborted) setPropunere(data)
    } catch (error) { if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : 'Citirea a eșuat.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }

  function apply() {
    if (!propunere) return
    const areDate = draft.lines.some(l => l.price.trim()) || ['numar', 'data', 'furnizor', 'referinta', 'constatari'].some(k => draft.fields[k]?.trim())
    if (areDate && !confirm('Formularul are deja date completate. Le înlocuiești cu propunerea din dosar?')) return
    onApply({ fields: { ...draft.fields, ...propunere.draft.fields }, lines: propunere.draft.lines.map(l => ({ ...l })) })
    setMessage('Propunerea a fost preluată în formular. Verifică punctele de mai sus, apoi „Salvează și generează Word”.')
  }

  const f = propunere?.draft.fields
  return <section style={{ padding: 20, border: '1px solid var(--accent)', borderRadius: 'var(--r-lg)', background: 'var(--surface)' }}>
    <h3 style={{ fontWeight: 650 }}>Completează PV-ul de recepție din dosar</h3>
    <p style={{ margin: '8px 0 16px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Citește factura fiscală, comanda / avizul de plată și dovada plății încărcate la această achiziție și propune tot procesul-verbal. Tu verifici doar ce e marcat „de confirmat”.</p>
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void read()}>{busy ? 'Citesc documentele dosarului…' : 'Citește dosarul și propune PV-ul'}</button>
    {message && <p role="status" style={{ marginTop: 10 }}>{message}</p>}
    {propunere && f && <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>Citite:</span>
        {propunere.citite.map(d => <span key={d.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{d.nume}<VeziButon url={`/api/chitante/document?id=${encodeURIComponent(d.id)}`} nume={d.nume} /></span>)}
      </div>
      <div style={{ padding: 12, background: 'var(--surface-sunken)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', display: 'grid', gap: 6 }}>
        <p><strong>Nr. / data:</strong> {f.numar} / {f.data || 'de completat'} · <strong>Comandă online:</strong> {f.comanda_online}</p>
        <p><strong>Furnizor:</strong> {f.furnizor}{f.reprezentant_furnizor ? `, reprezentat prin ${f.reprezentant_furnizor}` : ''}</p>
        <p><strong>Contract / factură:</strong> {f.referinta}</p>
        {propunere.draft.lines.map((l, i) => <p key={i}><strong>Produs {i + 1}:</strong> {l.product} · {l.qty} {l.unit} × {Number(l.price).toLocaleString('ro-RO', { minimumFractionDigits: 2 })} lei fără TVA<br /><span style={{ color: 'var(--text-secondary)' }}>{l.specs}</span></p>)}
        <p style={{ whiteSpace: 'pre-wrap' }}><strong>Constatări:</strong> {f.constatari}</p>
      </div>
      {propunere.verificari.length > 0 && <div style={{ padding: 12, border: '1px solid var(--warning)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>
        <strong>De confirmat ({propunere.verificari.length})</strong>
        <ul style={{ margin: '8px 0 0 18px', display: 'grid', gap: 4 }}>{propunere.verificari.map((v, i) => <li key={i}>{v}</li>)}</ul>
      </div>}
      <div><button type="button" className="btn btn-primary" onClick={apply}>Preia propunerea în formular</button></div>
    </div>}
  </section>
}
