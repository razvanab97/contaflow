'use client'
import { useEffect, useRef } from 'react'
import type { Tx } from './types'
import TransactionRow from './TransactionRow'
import TransactionSearch from './TransactionSearch'
import TransactionFilters from './TransactionFilters'

type Filter = 'all'|'lipsa'|'ok'|'na'
type FlowFilter = 'all'|'debit'|'credit'

export default function TransactionSidebar({
  txs, activeTxId, onSelect, search, onSearchChange,
  filter, flowFilter, counts, flowCounts, onFilterChange, onFlowFilterChange,
  onScroll, initialScrollTop,
}: {
  txs: Tx[]; activeTxId: string | null; onSelect: (id: string) => void
  search: string; onSearchChange: (v: string) => void
  filter: Filter; flowFilter: FlowFilter
  counts: Record<Filter, number>; flowCounts: Record<FlowFilter, number>
  onFilterChange: (f: Filter) => void; onFlowFilterChange: (f: FlowFilter) => void
  onScroll?: (scrollTop: number) => void; initialScrollTop?: number
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const restoredOnce = useRef(false)

  useEffect(() => {
    if (restoredOnce.current || !listRef.current) return
    if (initialScrollTop) listRef.current.scrollTop = initialScrollTop
    restoredOnce.current = true
  }, [initialScrollTop])

  useEffect(() => {
    if (!activeTxId || !listRef.current) return
    listRef.current.querySelector(`[data-tx-id="${activeTxId}"]`)?.scrollIntoView({ block:'nearest' })
  }, [activeTxId])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ padding:'14px 14px 10px' }}>
        <h2 style={{ fontSize:'13px', fontWeight:700, color:'var(--text-primary)', marginBottom:'10px' }}>Tranzacții</h2>
        <TransactionSearch value={search} onChange={onSearchChange} />
      </div>
      <TransactionFilters
        filter={filter} flowFilter={flowFilter} counts={counts} flowCounts={flowCounts}
        onFilterChange={onFilterChange} onFlowFilterChange={onFlowFilterChange}
      />
      <div
        ref={listRef}
        onScroll={e => onScroll?.(e.currentTarget.scrollTop)}
        style={{ flex:1, minHeight:0, overflowY:'auto', borderTop:'1px solid var(--border-subtle)' }}
      >
        {txs.length === 0 ? (
          <p style={{ fontSize:'12px', color:'var(--text-muted)', padding:'20px 14px', textAlign:'center' }}>Nicio tranzacție găsită.</p>
        ) : (
          txs.map(tx => (
            <TransactionRow key={tx.id} tx={tx} isSelected={tx.id === activeTxId} onClick={() => onSelect(tx.id)} />
          ))
        )}
      </div>
    </div>
  )
}
