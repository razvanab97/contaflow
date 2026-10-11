'use client'
import { useEffect, useState } from 'react'
import VeziButon from '@/components/ui/VeziButon'
import { isOfferPdf } from '@/lib/achizitii-offer-number'

interface SavedOffer { id: string; fisier_nume: string; fisier_tip?: string | null; furnizor?: string | null }

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next) }, [file])
  return file.type.startsWith('image/') && url ? <img src={url} alt={file.name} style={{ width: 100, height: 80, objectFit: 'contain', background: 'white' }}/> : <span>PDF</span>
}

export default function OfferUpload({ purchaseId, status, onUploaded, complete = false, revision = '' }: { purchaseId: string; status: string; onUploaded: () => void; complete?: boolean; revision?: string }) {
  const [supplier, setSupplier] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [offers, setOffers] = useState<SavedOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError(''); setOffers([])
    async function load() {
      try {
        const response = await fetch(`/api/achizitii/documente?achizitieId=${encodeURIComponent(purchaseId)}`, { signal: controller.signal, cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || !Array.isArray(result)) throw new Error('Lista ofertelor nu a putut fi încărcată.')
        if (!controller.signal.aborted) setOffers(result.filter(isOfferPdf).sort((a, b) => a.fisier_nume.localeCompare(b.fisier_nume, 'ro', { numeric: true })))
      } catch {
        if (!controller.signal.aborted) setLoadError('Lista ofertelor nu a putut fi încărcată.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [purchaseId, revision, refresh])
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
      setFiles([]);setSupplier('');setMessage(`${result.fisier_nume} a fost salvat ca un singur PDF.`);setRefresh(value=>value+1);onUploaded()
    } catch(error) { setMessage(error instanceof Error?error.message:'Oferta nu a putut fi salvată.') }
    finally { setBusy(false) }
  }
  return <section style={{width:'100%',padding:12,border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontSize:'var(--fs-sm)'}}>
    <strong>Oferte salvate — PDF individual</strong>
    {loading && <p role="status">Se încarcă ofertele…</p>}
    {loadError && <p role="alert">{loadError} <button type="button" className="btn btn-sm" onClick={()=>setRefresh(value=>value+1)}>Reîncearcă</button></p>}
    {!loading && !loadError && !offers.length && <p>Nu există încă oferte PDF salvate în acest dosar.</p>}
    {offers.map(offer => <div key={offer.id} style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:8,marginTop:8,padding:10,border:'1px solid var(--border)',borderRadius:'var(--r-md)'}}>
      <span style={{flex:'1 1 200px',overflowWrap:'anywhere'}}>{offer.fisier_nume}{offer.furnizor ? ` · ${offer.furnizor}` : ''}</span>
      <VeziButon url={`/api/chitante/document?id=${encodeURIComponent(offer.id)}`} nume={offer.fisier_nume}/>
      <a className="btn btn-sm" href={`/api/chitante/document?id=${encodeURIComponent(offer.id)}`} download={offer.fisier_nume} aria-label={`Descarcă ${offer.fisier_nume}${offer.furnizor ? ` · ${offer.furnizor}` : ''}`}>Descarcă PDF</a>
    </div>)}
    {!complete && <div style={{marginTop:16}}>
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
    <p style={{margin:'10px 0',color:'var(--text-secondary)'}}>{files.length} fișiere · se reunesc într-un singur PDF: Oferta 1.pdf, Oferta 2.pdf sau Oferta 3.pdf, după primul număr disponibil în dosar. Maximum 4 MB în total. Completează furnizorul și repetă pentru celelalte oferte.</p>
    <button type="button" className="btn btn-sm btn-primary" disabled={busy||!supplier.trim()||!files.length} onClick={()=>void save()}>{busy?'Se pregătește și salvează PDF-ul…':'Salvează această ofertă'}</button>
    </div>}
    {message&&<p role="status" style={{marginTop:8}}>{message}</p>}
  </section>
}
