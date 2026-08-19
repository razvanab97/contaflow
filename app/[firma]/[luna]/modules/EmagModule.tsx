'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import CopyButton from '@/components/CopyButton'
import { legibil } from '@/lib/colors'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface ChecklistItem { id:string; completat:boolean; checklist_templates?:{ titlu:string; descriere?:string; modul:string; ordine:number } }
interface EmagDoc { id:string; fisier_nume:string; category:string; effect:'cheltuiala'|'reducere'; amount:number; invoiceNumber:string; date:string; notes:string }
interface EmagSummary { bankReceipts:number; bankPayments:number; bankCashflow:number; emagExpenses:number; emagReductions:number; emagNetCost:number }
interface OldDoc { id:string; fisier_nume:string; tip_document?:string }
interface AvizFactura { id:string; categorie:string; id_document:string; serie_document:string; numar_cautare:string; data_document:string; valoare:number; copiat:boolean; factura_document_id:string|null; factura_fisier_nume:string|null }
interface AvizData { documentId:string; avizNumber:string; fisierNume:string; invoices:AvizFactura[] }

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

  const INP: React.CSSProperties = { fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'7px', padding:'8px 11px', color:'var(--c-bbbbbb)', outline:'none', width:'100%' }

  return (
    <div style={{ background:'var(--c-111111)', border:`1px solid ${open ? `rgba(${r},.25)` : 'var(--c-1e1e1e)'}`, borderRadius:'10px', overflow:'hidden', transition:'border-color .2s' }}>
      <button onClick={toggle} style={{ width:'100%', display:'flex', alignItems:'center', gap:'12px', padding:'14px 18px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
        {/* Status dot */}
        <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: docs.length > 0 ? 'var(--accent-mint)' : item.completat ? culoare : 'var(--c-2a2a2a)' }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-e0e0e0)' }}>{t?.titlu}</div>
          {t?.descriere && <div style={{ fontSize:'11px', color:'var(--c-777777)', marginTop:'2px' }}>{t.descriere}</div>}
        </div>
        {docs.length > 0 && !loading && (
          <span style={{ fontSize:'11px', fontWeight:600, color:'var(--accent-mint)', flexShrink:0 }}>{docs.length} doc{docs.length>1?'umente':''}</span>
        )}
        <svg width="14" height="14" fill="none" stroke="var(--c-555555)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0, transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding:'0 18px 16px', borderTop:'1px solid var(--c-1a1a1a)' }}>
          {loading && <p style={{ fontSize:'12px', color:'var(--c-777777)', padding:'12px 0 4px' }}>Se încarcă...</p>}

          {docs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'5px', padding:'12px 0 10px' }}>
              {docs.map(doc => (
                <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'7px' }}>
                  <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:culoare, flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:'12px', color:'var(--c-cccccc)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</span>
                  {doc.tip_document && <span style={{ fontSize:'10px', color:'var(--c-666666)' }}>{doc.tip_document}</span>}
                  <a href={`/api/checklist/docs?docId=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:600, color:legibil(culoare) }}>↓</a>
                  <button onClick={() => deleteDoc(doc.id)} style={{ fontSize:'11px', color:'var(--accent-red)', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files.length && upload(e.dataTransfer.files) }}
            style={{ border:`1.5px dashed ${drag ? culoare : 'var(--c-252525)'}`, borderRadius:'8px', padding:'14px', textAlign:'center', cursor:'pointer', background: drag ? `rgba(${r},.04)` : 'var(--c-0d0d0d)', marginTop: docs.length > 0 ? '4px' : '12px' }}
          >
            <p style={{ fontSize:'12px', color: uploading ? 'var(--c-777777)' : 'var(--c-888888)', fontWeight:600 }}>
              {uploading ? 'Se încarcă...' : '+ Adaugă aviz PDF / JPG'}
            </p>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files && upload(e.target.files)}/>
          {error && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'6px' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

function FacturaRow({ inv, firmaId, lunaId, culoare, onChange }: {
  inv: AvizFactura; firmaId:string; lunaId:string; culoare:string; onChange:()=>void
}) {
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function markCopied() {
    if (inv.copiat) return
    await fetch('/api/emag/aviz/factura', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:inv.id, copiat:true }) })
    onChange()
  }
  async function unmarkCopied() {
    await fetch('/api/emag/aviz/factura', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:inv.id, copiat:false }) })
    onChange()
  }
  async function uploadFactura(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('facturaId', inv.id)
    fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId)
    await fetch('/api/emag/aviz/factura', { method:'POST', body:fd })
    onChange()
    setUploading(false)
  }
  async function removeFactura() {
    if (!confirm('Ștergi factura încărcată?')) return
    await fetch(`/api/emag/aviz/factura?facturaId=${encodeURIComponent(inv.id)}`, { method:'DELETE' })
    onChange()
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--c-161616)', borderRadius:'7px', flexWrap:'wrap' }}>
      <span style={{ flex:1, minWidth:'140px', fontSize:'12px', color:'var(--c-cccccc)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.categorie} · {money(inv.valoare)} RON</span>
      <span style={{ fontSize:'13px', fontWeight:700, color:'var(--c-ffffff)', fontFamily:'monospace' }}>{inv.numar_cautare}</span>
      <div style={{ position:'relative', display:'inline-flex' }}>
        <CopyButton value={inv.numar_cautare} onCopy={markCopied}/>
        {inv.copiat && (
          <button onClick={unmarkCopied} title="Cod deja folosit — click pentru anulare" style={{ position:'absolute', top:'-6px', right:'-6px', width:'14px', height:'14px', borderRadius:'50%', background:'var(--accent-red)', border:'1px solid var(--c-0d0d0d)', color:'var(--c-ffffff)', fontSize:'9px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1, padding:0 }}>
            ✕
          </button>
        )}
      </div>
      {inv.factura_document_id ? (
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <a href={`/api/emag?docId=${encodeURIComponent(inv.factura_document_id)}`} style={{ fontSize:'11px', fontWeight:600, color:'var(--accent-mint)' }}>✓ {inv.factura_fisier_nume || 'factură'}</a>
          <button onClick={removeFactura} style={{ fontSize:'10px', color:'var(--accent-red)', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
        </div>
      ) : (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && uploadFactura(e.dataTransfer.files[0]) }}
            style={{ fontSize:'11px', fontWeight:600, padding:'5px 10px', borderRadius:'6px', border:`1px dashed ${drag ? culoare : 'var(--c-333333)'}`, background: drag ? 'var(--overlay-hover)' : 'transparent', color:'var(--c-888888)', cursor:'pointer' }}
          >
            {uploading ? '...' : '+ Factură'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files?.[0] && uploadFactura(e.target.files[0])}/>
        </>
      )}
    </div>
  )
}

function BulkUploadZone({ documentId, firmaId, lunaId, culoare, onChange }: {
  documentId:string; firmaId:string; lunaId:string; culoare:string; onChange:()=>void
}) {
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [result, setResult] = useState<{ matched:{fileName:string;numarCautare:string}[]; unmatched:{fileName:string;reason:string}[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)

  async function uploadBulk(files: FileList) {
    setUploading(true); setResult(null)
    const fd = new FormData()
    for (const f of Array.from(files)) fd.append('files', f)
    fd.append('documentId', documentId)
    fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId)
    const res = await fetch('/api/emag/aviz/factura/bulk', { method:'POST', body:fd })
    const d = await res.json().catch(() => ({ matched:[], unmatched:[] }))
    setResult(d)
    onChange()
    setUploading(false)
  }

  return (
    <div style={{ marginTop:'10px' }}>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files.length && uploadBulk(e.dataTransfer.files) }}
        style={{ border:`1.5px dashed ${drag ? culoare : 'var(--c-252525)'}`, borderRadius:'8px', padding:'12px', textAlign:'center', cursor:'pointer', background: drag ? `rgba(${r},.04)` : 'var(--c-0d0d0d)' }}
      >
        <p style={{ fontSize:'11px', color: uploading ? 'var(--c-777777)' : 'var(--c-888888)', fontWeight:600 }}>
          {uploading ? 'Se asociază facturile...' : '+ Adaugă toate facturile deodată (se asociază automat)'}
        </p>
      </div>
      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files?.length && uploadBulk(e.target.files)}/>
      {result && (
        <div style={{ marginTop:'8px', display:'flex', flexDirection:'column', gap:'3px' }}>
          {result.matched.length > 0 && (
            <span style={{ fontSize:'11px', color:'var(--accent-mint)' }}>✓ {result.matched.length} factur{result.matched.length===1?'ă asociată':'i asociate'} automat</span>
          )}
          {result.unmatched.length > 0 && (
            <div>
              <span style={{ fontSize:'11px', color:'var(--accent-red)', fontWeight:600 }}>
                {result.unmatched.length} nu s-a{result.unmatched.length===1?'':'u'}u putut asocia — încarcă-le manual pe rândul potrivit:
              </span>
              {result.unmatched.map(u => (
                <div key={u.fileName} style={{ fontSize:'11px', color:'var(--c-888888)', marginTop:'2px' }}>· {u.fileName}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AvizUploadRow({ taskKey, label, descriere, data, firmaId, lunaId, culoare, onChange }: {
  taskKey:string; label:string; descriere?:string; data?:AvizData; firmaId:string; lunaId:string; culoare:string
  onChange:()=>void
}) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)

  async function upload(file: File) {
    setUploading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId)
    fd.append('taskKey', taskKey)
    const res = await fetch('/api/emag/aviz', { method:'POST', body:fd })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setError(d.error || 'Eroare la procesarea avizului')
    else onChange()
    setUploading(false)
  }

  async function removeAviz() {
    if (!data || !confirm('Ștergi avizul și facturile extrase din el?')) return
    const res = await fetch(`/api/emag/aviz?id=${encodeURIComponent(data.documentId)}`, { method:'DELETE' })
    if (res.ok) onChange()
  }

  return (
    <div style={{ background:'var(--c-111111)', border:`1px solid ${open ? `rgba(${r},.25)` : 'var(--c-1e1e1e)'}`, borderRadius:'10px', overflow:'hidden', transition:'border-color .2s' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:'100%', display:'flex', alignItems:'center', gap:'12px', padding:'14px 18px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
        <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: data ? 'var(--accent-mint)' : 'var(--c-2a2a2a)' }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-e0e0e0)' }}>{label}</div>
          {descriere && <div style={{ fontSize:'11px', color:'var(--c-777777)', marginTop:'2px' }}>{descriere}</div>}
        </div>
        {data && <span style={{ fontSize:'11px', fontWeight:600, color:'var(--accent-mint)', flexShrink:0 }}>{data.invoices.length} factur{data.invoices.length===1?'ă':'i'}</span>}
        <svg width="14" height="14" fill="none" stroke="var(--c-555555)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0, transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding:'0 18px 16px', borderTop:'1px solid var(--c-1a1a1a)' }}>
          {data ? (
            <div style={{ padding:'12px 0 4px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                <span style={{ fontSize:'11px', color:'var(--c-888888)' }}>Aviz {data.avizNumber || data.fisierNume}</span>
                <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
                  <a href={`/api/emag/aviz/pdf?documentId=${encodeURIComponent(data.documentId)}`} style={{ fontSize:'11px', fontWeight:600, color:legibil(culoare) }}>↓ PDF (aviz + facturi)</a>
                  <button onClick={removeAviz} style={{ fontSize:'11px', color:'var(--accent-red)', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
                </div>
              </div>
              {data.invoices.length === 0 ? (
                <p style={{ fontSize:'12px', color:'var(--c-666666)' }}>Nicio factură detectată în aviz.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                  {data.invoices.map(inv => (
                    <FacturaRow key={inv.id} inv={inv} firmaId={firmaId} lunaId={lunaId} culoare={culoare} onChange={onChange}/>
                  ))}
                </div>
              )}
              {data.invoices.some(inv => !inv.factura_document_id) && (
                <BulkUploadZone documentId={data.documentId} firmaId={firmaId} lunaId={lunaId} culoare={culoare} onChange={onChange}/>
              )}
            </div>
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && upload(e.dataTransfer.files[0]) }}
              style={{ border:`1.5px dashed ${drag ? culoare : 'var(--c-252525)'}`, borderRadius:'8px', padding:'14px', textAlign:'center', cursor:'pointer', background: drag ? `rgba(${r},.04)` : 'var(--c-0d0d0d)', marginTop:'12px' }}
            >
              <p style={{ fontSize:'12px', color: uploading ? 'var(--c-777777)' : 'var(--c-888888)', fontWeight:600 }}>
                {uploading ? 'Se procesează avizul...' : '+ Adaugă aviz PDF'}
              </p>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])}/>
          {error && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'6px' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function EmagModule({ firma, lunaId, tasks, checklistItems }: Props) {
  const [summary, setSummary] = useState<EmagSummary|null>(null)
  const [docs, setDocs] = useState<EmagDoc[]>([])
  const [avizData, setAvizData] = useState<Record<string, AvizData>>({})
  const [file, setFile] = useState<File|null>(null)
  const [drag, setDrag] = useState(false)
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(firma.culoare)
  const INP: React.CSSProperties = { fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'9px 12px', color:'var(--c-bbbbbb)', outline:'none', width:'100%' }

  const load = useCallback(async () => {
    const res = await fetch(`/api/emag?lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setDocs(data.documents || []); setSummary(data.summary || null) }
  }, [lunaId])

  const loadAvize = useCallback(async () => {
    const res = await fetch(`/api/emag/aviz?lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setAvizData(data)
  }, [lunaId])

  useEffect(() => { load(); loadAvize() }, [load, loadAvize])

  async function addDoc() {
    if (!file) return
    setBusy(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('firmaId', firma.id)
    fd.append('lunaId', lunaId)
    fd.append('category', 'automat')
    fd.append('effect', 'automat')
    fd.append('amount', amount)
    fd.append('invoiceNumber', invoiceNumber)
    fd.append('date', date)
    const res = await fetch('/api/emag', { method:'POST', body:fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setFile(null); setAmount(''); setInvoiceNumber(''); await load() }
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

      {/* Avize de plată — încarcă PDF-ul, AI-ul extrage facturile de căutat + copy */}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2px' }}>
          <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-666666)', textTransform:'uppercase', letterSpacing:'.1em' }}>
            Avize de plată
          </span>
          <button onClick={savePdf} disabled={pdfBusy} style={{ fontSize:'11px', fontWeight:600, padding:'5px 13px', borderRadius:'7px', border:`1px solid ${firma.culoare}`, background:'transparent', color:legibil(firma.culoare), cursor:'pointer', opacity:pdfBusy?.6:1 }}>
            {pdfBusy ? 'Se generează...' : 'Descarcă tot'}
          </button>
        </div>
        {tasks.filter(t => t.key.startsWith('emag.aviz_')).map(t => (
          <AvizUploadRow key={t.key} taskKey={t.key} label={t.label} descriere={t.descriere} data={avizData[t.key]} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare} onChange={loadAvize}/>
        ))}
      </div>

      {/* Avize de plată din sistemul vechi (cu documente deja încărcate) */}
      {sortedItems.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'var(--c-666666)', textTransform:'uppercase', letterSpacing:'.1em' }}>
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
      <div style={{ background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--c-1a1a1a)' }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-e0e0e0)' }}>Facturi Dante International</div>
          <div style={{ fontSize:'12px', color:'var(--c-888888)', marginTop:'2px' }}>
            {docs.length > 0
              ? `${docs.length} facturi · cost net ${money(summary?.emagNetCost || 0)} RON`
              : 'Adaugă facturi Dante prin PDF'}
          </div>
        </div>

        <div style={{ padding:'16px 20px' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'5px', background:'var(--c-161616)', borderRadius:'8px' }}>
              <span style={{ flex:1, fontSize:'12px', color:'var(--c-cccccc)' }}>
                <strong style={{ color: doc.effect==='reducere' ? 'var(--accent-mint)' : 'var(--accent-red)' }}>
                  {doc.effect==='reducere' ? '−' : '+'}{money(doc.amount)} RON
                </strong>
                {' · '}{doc.fisier_nume}
              </span>
              <a href={`/api/emag?docId=${encodeURIComponent(doc.id)}`} style={{ fontSize:'10px', color:legibil(firma.culoare) }}>↓</a>
              <button onClick={() => removeDoc(doc.id)} style={{ fontSize:'10px', color:'var(--accent-red)', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          ))}

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && setFile(e.dataTransfer.files[0]) }}
            style={{ border:`1.5px dashed ${drag ? firma.culoare : 'var(--c-252525)'}`, borderRadius:'8px', padding:'14px', textAlign:'center', cursor:'pointer', background: drag ? `rgba(${r},.04)` : 'var(--c-0d0d0d)', marginTop: docs.length > 0 ? '10px' : '0' }}
          >
            <p style={{ fontSize:'12px', color: file ? 'var(--c-cccccc)' : 'var(--c-888888)', fontWeight:600 }}>
              {file ? file.name : '+ Adaugă PDF factură Dante'}
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}/>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginTop:'8px' }}>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Suma RON (opțional, se detectează automat)" style={INP}/>
            <input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="Nr. factură (opțional)" style={INP}/>
          </div>
          <button onClick={addDoc} disabled={busy || !file} style={{ marginTop:'8px', width:'100%', padding:'9px', borderRadius:'8px', border:'none', background: busy || !file ? 'var(--c-1a1a1a)' : firma.culoare, color: busy || !file ? 'var(--c-555555)' : 'var(--c-ffffff)', fontSize:'12px', fontWeight:600, cursor: busy || !file ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Se importă...' : '+ Adaugă factură'}
          </button>
          {error && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'8px' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
