'use client'

type Filter = 'all'|'lipsa'|'ok'|'na'
type FlowFilter = 'all'|'debit'|'credit'

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize:'11.5px', fontWeight:600, padding:'5px 10px', borderRadius:'7px',
    border:`1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
    background: active ? 'var(--purple-soft)' : 'transparent',
    color: active ? 'var(--purple)' : 'var(--text-secondary)',
    cursor:'pointer', whiteSpace:'nowrap',
  }
}

export default function TransactionFilters({ filter, flowFilter, counts, flowCounts, onFilterChange, onFlowFilterChange }: {
  filter: Filter; flowFilter: FlowFilter
  counts: Record<Filter, number>; flowCounts: Record<FlowFilter, number>
  onFilterChange: (f: Filter) => void; onFlowFilterChange: (f: FlowFilter) => void
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'6px', padding:'0 14px 10px' }}>
      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
        {([['all',`Toate (${counts.all})`],['lipsa',`Neasociate (${counts.lipsa})`],['ok',`Asociate (${counts.ok})`],['na',`Ignorate (${counts.na})`]] as const).map(([f,l]) => (
          <button key={f} onClick={() => onFilterChange(f)} style={pillStyle(filter===f)}>{l}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
        {([['all',`Toate (${flowCounts.all})`],['debit',`Ieșiri (${flowCounts.debit})`],['credit',`Încasări (${flowCounts.credit})`]] as const).map(([f,l]) => (
          <button key={f} onClick={() => onFlowFilterChange(f)} style={{ ...pillStyle(flowFilter===f), fontSize:'11px', opacity:.85 }}>{l}</button>
        ))}
      </div>
    </div>
  )
}
