'use client'
import { useEffect, useState } from 'react'
import Sparkline from './ui/Sparkline'

interface Punct { luna: string; label: string; incasari: number; plati: number; initializata: boolean }
function money(v: number) { return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(v || 0) }

// Tendinta incasarilor pe ultimele 6 luni pe cardul firmei din Dashboard. Incarcata separat,
// client-side, ca sa nu intarzie randarea Dashboard-ului.
export default function FirmaTrend({ firmaId, firmaSlug, luna, culoare }: { firmaId: string; firmaSlug: string; luna: string; culoare: string }) {
  const [serie, setSerie] = useState<Punct[] | null>(null)
  useEffect(() => {
    fetch(`/api/luna/istoric?firmaId=${encodeURIComponent(firmaId)}&firmaSlug=${encodeURIComponent(firmaSlug)}&luna=${encodeURIComponent(luna)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSerie(Array.isArray(d?.istoric) ? d.istoric.filter((p: Punct) => p.initializata) : []))
      .catch(() => setSerie([]))
  }, [firmaId, firmaSlug, luna])

  if (serie === null) return <div className="skeleton" style={{ height: '52px', marginBottom: '16px' }} />
  const cuBani = serie.filter(p => p.incasari > 0 || p.plati > 0)
  if (cuBani.length < 2) return null
  const ultima = cuBani[cuBani.length - 1]
  return (
    <div style={{ marginBottom: '16px', padding: '10px 12px 4px', borderRadius: 'var(--r-md)', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        <span>Încasări RON · {cuBani[0].label} – {ultima.label}</span>
        <span className="num" style={{ color: 'var(--text-secondary)' }}>{money(ultima.incasari)}</span>
      </div>
      <Sparkline values={cuBani.map(p => p.incasari)} color={culoare} title="Încasări pe ultimele luni" />
    </div>
  )
}
