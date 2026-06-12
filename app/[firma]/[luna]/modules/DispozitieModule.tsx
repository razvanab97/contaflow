'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import { getLegal } from '@/lib/firma-config'

interface Firma { id:string; slug:string; nume:string; culoare:string; luna_id?:string }
interface Props { firma: Firma; firmeDisponibile: Firma[]; lunaId: string; tasks: TaskItem[] }

type DispDoc = { id:string; fisier_nume:string; numar_document:string; furnizor:string; data?:Record<string,string|number>; attachments?:{id:string;fisier_nume:string}[] }

const PRESETS = [
  { label:'Grumăzescu Angela · Asociație', beneficiary:'Grumazescu Angela', function:'Proprietar', identitySeries:'MX', identityNumber:'864860', purpose:'Asociația' },
  { label:'Bucșa Radu · Administrație apartamente', beneficiary:'Bucsa Radu', function:'Proprietar', identitySeries:'ZC', identityNumber:'553054', purpose:'Asociația' },
  { label:'Bordeanu Dănuț · E.ON Gaz', beneficiary:'Bordeanu Danut', function:'Proprietar', identitySeries:'MZ', identityNumber:'699302', purpose:'Fact. gaz' },
]

export default function DispozitieModule({ firma, firmeDisponibile, lunaId, tasks }: Props) {
  const [firmaId, setFirmaId] = useState(firma.id)
  const selectedFirma = firmeDisponibile.find(f => f.id === firmaId) || firma
  const legal = getLegal(selectedFirma.slug)
  const selectedLunaId = selectedFirma.luna_id || lunaId

  const [number, setNumber] = useState('')
  const [documents, setDocuments] = useState<DispDoc[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [owner, setOwner] = useState('')
  const [beneficiaryFunction, setBeneficiaryFunction] = useState('')
  const [identitySeries, setIdentitySeries] = useState('')
  const [identityNumber, setIdentityNumber] = useState('')
  const [preset, setPreset] = useState('')
  const [editId, setEditId] = useState('')
  const [attachedInvoices, setAttachedInvoices] = useState<{id:string;fisier_nume:string}[]>([])
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState('')
  const invoiceRef = useRef<HTMLInputElement>(null)
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'9px 12px', color:'#BBB', outline:'none', width:'100%' }

  const loadNumber = useCallback(async () => {
    const res = await fetch(`/api/chitante/dispozitie?lunaId=${encodeURIComponent(selectedLunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setNumber(data.nextNumber); setDocuments(data.documents || []) }
  }, [selectedLunaId])

  const loadTemplate = useCallback(async () => {
    const res = await fetch(`/api/chitante/dispozitie/template?firmaId=${encodeURIComponent(selectedFirma.id)}`)
    const data = await res.json().catch(() => ({}))
    const t = data.template || {}
    setOwner(t.owner || ''); setBeneficiaryFunction(t.beneficiaryFunction || '')
    setIdentitySeries(t.identitySeries || ''); setIdentityNumber(t.identityNumber || '')
    if (t.defaultPurpose) setPurpose(t.defaultPurpose)
  }, [selectedFirma.id])

  useEffect(() => { loadNumber(); loadTemplate() }, [loadNumber, loadTemplate])

  async function saveTemplate() {
    setTemplateBusy(true)
    await fetch('/api/chitante/dispozitie/template', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:selectedFirma.id, lunaId:selectedLunaId, template:{ owner, beneficiaryFunction, identitySeries, identityNumber, defaultPurpose:purpose } }) })
    setTemplateBusy(false)
  }

  async function resetNumber() {
    if (!confirm('Resetezi numerotarea la 01?')) return
    const res = await fetch('/api/chitante/dispozitie', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:selectedFirma.id, lunaId:selectedLunaId }) })
    if (res.ok) setNumber('01')
  }

  async function savePdf() {
    setPdfBusy(true)
    const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId:selectedLunaId, title:`Dispozitii_plata_${selectedFirma.nume}`, scope:{ section:'dispozitii-plata' } }) })
    if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`Dispozitii_plata_${selectedFirma.nume}.pdf`; a.click(); URL.revokeObjectURL(u) }
    setPdfBusy(false)
  }

  async function deleteDisposition(doc: DispDoc) {
    if (!confirm(`Ștergi dispoziția „${doc.fisier_nume}"?`)) return
    setDeletingId(doc.id)
    const res = await fetch(`/api/chitante/dispozitie?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) setError(data.error || 'Eroare ștergere')
    else { setNumber(data.nextNumber || number); setDocuments(prev=>prev.filter(e=>e.id!==doc.id)) }
    setDeletingId('')
  }

  async function generate() {
    setError('')
    const res = await fetch('/api/chitante/dispozitie', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      firmaId:selectedFirma.id, lunaId:selectedLunaId, firmaNume:selectedFirma.nume,
      cif:legal?.cif, nrRegCom:legal?.nrRegCom, adresa:legal?.adresa, judet:legal?.judet, tara:legal?.tara,
      editId, date, beneficiary:beneficiary||owner, function:beneficiaryFunction, amount, purpose, identitySeries, identityNumber, attachmentIds:attachedInvoices.map(i=>i.id),
    }) })
    if (!res.ok) { setError((await res.json().catch(()=>({}))).error||'Generarea nu a reușit'); return }
    const assigned=res.headers.get('X-Disposition-Number')||number; const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`dispozitie_plata_${assigned}.pdf`; a.click(); URL.revokeObjectURL(url)
    setEditId(''); setAttachedInvoices([]); await loadNumber()
  }

  function applyPreset(val: string) {
    setPreset(val)
    const p = PRESETS.find(e=>e.label===val)
    if (!p) return
    setBeneficiary(p.beneficiary); setOwner(p.beneficiary); setBeneficiaryFunction(p.function); setIdentitySeries(p.identitySeries); setIdentityNumber(p.identityNumber); setPurpose(p.purpose)
  }

  async function analyzeInvoices(files: FileList) {
    setInvoiceBusy(true); setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file); fd.append('firmaId', selectedFirma.id); fd.append('lunaId', selectedLunaId); fd.append('number', number)
      const res = await fetch('/api/chitante/dispozitie/analyze', { method:'POST', body:fd })
      const data = await res.json().catch(()=>({}))
      if (!res.ok) { setError(data.error||'Analiza nu a reușit'); break }
      setAttachedInvoices(prev=>[...prev, data.document])
      if (data.purpose) setPurpose(prev=>prev ? `${prev}; ${data.purpose}` : data.purpose)
      if (data.amount && !amount) setAmount(String(data.amount))
    }
    setInvoiceBusy(false)
  }

  function editDisposition(doc: DispDoc) {
    const d = doc.data||{}
    setEditId(doc.id); setNumber(doc.numar_document); setDate(String(d.date||date)); setBeneficiary(String(d.beneficiary||''))
    setOwner(String(d.beneficiary||'')); setBeneficiaryFunction(String(d.function||''))
    setAmount(String(d.amount||'')); setPurpose(String(d.purpose||''))
    setIdentitySeries(String(d.identitySeries||'')); setIdentityNumber(String(d.identityNumber||''))
    setAttachedInvoices(doc.attachments||[])
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <div style={{ background:'#111', border:'1px solid #1E1E1E', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid #1A1A1A', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px' }}>
          <div>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#E0E0E0' }}>Dispoziții de plată</div>
            <div style={{ fontSize:'11px', color:'#444', marginTop:'2px' }}>Generator numerotat lunar, salvat automat în dosarul contabilității.</div>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={savePdf} disabled={pdfBusy} style={{ fontSize:'11px', border:`1px solid ${firma.culoare}`, borderRadius:'7px', background:'transparent', color:firma.culoare, padding:'6px 10px', cursor:'pointer' }}>{pdfBusy?'...':'Salvează PDF'}</button>
            <button onClick={saveTemplate} disabled={templateBusy} style={{ fontSize:'11px', border:'1px solid #333', borderRadius:'7px', background:'#1A1A1A', color:'#CCC', padding:'6px 10px', cursor:'pointer' }}>{templateBusy?'...':'Salvează șablon'}</button>
            <button onClick={resetNumber} style={{ fontSize:'11px', border:'1px solid #5B3030', borderRadius:'7px', background:'#1A1010', color:'#F87171', padding:'6px 10px', cursor:'pointer' }}>Reset 01</button>
          </div>
        </div>

        <div style={{ padding:'18px 22px' }}>
          {documents.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'5px', background:'#161616', borderRadius:'8px' }}>
              <span style={{ flex:1, fontSize:'11px', color:'#CCC' }}>DP nr. {doc.numar_document} · {String(doc.data?.purpose||doc.furnizor||doc.fisier_nume)}{doc.attachments?.length?` · ${doc.attachments.length} anexe`:''}</span>
              <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'10px', color:firma.culoare }}>↓</a>
              <button onClick={()=>editDisposition(doc)} style={{ fontSize:'10px', color:'#8DB8FF', background:'transparent', border:'none', cursor:'pointer' }}>Modifică</button>
              <button onClick={()=>deleteDisposition(doc)} disabled={deletingId===doc.id} style={{ fontSize:'10px', color:'#F87171', background:'transparent', border:'none', cursor:'pointer' }}>{deletingId===doc.id?'...':'✕'}</button>
            </div>
          ))}

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px', marginTop:'12px' }}>
            <select value={firmaId} onChange={e=>setFirmaId(e.target.value)} style={INP}>{firmeDisponibile.map(f=><option key={f.id} value={f.id}>{f.nume}</option>)}</select>
            <input readOnly value={number} placeholder="Număr automat" style={{ ...INP, color:firma.culoare, fontWeight:700 }}/>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={INP}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr 70px 70px', gap:'8px', marginTop:'8px' }}>
            <input readOnly value={legal?.nrRegCom||''} placeholder="Reg. com." style={{ ...INP, color:'#555' }}/>
            <input readOnly value={legal?.cif||''} placeholder="CIF" style={{ ...INP, color:'#555' }}/>
            <input readOnly value={legal?.adresa||''} placeholder="Adresa" style={{ ...INP, color:'#555' }}/>
            <input readOnly value={legal?.judet||''} style={{ ...INP, color:'#555' }}/>
            <input readOnly value={legal?.tara||''} style={{ ...INP, color:'#555' }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:'8px', marginTop:'8px' }}>
            <input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Proprietar / beneficiar implicit" style={INP}/>
            <input value={beneficiaryFunction} onChange={e=>setBeneficiaryFunction(e.target.value)} placeholder="Calitate / funcție" style={INP}/>
            <input value={identitySeries} onChange={e=>setIdentitySeries(e.target.value)} placeholder="Serie CI" style={INP}/>
            <input value={identityNumber} onChange={e=>setIdentityNumber(e.target.value)} placeholder="Număr CI" style={INP}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr auto', gap:'8px', marginTop:'8px' }}>
            <select value={preset} onChange={e=>applyPreset(e.target.value)} style={INP}>
              <option value="">Preset persoană...</option>
              {PRESETS.map(p=><option key={p.label} value={p.label}>{p.label}</option>)}
            </select>
            <button onClick={()=>invoiceRef.current?.click()} disabled={invoiceBusy} style={{ border:'1px solid #333', borderRadius:'8px', background:'#1A1A1A', color:'#CCC', padding:'9px 14px', cursor:'pointer', fontSize:'12px' }}>{invoiceBusy?'AI analizează...':'+ Facturi AI'}</button>
            <input ref={invoiceRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e=>e.target.files&&analyzeInvoices(e.target.files)}/>
          </div>
          {attachedInvoices.length>0 && <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'8px' }}>{attachedInvoices.map(i=><span key={i.id} style={{ fontSize:'10px', padding:'3px 7px', borderRadius:'5px', background:'#1A1A1A', color:'#888' }}>{i.fisier_nume}</span>)}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 2fr auto', gap:'8px', marginTop:'8px' }}>
            <input value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} placeholder="Beneficiar" style={INP}/>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Suma RON" style={INP}/>
            <input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Scopul plății" style={INP}/>
            <div style={{ display:'flex', gap:'6px' }}>
              {editId && <button onClick={()=>{setEditId('');setAttachedInvoices([]);setPreset('');loadNumber()}} style={{ border:'1px solid #333', borderRadius:'8px', background:'transparent', color:'#888', padding:'9px 12px', cursor:'pointer', fontSize:'12px' }}>Anulează</button>}
              <button onClick={generate} disabled={!(beneficiary||owner)||!amount||!purpose} style={{ border:'none', borderRadius:'8px', background:firma.culoare, color:'#FFF', padding:'9px 14px', cursor:'pointer', fontSize:'12px', fontWeight:600, opacity:!(beneficiary||owner)||!amount||!purpose?.5:1 }}>{editId?'Salvează':'Generează PDF'}</button>
            </div>
          </div>
          {error && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
