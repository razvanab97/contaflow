'use client'
import { useState } from 'react'
import type { Tx } from './types'
import { isPreviewable, shortReference } from './types'
import { legibil } from '@/lib/colors'
import DocumentUpload from './DocumentUpload'
import DocumentLinkInput from './DocumentLinkInput'

export default function DocumentAttachedList({ tx, firmaId, lunaId, culoare, onRefresh, onEditPrimary }: {
  tx: Tx; firmaId: string; lunaId: string; culoare: string; onRefresh: () => void; onEditPrimary: () => void
}) {
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showAddMore, setShowAddMore] = useState(false)
  const [addFurnizor, setAddFurnizor] = useState('')
  const [addSuma, setAddSuma] = useState('')

  const docsForTx = tx.documenteToate?.length ? tx.documenteToate : tx.documente ? [tx.documente] : []
  const orderRef = shortReference(tx.referinta)

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  // Sterge un document gresit atasat pe tranzactie - daca era documentul principal, tranzactia
  // revine automat la "fara document" (vezi unlink-ul din /api/chitante/document DELETE).
  async function deleteDoc(doc: { id:string; fisier_nume:string }) {
    if (!confirm(`Ștergi „${doc.fisier_nume}" de pe această tranzacție?`)) return
    setDeletingId(doc.id)
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    setDeletingId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Documentul nu a putut fi șters')
      return
    }
    onRefresh()
  }

  return (
    <div>
      <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'6px 10px', borderRadius:'999px', background:'var(--surface-secondary)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontSize:'11px', fontWeight:700, marginBottom:'14px' }}>
        {orderRef ? `Comanda/ref. ${orderRef}` : 'Aceeași tranzacție'}
        <span style={{ color:'var(--success)' }}>· {docsForTx.length || 1} document{(docsForTx.length || 1) === 1 ? '' : 'e'}</span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'14px' }}>
        {docsForTx.map((doc, docIndex) => {
          const kind = isPreviewable(doc.fisier_nume)
          const open = previewIds.has(doc.id)
          return (
            <div key={doc.id}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
                <svg width="14" height="14" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                <div style={{ flex:1, minWidth:0 }}>
                  {docsForTx.length > 1 && (
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'3px' }}>Factura {docIndex + 1} din {docsForTx.length}</div>
                  )}
                  <input
                    defaultValue={doc.fisier_nume}
                    onBlur={e => {
                      const fisier_nume = e.target.value.trim()
                      if (!fisier_nume || fisier_nume === doc.fisier_nume) return
                      fetch('/api/documente/rename', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:doc.id, fisier_nume }) }).then(onRefresh)
                    }}
                    style={{ width:'100%', fontSize:'12px', fontWeight:600, color:'var(--success)', background:'transparent', border:'none', outline:'none', padding:0 }}
                  />
                  {(doc.furnizor || doc.numar_document) && (
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px' }}>{[doc.furnizor, doc.numar_document && `nr. ${doc.numar_document}`].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
                {kind && <button onClick={() => togglePreview(doc.id)} style={{ fontSize:'11px', fontWeight:600, color: open ? 'var(--text-primary)' : 'var(--accent-mint)', background:'transparent', border:'none', cursor:'pointer', flexShrink:0 }}>{open ? 'Ascunde' : 'Vezi'}</button>}
                <a href={`/api/tranzactii/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:600, color:legibil(culoare), flexShrink:0 }}>↓</a>
                <button onClick={() => deleteDoc(doc)} disabled={deletingId===doc.id} style={{ fontSize:'11px', fontWeight:600, color:'var(--danger)', background:'transparent', border:'none', cursor:'pointer', flexShrink:0, opacity:deletingId===doc.id?.6:1 }}>
                  {deletingId===doc.id ? '...' : 'Șterge'}
                </button>
              </div>
              {open && kind === 'pdf' && (
                <iframe src={`/api/tranzactii/document?id=${encodeURIComponent(doc.id)}&preview=1`} style={{ width:'100%', height:'55vh', border:'1px solid var(--border)', borderRadius:'10px', marginTop:'6px', background:'var(--c-ffffff)' }} />
              )}
              {open && kind === 'image' && (
                <img src={`/api/tranzactii/document?id=${encodeURIComponent(doc.id)}&preview=1`} alt={doc.fisier_nume} style={{ width:'100%', maxHeight:'55vh', objectFit:'contain', border:'1px solid var(--border)', borderRadius:'10px', marginTop:'6px', background:'var(--c-ffffff)' }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom: showAddMore ? '14px' : 0 }}>
        <button onClick={() => setShowAddMore(v => !v)} style={{ fontSize:'12px', fontWeight:600, padding:'8px 14px', borderRadius:'8px', border:`1px solid var(--purple)`, background:'transparent', color:'var(--purple)', cursor:'pointer' }}>
          {showAddMore ? 'Ascunde' : '+ Adaugă altă factură'}
        </button>
        <button onClick={onEditPrimary} style={{ fontSize:'12px', fontWeight:600, padding:'8px 14px', borderRadius:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer' }}>
          Schimbă documentul principal
        </button>
      </div>

      {showAddMore && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px', padding:'14px', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'10px' }}>
          <p style={{ fontSize:'11px', color:'var(--text-muted)' }}>Adaugă una sau mai multe facturi pentru aceeași plată/comandă.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <input value={addFurnizor} onChange={e => setAddFurnizor(e.target.value)} placeholder="Furnizor factură" style={{ fontSize:'12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', color:'var(--text-primary)', outline:'none' }} />
            <input value={addSuma} onChange={e => setAddSuma(e.target.value)} placeholder={`Suma (din ${tx.suma?.toFixed(2)} total)`} inputMode="decimal" style={{ fontSize:'12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', color:'var(--text-primary)', outline:'none' }} />
          </div>
          <DocumentLinkInput mode="add" txId={tx.id} firmaId={firmaId} lunaId={lunaId} addFurnizor={addFurnizor} addSuma={addSuma} onSuccess={onRefresh} culoare={culoare} />
          <DocumentUpload mode="add" txId={tx.id} firmaId={firmaId} lunaId={lunaId} addFurnizor={addFurnizor} addSuma={addSuma} onSuccess={onRefresh} culoare={culoare} compact />
        </div>
      )}
    </div>
  )
}
