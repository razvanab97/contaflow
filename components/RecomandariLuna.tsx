'use client'
import { useEffect, useState } from 'react'

interface Recomandare { id: string; continut: string; creat_la: string }

interface Props {
  lunaId: string
  firmaId: string
  firmaSlug: string
  firmaNume: string
  lunaLabel: string
}

function formatData(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Generat manual, la cererea utilizatorului (nu automat la finalul lunii) - agrega datele reale
// ale lunii (task-uri, module dezactivate, tranzactii nedocumentate, documente, restante) si cere
// unui model AI recomandari concrete despre cum sa evolueze SISTEMUL, nu ce mai e de facut acum.
export default function RecomandariLuna({ lunaId, firmaId, firmaSlug, firmaNume, lunaLabel }: Props) {
  const [recomandare, setRecomandare] = useState<Recomandare | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/luna/recomandari?lunaId=${encodeURIComponent(lunaId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setRecomandare(data?.recomandare || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lunaId])

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/luna/recomandari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunaId, firmaId, firmaSlug, firmaNume, lunaLabel }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Nu s-a putut genera')
      else setRecomandare(data.recomandare)
    } catch {
      setError('Nu s-a putut genera')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return null

  return (
    <div className="card card-pad" style={{ marginTop: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minWidth: 0, flex: '1 1 280px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>
          </div>
          <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Recomandări pentru sistem</div>
          <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {recomandare ? `Generate ${formatData(recomandare.creat_la)}` : 'Ce ar putea reduce munca manuală pe viitor, pe baza lunii curente'}
          </div>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="btn"
          style={{ cursor: generating ? 'wait' : undefined, opacity: generating ? .6 : 1, flexShrink: 0 }}
        >
          {generating ? 'Se analizează luna...' : recomandare ? '↻ Regenerează' : 'Generează recomandări'}
        </button>
      </div>

      {error && <p role="alert" style={{ fontSize: 'var(--fs-md)', color: 'var(--danger)', marginTop: '12px' }}>{error}</p>}

      {recomandare && !generating && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {recomandare.continut.split('\n').filter(l => l.trim()).map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-solid)', marginTop: '8px', flexShrink: 0 }} />
              <span>{line.replace(/^•\s*/, '')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
