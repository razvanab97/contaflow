'use client'
import { useEffect, useState } from 'react'

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next) }, [file])
  return file.type.startsWith('image/') && url ? <img src={url} alt={file.name} style={{ width: 100, height: 80, objectFit: 'contain', background: 'white' }}/> : <span>PDF</span>
}

export default function OfferUpload({ purchaseId, status, onUploaded }: { purchaseId: string; status: string; onUploaded: () => void }) {
  const [supplier, setSupplier] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  function add(incoming: File[]) {
    if (busy) return
    setMessage('')
    if (incoming.some(file => !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type))) { setMessage('Acceptăm doar PDF, JPG și PNG.'); return }
    if (files.length + incoming.length > 10 || [...files,...incoming].reduce((sum,file)=>sum+file.size,0)>4*1024*1024) { setMessage('Maximum 10 fișiere și 4 MB în total pentru o ofertă.'); return }
    setFiles(previous=>[...previous,...incoming])
  }
  async function save() {
    if (busy || !supplier.trim() || !files.length) return
    setBusy(true); setMessage('')
    try {
      const { mergeOfferFiles } = await import('@/lib/achizitii-offer-files')
      const inputs = await Promise.all(files.map(async file=>({type:file.type,bytes:new Uint8Array(await file.arrayBuffer())})))
      const bytes = await mergeOfferFiles(inputs)
      const form = new FormData()
      form.append('file',new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),'Oferta.pdf')
      form.append('achizitieId',purchaseId);form.append('etapa',status);form.append('tipDosar','oferta');form.append('furnizorOferta',supplier.trim())
      const response = await fetch('/api/achizitii/documente',{method:'POST',body:form})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error||'Oferta nu a putut fi salvată.')
      setFiles([]);setSupplier('');setMessage('Oferta a fost salvată ca un singur PDF. Poți adăuga următorul furnizor.');onUploaded()
    } catch(error) { setMessage(error instanceof Error?error.message:'Oferta nu a putut fi salvată.') }
    finally { setBusy(false) }
  }
  return <section style={{width:'100%',padding:12,border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontSize:'var(--fs-sm)'}}>
    <strong>Adaugă o ofertă — toate paginile aceluiași furnizor</strong>
    <label style={{display:'block',marginTop:8}}>Furnizorul ofertei
      <input value={supplier} maxLength={120} disabled={busy} onChange={e=>setSupplier(e.target.value)} placeholder="ex. Furnizorul A" style={{display:'block',padding:8,width:'100%',marginTop:4,border:'1px solid var(--border)',borderRadius:'var(--r-md)',background:'var(--surface-sunken)',color:'var(--text-primary)'}}/>
    </label>
    <div role="region" aria-label="Lipește pozele ofertei din clipboard" tabIndex={0} onPaste={event=>{const images=Array.from(event.clipboardData.items).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>!!file);if(images.length){event.preventDefault();add(images)}}} style={{marginTop:10,padding:14,border:'1px dashed var(--border-strong)',borderRadius:'var(--r-md)'}}>
      Click aici și lipește pozele pe rând cu Cmd+V / Ctrl+V. Ordinea de mai jos va fi ordinea paginilor în PDF.
      <label className="btn btn-sm" style={{display:'inline-flex',marginTop:8,cursor:'pointer'}}>Selectează poze / PDF
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple disabled={busy} style={{display:'none'}} onChange={e=>{add(Array.from(e.target.files||[]));e.target.value=''}}/>
      </label>
    </div>
    {files.map((file,index)=><div key={index} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:8}}><FilePreview file={file}/><span>{index+1}. {file.name}</span><button type="button" className="btn btn-sm" disabled={busy||index===0} onClick={()=>setFiles(previous=>{const next=[...previous];[next[index-1],next[index]]=[next[index],next[index-1]];return next})}>Mută mai sus</button><button type="button" className="btn btn-sm" disabled={busy} onClick={()=>setFiles(previous=>previous.filter((_,i)=>i!==index))}>Elimină</button></div>)}
    <p style={{margin:'10px 0',color:'var(--text-secondary)'}}>{files.length} fișiere · se salvează ca o singură ofertă PDF, nu ca {files.length} oferte. Maximum 4 MB în total. Repetă pentru ceilalți furnizori.</p>
    <button type="button" className="btn btn-sm btn-primary" disabled={busy||!supplier.trim()||!files.length} onClick={()=>void save()}>{busy?'Se pregătește și salvează PDF-ul…':'Salvează această ofertă'}</button>
    {message&&<p role="status" style={{marginTop:8}}>{message}</p>}
  </section>
}
