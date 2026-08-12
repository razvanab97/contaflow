'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import { legibil } from '@/lib/colors'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface ChecklistItem { id:string; completat:boolean; checklist_templates?:{ titlu:string; descriere?:string; modul:string; ordine:number } }
interface EmagDoc { id:string; fisier_nume:string; category:string; effect:'cheltuiala'|'reducere'; amount:number; invoiceNumber:string; date:string; notes:string }
interface EmagSummary { bankReceipts:number; bankPayments:number; bankCashflow:number; emagExpenses:number; emagReductions:number; emagNetCost:number }
interface OldDoc { id:string; fisier_nume:string; tip_document?:string }

interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  checklistItems: ChecklistItem[]
}

function money(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v||0) }
function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

function AvizRow({ item, lunaId, firmaId, culoare }: { item:ChecklistItem; lunaId:string; firmaId:string; culoare:string }) {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<OldDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)
  const t = item.checklist_templates

  const loadDocs = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/checklist/docs?itemId=${item.id}`)
    if (res.ok) { const d = await res.json(); setDocs(d.docs || []) }
    setLoading(false)
  }, [item.id])

  async function toggle() {
    if (!open) await loadDocs()
    setOpen(v => !v)
  }

  async function upload(files: FileList) {
    setUploading(true); setError('')
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f); fd.append('itemId', item.id)
      fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
      fd.append('tip', 'aviz_plata'); fd.append('desc', t?.titlu || '')
      const res = await fetch('/api/checklist/upload', { method:'POST', body:fd })
      if (!res.ok) { setError((await res.json().catch(()=>({}))).error || 'Eroare upload'); break }
    }
    await loadDocs(); setUploading(false)
  }

  async function deleteDoc(id: string) {
    const res = await fetch('/api/checklist/docs', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itemId:item.id, ids:[id] }) })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== id))
  }

  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'7px', padding:'8px 11px', color:'#BBB', outline:'none', width:'100%' }

  return (
    <div style={{ background:'#111', border:`1px solid ${open ? `rgba(${r},.25)` : '#1E1E1E'}`, borderRadius:'10px', overflow:'hidden', transition:'border-color .2s' }}>
      <button onClick={toggle} style={{ width:'100%', display:'flex', alignItems:'center', gap:'12px', padding:'14px 18px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
        {/* Status dot */}
        <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: docs.length > 0 ? '#6EE7B0' : item.completat ? culoare : '#2A2A2A' }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'#E0E0E0' }}>{t?.titlu}</div>
          {t?.descriere && <div style={{ fontSize:'11px', color:'#777', marginTop:'2px' }}>{t.descriere}</div>}
        </div>
        {docs.length > 0 && !loading && (
          <span style={{ fontSize:'11px', fontWeight:600, color:'#6EE7B0', flexShrink:0 }}>{docs.length} doc{docs.length>1?'umente':''}</span>
        )}
        <svg width="14" height="14" fill="none" stroke="#555" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0, transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding:'0 18px 16px', borderTop:'1px solid #1A1A1A' }}>
          {loading && <p style={{ fontSize:'12px', color:'#777', padding:'12px 0 4px' }}>Se încarcă...</p>}

          {docs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'5px', padding:'12px 0 10px' }}>
              {docs.map(doc => (
                <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#161616', borderRadius:'7px' }}>
                  <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:culoare, flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:'12px', color:'#CCC', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</span>
                  {doc.tip_document && <span style={{ fontSize:'10px', color:'#666' }}>{doc.tip_document}</span>}
                  <a href={`/api/checklist/docs?docId=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:600, color:legibil(culoare) }}>↓</a>
                  <button onClick={() => deleteDoc(doc.id)} style={{ fontSize:'11px', color:'#F87171', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files.length && upload(e.dataTransfer.files) }}
            style={{ border:`1.5px dashed ${drag ? culoare : '#252525'}`, borderRadius:'8px', padding:'14px', textAlign:'center', cursor:'pointer', background: drag ? `rgba(${r},.04)` : '#0D0D0D', marginTop: docs.length > 0 ? '4px' : '12px' }}
          >
            <p style={{ fontSize:'12px', color: uploading ? '#777' : '#888', fontWeight:600 }}>
              {uploading ? 'Se încarcă...' : '+ Adaugă aviz PDF / JPG'}
            </p>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e => e.target.files && upload(e.target.files)}/>
          {error && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'6px' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function EmagModule({ firma, lunaId, tasks, checklistItems }: Props) {
  const [summary, setSummary] = useState<EmagSummary|null>(null)
  const [docs, setDocs] = useState<EmagDoc[]>([])
  const [url, setUrl] = useState('')
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const r = rgb(firma.culoare)
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'9px 12px', color:'#BBB', outline:'none', width:'100%' }

  const load = useCallback(async () => {
    const res = await fetch(`/api/emag?lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setDocs(data.documents || []); setSummary(data.summary || null) }
  }, [lunaId])

  useEffect(() => { load() }, [load])

  async function addDoc() {
    if (!url) return
    setBusy(true); setError('')
    const res = await fetch('/api/emag', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url, firmaId:firma.id, lunaId, category:'automat', effect:'automat', amount, invoiceNumber, date }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setUrl(''); setAmount(''); setInvoiceNumber(''); await load() }
    setBusy(false)
  }

  async function removeDoc(id: string) {
    if (!confirm('Ștergi factura?')) return
    const res = await fetch(`/api/emag?id=${encodeURIComponent(id)}`, { method:'DELETE' })
    if (res.ok) await load()
  }

  async function savePdf() {
    setPdfBusy(true)
    const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, title:`Facturi_eMAG_Dante_${firma.nume}`, scope:{ section:'emag-calcul' } }) })
    if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`Facturi_eMAG_Dante_${firma.nume}.pdf`; a.click(); URL.revokeObjectURL(u) }
    setPdfBusy(false)
  }

  const sortedItems = [...checklistItems].sort((a, b) => (a.checklist_templates?.ordine||0) - (b.checklist_templates?.ordine||0))
  const done = tasks.filter(t => t.completat).length
  const total = tasks.length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

      {/* Task-uri bifabile */}
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      {/* Avize de plată din sistemul vechi (cu documente deja încărcate) */}
      {sortedItems.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:'.1em' }}>
              Avize de plată
            </span>
            <button onClick={savePdf} disabled={pdfBusy} style={{ fontSize:'11px', fontWeight:600, padding:'5px 13px', borderRadius:'7px', border:`1px solid ${firma.culoare}`, background:'transparent', color:legibil(firma.culoare), cursor:'pointer', opacity:pdfBusy?.6:1 }}>
              {pdfBusy ? 'Se generează...' : 'Salvează PDF'}
            </button>
          </div>
          {sortedItems.map(item => (
            <AvizRow key={item.id} item={item} lunaId={lunaId} firmaId={firma.id} culoare={firma.culoare}/>
          ))}
        </div>
      )}

      {/* Facturi Dante International */}
      <div style={{ background:'#111', border:'1px solid #1E1E1E', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #1A1A1A' }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'#E0E0E0' }}>Facturi Dante International</div>
          <div style={{ fontSize:'12px', color:'#888', marginTop:'2px' }}>
            {docs.length > 0
              ? `${docs.length} facturi · cost net ${money(summary?.emagNetCost || 0)} RON`
              : 'Adaugă facturi Dante prin link PDF'}
          </div>
        </div>

        <div style={{ padding:'16px 20px' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'5px', background:'#161616', borderRadius:'8px' }}>
              <span style={{ flex:1, fontSize:'12px', color:'#CCC' }}>
                <strong style={{ color: doc.effect==='reducere' ? '#6EE7B0' : '#F87171' }}>
                  {doc.effect==='reducere' ? '−' : '+'}{money(doc.amount)} RON
                </strong>
                {' · '}{doc.fisier_nume}
              </span>
              <a href={`/api/emag?docId=${encodeURIComponent(doc.id)}`} style={{ fontSize:'10px', color:legibil(firma.culoare) }}>↓</a>
              <button onClick={() => removeDoc(doc.id)} style={{ fontSize:'10px', color:'#F87171', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          ))}

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px', marginTop: docs.length > 0 ? '10px' : '0' }}>
            <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Link PDF factură Dante" style={INP}/>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Suma RON" style={INP}/>
            <input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="Nr. factură" style={INP}/>
          </div>
          <button onClick={addDoc} disabled={busy || !url} style={{ marginTop:'8px', width:'100%', padding:'9px', borderRadius:'8px', border:'none', background: busy || !url ? '#1A1A1A' : firma.culoare, color: busy || !url ? '#555' : '#FFF', fontSize:'12px', fontWeight:600, cursor: busy || !url ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Se importă...' : '+ Adaugă factură din link'}
          </button>
          {error && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
