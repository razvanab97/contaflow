'use client'
import { useState } from 'react'

const INP: React.CSSProperties = { fontSize:'var(--fs-sm)', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'var(--r-md)', padding:'8px 12px', color:'var(--text-primary)', outline:'none', width:'100%' }

export default function DocumentLinkInput({ mode, txId, firmaId, lunaId, tip, furnizor, numDoc, addFurnizor, addSuma, onSuccess, culoare }: {
  mode: 'main'|'add'
  txId: string; firmaId: string; lunaId: string
  tip?: string; furnizor?: string; numDoc?: string
  addFurnizor?: string; addSuma?: string
  onSuccess: () => void
  culoare: string
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!url) return
    setBusy(true); setError('')
    const res = await fetch('/api/chitante/import-url', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        url, firmaId, lunaId, transactionId: txId,
        documentType: mode === 'main' ? (tip || 'factura') : 'factura',
        supplier: mode === 'main' ? furnizor : (addFurnizor || undefined),
        reference: mode === 'main' ? numDoc : undefined,
        mode: mode === 'add' ? 'add' : undefined,
        suma: mode === 'add' && addSuma ? Number(addSuma) : undefined,
      }),
    })
    setBusy(false)
    if (res.ok) { setUrl(''); setOpen(false); onSuccess(); return }
    setError((await res.json().catch(() => ({}))).error || 'Importul din link nu a reușit')
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-secondary)', background:'transparent', border:'1px dashed var(--border)', borderRadius:'var(--r-md)', padding:'8px 12px', cursor:'pointer', width:'100%', textAlign:'center' }}>
        🔗 Adaugă prin link
      </button>
    )
  }

  return (
    <div style={{ padding:'10px', background:'var(--surface-secondary)', border:'1px solid var(--border)', borderRadius:'var(--r-md)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'8px' }}>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Link PDF (Oblio, Booking, Airbnb, etc.)" style={INP} autoFocus />
        <button onClick={submit} disabled={busy || !url} style={{ fontSize:'var(--fs-sm)', fontWeight:600, padding:'8px 14px', borderRadius:'var(--r-md)', border:'none', background:'var(--accent)', color:'#fff', cursor:'pointer', opacity:(busy||!url)?.5:1 }}>
          {busy ? 'Se adaugă...' : 'Adaugă'}
        </button>
        <button onClick={() => { setOpen(false); setUrl(''); setError('') }} style={{ fontSize:'var(--fs-sm)', color:'var(--text-muted)', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
      </div>
      {error && <p style={{ fontSize:'var(--fs-xs)', color:'var(--danger)', marginTop:'6px' }}>{error}</p>}
    </div>
  )
}
