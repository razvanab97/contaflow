'use client'
import { useEffect, useState } from 'react'
import type { Tx } from './types'
import { getActiveSuggestion, SUGGESTION_ENDPOINT } from './types'
import TransactionSidebar from './TransactionSidebar'
import TransactionWorkspaceCard from './TransactionWorkspaceCard'
import ExtrasActionBar from './ExtrasActionBar'

type Filter = 'all'|'lipsa'|'ok'|'na'
type FlowFilter = 'all'|'debit'|'credit'

export default function ExtrasWorkspace({
  txs, activeTxIndex, setActiveTxIndex, firmaId, lunaId, culoare,
  onNA, onClearNA, onUploadSuccess, onRefresh,
  search, onSearchChange, filter, flowFilter, counts, flowCounts, onFilterChange, onFlowFilterChange,
  onSidebarScroll, initialSidebarScrollTop,
}: {
  txs: Tx[]
  activeTxIndex: number
  setActiveTxIndex: (idx: number) => void
  firmaId: string; lunaId: string; culoare: string
  onNA: (id: string) => void
  onClearNA: (id: string) => void
  onUploadSuccess: (id: string) => void
  onRefresh: () => void
  search: string; onSearchChange: (v: string) => void
  filter: Filter; flowFilter: FlowFilter
  counts: Record<Filter, number>; flowCounts: Record<FlowFilter, number>
  onFilterChange: (f: Filter) => void; onFlowFilterChange: (f: FlowFilter) => void
  onSidebarScroll?: (top: number) => void; initialSidebarScrollTop?: number
}) {
  const safeIndex = Math.min(activeTxIndex, Math.max(txs.length - 1, 0))
  const activeTx = txs[safeIndex]
  const [sugestieBusy, setSugestieBusy] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)

  useEffect(() => {
    if (!activeTx) return
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft' && safeIndex > 0) {
        event.preventDefault(); setActiveTxIndex(safeIndex - 1)
      } else if (event.key === 'ArrowRight' && safeIndex < txs.length - 1) {
        event.preventDefault(); setActiveTxIndex(safeIndex + 1)
      } else if ((event.key === 'Enter' || event.key === 's' || event.key === 'S') && !activeTx.document_id && activeTx.note !== 'na') {
        event.preventDefault(); onNA(activeTx.id)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeTx, onNA, safeIndex, setActiveTxIndex, txs.length])

  if (!activeTx) {
    return (
      <div style={{ padding:'60px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', textAlign:'center' }}>
        <p style={{ fontSize:'14px', color:'var(--text-muted)' }}>Nicio tranzacție în această categorie.</p>
      </div>
    )
  }

  const activeSuggestion = getActiveSuggestion(activeTx)

  async function confirmSuggestion() {
    if (!activeSuggestion) return
    setSugestieBusy(true)
    const { url, idKey } = SUGGESTION_ENDPOINT[activeSuggestion.tip]
    await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ [idKey]: activeSuggestion.id, tranzactieId: activeTx.id }) })
    setSugestieBusy(false)
    onUploadSuccess(activeTx.id)
  }

  function selectTx(id: string) {
    const idx = txs.findIndex(t => t.id === id)
    if (idx >= 0) setActiveTxIndex(idx)
    setMobileDetail(true)
  }

  const sidebar = (
    <TransactionSidebar
      txs={txs} activeTxId={activeTx.id} onSelect={selectTx}
      search={search} onSearchChange={onSearchChange}
      filter={filter} flowFilter={flowFilter} counts={counts} flowCounts={flowCounts}
      onFilterChange={onFilterChange} onFlowFilterChange={onFlowFilterChange}
      onScroll={onSidebarScroll} initialScrollTop={initialSidebarScrollTop}
    />
  )

  const detail = (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, minWidth:0 }}>
      <div className="extras-mobile-back" style={{ display:'none' }}>
        <button onClick={() => setMobileDetail(false)} style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', background:'transparent', border:'none', cursor:'pointer', padding:'10px 0' }}>← Înapoi la listă</button>
      </div>
      <div style={{ flex:1, minHeight:0 }}>
        <TransactionWorkspaceCard
          tx={activeTx} index={safeIndex} total={txs.length}
          firmaId={firmaId} lunaId={lunaId} culoare={culoare}
          onClearNA={() => onClearNA(activeTx.id)}
          onRefresh={onRefresh}
          onUploadSuccess={() => onUploadSuccess(activeTx.id)}
          activeSuggestion={activeSuggestion}
          sugestieBusy={sugestieBusy}
          onConfirmSuggestion={confirmSuggestion}
          key={activeTx.id}
        />
      </div>
      <ExtrasActionBar
        index={safeIndex} total={txs.length}
        isDone={!!activeTx.document_id} isNA={activeTx.note === 'na'}
        onPrev={safeIndex > 0 ? () => setActiveTxIndex(safeIndex - 1) : undefined}
        onNext={safeIndex < txs.length - 1 ? () => setActiveTxIndex(safeIndex + 1) : undefined}
        onSkip={() => onNA(activeTx.id)}
        onUnskip={() => onClearNA(activeTx.id)}
        onAssociatePrimary={activeSuggestion ? confirmSuggestion : undefined}
        associateDisabled={!activeSuggestion}
        associateBusy={sugestieBusy}
        culoare={culoare}
      />
    </div>
  )

  return (
    <div className="extras-workspace-grid" style={{ display:'grid', gridTemplateColumns:'32% 68%', gridTemplateRows:'1fr', gap:'16px', height:'calc(100vh - 260px)', minHeight:'520px' }}>
      <div className="extras-sidebar-col" style={{ display: mobileDetail ? 'none' : 'block', minWidth:0, minHeight:0 }}>{sidebar}</div>
      <div className="extras-detail-col" style={{ display: !mobileDetail ? 'none' : 'block', minWidth:0, minHeight:0 }}>{detail}</div>
      <style>{`
        @media (min-width: 769px) {
          .extras-sidebar-col, .extras-detail-col { display: block !important; }
        }
        @media (max-width: 1024px) {
          .extras-workspace-grid { grid-template-columns: 260px 1fr !important; }
        }
        @media (max-width: 768px) {
          .extras-workspace-grid { grid-template-columns: 1fr !important; height: auto !important; min-height: 0 !important; }
          .extras-mobile-back { display: block !important; }
        }
      `}</style>
    </div>
  )
}
