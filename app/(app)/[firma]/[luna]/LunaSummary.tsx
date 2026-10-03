'use client'
import { useState, useEffect } from 'react'

interface EmagSummary { bankReceipts:number; bankPayments:number; bankCashflow:number; emagNetCost:number }

function money(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v||0) }

export default function LunaSummary({ lunaId, culoare }: { lunaId: string; culoare: string }) {
  const [summary, setSummary] = useState<EmagSummary|null>(null)

  useEffect(() => {
    fetch(`/api/emag?lunaId=${encodeURIComponent(lunaId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.summary) setSummary(data.summary) })
      .catch(() => {})
  }, [lunaId])

  if (!summary) return null

  // Tile-uri in grila .stat-grid a parintelui (hub) - "Concluzia lunară" din extrasele bancare.
  return (
    <>
      {([
        ['Încasări', summary.bankReceipts, 'var(--success)'],
        ['Plăți', summary.bankPayments, 'var(--danger)'],
        ['Cashflow', summary.bankCashflow, summary.bankCashflow >= 0 ? 'var(--success)' : 'var(--danger)'],
        ['Cost net eMAG', summary.emagNetCost, 'var(--text-primary)'],
      ] as [string, number, string][]).map(([label, value, color]) => (
        <div key={label} className="stat animate-in" title="Concluzia lunară, din extrasele bancare">
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={{ color, fontSize: 'var(--fs-lg)' }} title={money(value as number)}>
            {money(value as number)}
          </div>
        </div>
      ))}
    </>
  )
}
