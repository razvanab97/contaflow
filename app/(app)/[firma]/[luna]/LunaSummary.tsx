'use client'
import { useState, useEffect } from 'react'
import Sparkline from '@/components/ui/Sparkline'
import CountUp from '@/components/ui/CountUp'

interface EmagSummary { bankReceipts:number; bankPayments:number; bankCashflow:number; emagNetCost:number }
interface Punct { luna: string; label: string; incasari: number; plati: number; pct: number; initializata: boolean }

function money(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v||0) }

// "Concluzia lunară" (din extrasele bancare, RON) ca tile-uri cu cifre animate + sparkline pe
// ultimele 6 luni. Tendinta vine din /api/luna/istoric (doar citiri).
export default function LunaSummary({ lunaId, firmaId, firmaSlug, luna }: { lunaId: string; culoare: string; firmaId: string; firmaSlug: string; luna: string }) {
  const [summary, setSummary] = useState<EmagSummary|null>(null)
  const [loaded, setLoaded] = useState(false)
  const [istoric, setIstoric] = useState<Punct[]>([])

  useEffect(() => {
    setLoaded(false)
    fetch(`/api/emag?lunaId=${encodeURIComponent(lunaId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.summary) setSummary(data.summary) })
      .catch(() => {})
      .finally(() => setLoaded(true))
    fetch(`/api/luna/istoric?firmaId=${encodeURIComponent(firmaId)}&firmaSlug=${encodeURIComponent(firmaSlug)}&luna=${encodeURIComponent(luna)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.istoric)) setIstoric(data.istoric) })
      .catch(() => {})
  }, [lunaId, firmaId, firmaSlug, luna])

  if (!loaded) {
    return (
      <div className="stat-grid" style={{ marginBottom: '28px' }} aria-busy="true">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '112px', borderRadius: 'var(--r-lg)' }} />)}
      </div>
    )
  }
  if (!summary) return null

  const serie = istoric.filter(p => p.initializata)
  const spark = (key: 'incasari' | 'plati' | 'cashflow') => serie.map(p => key === 'cashflow' ? p.incasari - p.plati : p[key])
  const range = serie.length > 1 ? `${serie[0].label} – ${serie[serie.length - 1].label}` : ''

  const tiles: { label: string; value: number; color: string; spark?: number[]; sparkColor?: string }[] = [
    { label: 'Încasări', value: summary.bankReceipts, color: 'var(--success)', spark: spark('incasari'), sparkColor: 'var(--success)' },
    { label: 'Plăți', value: summary.bankPayments, color: 'var(--danger)', spark: spark('plati'), sparkColor: 'var(--danger)' },
    { label: 'Cashflow', value: summary.bankCashflow, color: summary.bankCashflow >= 0 ? 'var(--success)' : 'var(--danger)', spark: spark('cashflow'), sparkColor: 'var(--accent)' },
    { label: 'Cost net eMAG', value: summary.emagNetCost, color: 'var(--text-primary)' },
  ]

  return (
    <div className="stat-grid stagger" style={{ marginBottom: '28px' }}>
      {tiles.map(t => (
        <div key={t.label} className="stat" title={`Concluzia lunară, din extrasele bancare${range ? ` · tendință ${range}` : ''}`}>
          <div className="stat-label">{t.label}</div>
          <div className="stat-value num" style={{ color: t.color, fontSize: 'var(--fs-lg)' }} title={money(t.value)}>
            <CountUp value={t.value} decimals={2} />
          </div>
          {t.spark && t.spark.length > 1 ? <Sparkline values={t.spark} color={t.sparkColor} title={`${t.label} pe ultimele luni`} /> : <div style={{ height: '28px', marginTop: '10px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-end' }}>{t.label === 'Cost net eMAG' ? 'RON, luna curentă' : 'fără istoric încă'}</div>}
        </div>
      ))}
    </div>
  )
}
