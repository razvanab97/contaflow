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

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px' }}>
      <div style={{ fontSize:'12px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>
        Concluzia lunară
      </div>
      <div style={{ display:'flex', gap:'24px', flexWrap:'wrap', justifyContent:'center' }}>
        {([
          ['Încasări', summary.bankReceipts, 'var(--success)'],
          ['Plăți', summary.bankPayments, 'var(--danger)'],
          ['Cashflow', summary.bankCashflow, summary.bankCashflow >= 0 ? 'var(--success)' : 'var(--danger)'],
          ['Cost net eMAG', summary.emagNetCost, 'var(--accent)'],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} style={{ textAlign:'center' }}>
            <div style={{ fontSize:'20px', fontWeight:700, color, letterSpacing:'-0.5px', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
              {money(value as number)}
            </div>
            <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', marginTop:'4px', textTransform:'uppercase', letterSpacing:'.08em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
