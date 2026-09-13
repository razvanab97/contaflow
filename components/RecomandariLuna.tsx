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
    <div style={{ marginTop: '28px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Recomandări pentru sistem</div>
          <div style={{ fontSize: '13px', fontWeight: 450, color: 'var(--text-secondary)', marginTop: '2px' }}>
            {recomandare ? `Generate ${formatData(recomandare.creat_la)}` : 'Ce ar putea reduce munca manuală pe viitor, pe baza lunii curente'}
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            fontSize: '12.5px', fontWeight: 600, padding: '7px 14px', borderRadius: '8px',
            border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-hover)',
            cursor: generating ? 'wait' : 'pointer', opacity: generating ? .6 : 1, flexShrink: 0,
          }}
        >
          {generating ? 'Se analizează luna...' : recomandare ? '↻ Regenerează' : 'Generează recomandări'}
        </button>
      </div>

      {error && <p style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '12px' }}>{error}</p>}

      {recomandare && !generating && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {recomandare.continut.split('\n').filter(l => l.trim()).map((line, i) => (
            <div key={i} style={{ fontSize: '13px', fontWeight: 450, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {line.replace(/^•\s*/, '')}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
