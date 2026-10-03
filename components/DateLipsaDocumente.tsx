'use client'
import { useEffect, useRef, useState } from 'react'

// Completeaza cu AI suma/furnizorul/numarul/data pe documentele vechi care nu le au (doar campurile
// goale). Ruleaza pe loturi mici pana se termina, cu progres vizibil si posibilitate de oprire.
export default function DateLipsaDocumente() {
  const [ramase, setRamase] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [completate, setCompletate] = useState(0)
  const [procesate, setProcesate] = useState(0)
  const [start, setStart] = useState(0)
  const [error, setError] = useState('')
  const stop = useRef(false)

  useEffect(() => {
    fetch('/api/documente/completeaza').then(r => r.ok ? r.json() : null).then(d => setRamase(d?.ramase ?? 0)).catch(() => setRamase(0))
  }, [])

  async function porneste() {
    setBusy(true); setError(''); stop.current = false
    setStart(ramase || 0); setCompletate(0); setProcesate(0)
    const exclude: string[] = []
    try {
      for (let i = 0; i < 200 && !stop.current; i++) {
        const res = await fetch('/api/documente/completeaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exclude }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setError(d.error || 'Completarea a eșuat'); break }
        if (!d.cuMarcaj) exclude.push(...(d.incercate || []))
        setCompletate(c => c + (d.completate || 0))
        setProcesate(p => p + (d.procesate || 0))
        setRamase(d.ramase)
        if (!d.procesate || !d.ramase) break
      }
    } catch { setError('Conexiunea s-a întrerupt') }
    setBusy(false)
    window.dispatchEvent(new CustomEvent('cf:toast', { detail: { text: 'Completarea datelor din documente s-a oprit.', tone: 'success' } }))
  }

  if (ramase === null || (ramase === 0 && !procesate)) return null
  const pct = start > 0 ? Math.round((procesate / start) * 100) : 0
  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Date lipsă din documente</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
            <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ramase}</span> facturi, bonuri și avize nu au suma salvată. AI-ul le citește și completează doar câmpurile goale (sumă, furnizor, număr, dată) — căutarea după sumă și potrivirea automată devin mai bune.
          </div>
        </div>
        {busy
          ? <button className="btn" onClick={() => { stop.current = true }}>Oprește</button>
          : ramase > 0 && <button className="btn btn-primary" onClick={porneste}>Completează automat</button>}
      </div>
      {(busy || procesate > 0) && (
        <div style={{ marginTop: '14px' }}>
          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {procesate} citite · <span style={{ color: 'var(--success)' }}>{completate} completate</span>{busy ? ' · se lucrează…' : ''}
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ marginTop: '8px', fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}
