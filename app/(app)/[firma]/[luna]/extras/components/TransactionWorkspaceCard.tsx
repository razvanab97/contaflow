'use client'
import { useState } from 'react'
import type { ActiveSuggestion, Tx } from './types'
import TransactionDetails from './TransactionDetails'
import DocumentMatch from './DocumentMatch'
import DocumentActions from './DocumentActions'
import DocumentAttachedList from './DocumentAttachedList'

export default function TransactionWorkspaceCard({
  tx, index, total, firmaId, lunaId, culoare,
  onClearNA, onRefresh, onUploadSuccess,
  activeSuggestion, sugestieBusy, onConfirmSuggestion,
}: {
  tx: Tx; index: number; total: number
  firmaId: string; lunaId: string; culoare: string
  onClearNA: () => void
  onRefresh: () => void
  onUploadSuccess: () => void
  activeSuggestion: ActiveSuggestion | null
  sugestieBusy: boolean
  onConfirmSuggestion: () => void
}) {
  const [editDoc, setEditDoc] = useState(false)
  const isNA = tx.note === 'na'
  const isDone = !!tx.document_id

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
        <TransactionDetails tx={tx} index={index} total={total} />

        {isDone && !editDoc ? (
          <div style={{ padding:'24px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
              <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'var(--success-soft)', border:'1px solid var(--success)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="16" height="16" fill="none" stroke="var(--success)" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
              </div>
              <div>
                <div style={{ fontSize:'14px', fontWeight:700, color:'var(--text-primary)' }}>Tranzacție rezolvată</div>
                <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>Documentul a fost asociat cu succes.</div>
              </div>
            </div>
            <DocumentAttachedList tx={tx} firmaId={firmaId} lunaId={lunaId} culoare={culoare} onRefresh={onRefresh} onEditPrimary={() => setEditDoc(true)} />
          </div>
        ) : isNA ? (
          <div style={{ padding:'40px 28px', textAlign:'center' }}>
            <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:'var(--surface-secondary)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <svg width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </div>
            <h3 style={{ fontSize:'15px', fontWeight:700, color:'var(--text-primary)', marginBottom:'6px' }}>Tranzacție ignorată</h3>
            <p style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'18px' }}>Această tranzacție a fost marcată ca ignorată (nu necesită document).</p>
            <button onClick={onClearNA} style={{ fontSize:'12px', fontWeight:600, padding:'8px 16px', borderRadius:'8px', border:'none', background:culoare, color:'var(--c-ffffff)', cursor:'pointer' }}>
              Reactivează pentru adăugare document
            </button>
          </div>
        ) : (
          <div style={{ padding:'0 0 24px' }}>
            <DocumentMatch suggestion={activeSuggestion} busy={sugestieBusy} onConfirm={onConfirmSuggestion} />
            <div style={{ padding:'0 28px' }}>
              {editDoc && (
                <button onClick={() => setEditDoc(false)} style={{ fontSize:'11px', color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer', marginBottom:'10px' }}>← Anulează schimbarea documentului</button>
              )}
              <DocumentActions
                tx={tx} firmaId={firmaId} lunaId={lunaId} culoare={culoare} onSuccess={onUploadSuccess}
                initialTip={editDoc ? tx.documente?.tip_document : undefined}
                initialFurnizor={editDoc ? tx.documente?.furnizor : undefined}
                initialNumDoc={editDoc ? tx.documente?.numar_document : undefined}
                title={editDoc ? 'Schimbă documentul principal' : 'Nu este documentul potrivit?'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
