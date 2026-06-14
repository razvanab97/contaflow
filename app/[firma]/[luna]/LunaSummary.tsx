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
      <div style={{ fontSize:'10px', fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'.12em' }}>
        Concluzia lunară
      </div>
      <div style={{ display:'flex', gap:'24px' }}>
        {([
          ['Încasări', summary.bankReceipts, '#6EE7B0'],
          ['Plăți', summary.bankPayments, '#F87171'],
          ['Cashflow', summary.bankCashflow, summary.bankCashflow >= 0 ? '#6EE7B0' : '#F87171'],
          ['Cost net eMAG', summary.emagNetCost, culoare],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} style={{ textAlign:'center' }}>
            <div style={{ fontSize:'18px', fontWeight:800, color, letterSpacing:'-0.5px', lineHeight:1 }}>
              {money(value as number)}
            </div>
            <div style={{ fontSize:'10px', fontWeight:600, color:'#555', marginTop:'4px', textTransform:'uppercase', letterSpacing:'.08em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
