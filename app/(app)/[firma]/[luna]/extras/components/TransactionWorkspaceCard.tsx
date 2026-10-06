'use client'
import { useState } from 'react'
import type { ActiveSuggestion, Tx } from './types'
import TransactionDetails from './TransactionDetails'
import DocumentMatch from './DocumentMatch'
import DocumentActions from './DocumentActions'
import DocumentAttachedList from './DocumentAttachedList'
import AchizitieProdusBar from './AchizitieProdusBar'
import { MOTIVE_IGNORARE, MOTIVE_FIZICE, MOTIV_LABEL, EXPLICATIE_REGULA, ignorareDeVerificat, motivEfectiv } from '@/lib/tranzactii-reguli'

export default function TransactionWorkspaceCard({
  tx, index, total, firmaId, lunaId, culoare,
  onClearNA, onRefresh, onUploadSuccess,
  activeSuggestion, sugestieBusy, onConfirmSuggestion, onSetMotiv, achizitiiProduse,
}: {
  onSetMotiv?: (motiv: string) => void
  achizitiiProduse?: boolean
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
  const motivNA = isNA ? motivEfectiv(tx) : null
  const fizic = !!motivNA && MOTIVE_FIZICE.has(motivNA)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
      <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
        <TransactionDetails tx={tx} index={index} total={total} onRefresh={onRefresh} />
        {achizitiiProduse && <AchizitieProdusBar tx={tx} onRefresh={onRefresh} />}

        {isDone && !editDoc ? (
          <div style={{ padding:'24px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
              <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'var(--success-soft)', border:'1px solid var(--success)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="16" height="16" fill="none" stroke="var(--success)" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
              </div>
              <div>
                <div style={{ fontSize:'var(--fs-base)', fontWeight:700, color:'var(--text-primary)' }}>Tranzacție rezolvată</div>
                <div style={{ fontSize:'var(--fs-sm)', color:'var(--text-secondary)' }}>Documentul a fost asociat cu succes.</div>
              </div>
            </div>
            <DocumentAttachedList tx={tx} firmaId={firmaId} lunaId={lunaId} culoare={culoare} onRefresh={onRefresh} onEditPrimary={() => setEditDoc(true)} />
          </div>
        ) : isNA ? (
          <div style={{ padding:'40px 28px', textAlign:'center' }}>
            <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:'var(--surface-secondary)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <svg width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </div>
            <h3 style={{ fontSize:'var(--fs-lg)', fontWeight:700, color:'var(--text-primary)', marginBottom:'6px' }}>{fizic ? `🧾 ${MOTIV_LABEL[motivNA!]}` : tx.ignorat_auto ? 'Sărită automat' : 'Tranzacție ignorată'}</h3>
            <p style={{ fontSize:'var(--fs-sm)', color:'var(--text-secondary)', marginBottom:'14px' }}>
              {fizic ? 'Documentul există pe hârtie, nu ca fișier în aplicație — tranzacția e considerată justificată. Nu uita să predai bonul/documentul fizic contabilului.' : tx.ignorat_auto ? `Regulă standard: ${EXPLICATIE_REGULA[motivEfectiv(tx) || ''] || 'nu are nevoie de document.'}` : 'Această tranzacție a fost marcată ca ignorată (nu necesită document).'}
            </p>
            {ignorareDeVerificat(tx) && (
              <div role="alert" style={{ margin:'0 auto 14px', maxWidth:'440px', padding:'10px 12px', borderRadius:'var(--r-md)', background:'var(--warning-soft)', border:'1px solid color-mix(in srgb, var(--warning) 35%, transparent)', color:'var(--warning)', fontSize:'var(--fs-sm)', textAlign:'left' }}>
                ⚠ Este o cheltuială ignorată fără un motiv care să o justifice. Probabil lipsește factura sau bonul — alege motivul de mai jos sau reactivează și atașează documentul.
              </div>
            )}
            {onSetMotiv && (
              <div style={{ marginBottom:'18px' }}>
                <div className="eyebrow" style={{ marginBottom:'8px' }}>Motivul ignorării</div>
                <div role="radiogroup" aria-label="Motivul ignorării" style={{ display:'flex', flexWrap:'wrap', gap:'6px', justifyContent:'center', maxWidth:'520px', margin:'0 auto' }}>
                  {MOTIVE_IGNORARE.map(m => {
                    const activ = motivEfectiv(tx) === m.key
                    return (
                      <button key={m.key} role="radio" aria-checked={activ} onClick={() => onSetMotiv(m.key)} className="btn btn-sm"
                        style={activ ? { background:'var(--accent-soft)', borderColor:'var(--accent)', color:'var(--accent)' } : { color:'var(--text-secondary)' }}>
                        {m.scurt}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <button onClick={onClearNA} style={{ fontSize:'var(--fs-sm)', fontWeight:600, padding:'8px 16px', borderRadius:'var(--r-md)', border:'none', background:'var(--accent-solid)', color:'#fff', cursor:'pointer' }}>
              Reactivează pentru adăugare document
            </button>
          </div>
        ) : (
          <div style={{ padding:'0 0 24px' }}>
            <DocumentMatch suggestion={activeSuggestion} busy={sugestieBusy} onConfirm={onConfirmSuggestion} />
            <div style={{ padding:'0 28px' }}>
              {editDoc && (
                <button onClick={() => setEditDoc(false)} style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer', marginBottom:'10px' }}>← Anulează schimbarea documentului</button>
              )}
              <DocumentActions
                tx={tx} firmaId={firmaId} lunaId={lunaId} culoare={culoare} onSuccess={onUploadSuccess}
                initialTip={editDoc ? tx.documente?.tip_document : undefined}
                initialFurnizor={editDoc ? tx.documente?.furnizor : undefined}
                initialNumDoc={editDoc ? tx.documente?.numar_document : undefined}
                title={editDoc ? 'Schimbă documentul principal' : 'Nu este documentul potrivit?'}
              />
              {onSetMotiv && !editDoc && (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginTop:'16px', paddingTop:'14px', borderTop:'1px dashed var(--border)' }}>
                  <span className="eyebrow">Nu ai fișier? Documentul e pe hârtie</span>
                  <button onClick={() => onSetMotiv('bon_fizic')} className="btn btn-sm" title="Bonul fizic se păstrează pe hârtie și se predă contabilului">🧾 Bon fizic</button>
                  <button onClick={() => onSetMotiv('document_fizic')} className="btn btn-sm" title="Factura sau chitanța există doar pe hârtie">📄 Factură / chitanță fizică</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
