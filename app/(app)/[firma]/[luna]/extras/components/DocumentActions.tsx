'use client'
import { useState } from 'react'
import type { Tx } from './types'
import InboxSearch from './InboxSearch'
import DocumentLinkInput from './DocumentLinkInput'
import DocumentUpload from './DocumentUpload'

const INP: React.CSSProperties = { fontSize:'12px', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', color:'var(--text-primary)', outline:'none', width:'100%' }

export default function DocumentActions({ tx, firmaId, lunaId, culoare, onSuccess, initialTip, initialFurnizor, initialNumDoc, title = 'Nu este documentul potrivit?' }: {
  tx: Tx; firmaId: string; lunaId: string; culoare: string; onSuccess: () => void
  initialTip?: string; initialFurnizor?: string; initialNumDoc?: string
  title?: string
}) {
  const [tip, setTip] = useState(initialTip || 'factura')
  const [furnizor, setFurnizor] = useState(initialFurnizor || '')
  const [numDoc, setNumDoc] = useState(initialNumDoc || '')
  const [showUpload, setShowUpload] = useState(false)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      <p style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)' }}>{title}</p>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
        <select value={tip} onChange={e => setTip(e.target.value)} style={INP}>
          <option value="factura">Factură</option>
          <option value="aviz_plata">Aviz plată</option>
          <option value="chitanta">Chitanță</option>
          <option value="ordin_plata">Ordin plată</option>
          <option value="contract">Contract</option>
          <option value="dispozitie_plata">Dispoziție plată</option>
          <option value="altul">Altul</option>
        </select>
        <input type="text" placeholder="Furnizor / Client" value={furnizor} onChange={e => setFurnizor(e.target.value)} style={INP} />
        <input type="text" placeholder="Nr. document" value={numDoc} onChange={e => setNumDoc(e.target.value)} style={INP} />
      </div>

      <InboxSearch tx={tx} firmaId={firmaId} onAssociated={onSuccess} />
      <DocumentLinkInput mode="main" txId={tx.id} firmaId={firmaId} lunaId={lunaId} tip={tip} furnizor={furnizor} numDoc={numDoc} onSuccess={onSuccess} culoare={culoare} />

      {showUpload ? (
        <DocumentUpload mode="main" txId={tx.id} firmaId={firmaId} lunaId={lunaId} tip={tip} furnizor={furnizor} numDoc={numDoc} onSuccess={onSuccess} culoare={culoare} />
      ) : (
        <button onClick={() => setShowUpload(true)} style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', background:'transparent', border:'1px dashed var(--border)', borderRadius:'8px', padding:'8px 12px', cursor:'pointer', width:'100%', textAlign:'center' }}>
          📎 Încarcă document
        </button>
      )}
    </div>
  )
}
