'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import { Proprietar } from '@/lib/firma-config'
import { legibil } from '@/lib/colors'

interface Firma { id:string; slug:string; nume:string; culoare:string; luna_id?:string; cui?:string|null; nrRegCom?:string|null; adresa?:string|null; judet?:string|null; tara?:string|null }
interface Props { firma: Firma; firmeDisponibile: Firma[]; lunaId: string; tasks: TaskItem[]; proprietari?: Proprietar[] }

type DispDoc = { id:string; fisier_nume:string; numar_document:string; furnizor:string; suma?:number|null; locatie?:string|null; utilitate?:string|null; data?:Record<string,string|number>; attachments?:{id:string;fisier_nume:string}[] }
type BuletinResult = { prenume:string; nume:string; serieCi:string; numarCi:string }

function dpLabel(doc: DispDoc): string {
  const parts = [doc.utilitate, doc.locatie ? `ap. ${doc.locatie}` : null, doc.suma != null ? `${Number(doc.suma).toFixed(2)} RON` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : String(doc.data?.purpose || doc.furnizor || doc.fisier_nume)
}

export default function DispozitieModule({ firma, firmeDisponibile, lunaId, tasks, proprietari = [] }: Props) {
  const [firmaId, setFirmaId] = useState(firma.id)
  const selectedFirma = firmeDisponibile.find(f => f.id === firmaId) || firma
  const legal = { cif: selectedFirma.cui || '', nrRegCom: selectedFirma.nrRegCom || '', adresa: selectedFirma.adresa || '', judet: selectedFirma.judet || '', tara: selectedFirma.tara || '' }
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
  const buletinRef = useRef<HTMLInputElement>(null)

  // Proprietari salvați local (adăugați din buletin)
  const lsKey = `contaflow:proprietari:${firma.id}`
  const [localProprietari, setLocalProprietari] = useState<Proprietar[]>([])
  const [buletinBusy, setBuletinBusy] = useState(false)
  const [buletinResult, setBuletinResult] = useState<BuletinResult|null>(null)
  const [bPrenume, setBPrenume] = useState(''); const [bNume, setBNume] = useState('')
  const [bSerie, setBSerie] = useState(''); const [bNumar, setBNumar] = useState('')

  useEffect(() => {
    try { setLocalProprietari(JSON.parse(localStorage.getItem(lsKey) || '[]')) } catch {}
  }, [lsKey])
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
    const assigned=res.headers.get('X-Disposition-Number')||number; const isZip=(res.headers.get('Content-Type')||'').includes('zip'); const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`dispozitie_plata_${assigned}.${isZip?'zip':'pdf'}`; a.click(); URL.revokeObjectURL(url)
    setEditId(''); setAttachedInvoices([]); setPreset(''); setBeneficiary(''); setAmount(''); setPurpose(''); await loadNumber()
  }

  const allProprietari = [...proprietari, ...localProprietari.filter(l => !proprietari.some(s => s.nume === l.nume))]

  function applyPreset(val: string) {
    setPreset(val)
    const p = allProprietari.find(e => e.nume === val)
    if (!p) return
    setBeneficiary(p.nume); setOwner(p.nume); setBeneficiaryFunction('Proprietar')
    setIdentitySeries(p.serieCi); setIdentityNumber(p.numarCi)
  }

  async function analyzeBuletin(file: File) {
    setBuletinBusy(true); setError(''); setBuletinResult(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/proprietar/analyze', { method:'POST', body:fd })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setError(data.error||'AI nu a putut citi buletinul'); setBuletinBusy(false); return }
    setBuletinResult(data)
    setBPrenume(data.prenume||''); setBNume(data.nume||'')
    setBSerie(data.serieCi||''); setBNumar(data.numarCi||'')
    setBuletinBusy(false)
  }

  function saveProprietar() {
    const numeComplet = `${bPrenume} ${bNume}`.trim()
    if (!numeComplet) return
    const p: Proprietar = { nume: numeComplet, serieCi: bSerie, numarCi: bNumar }
    const updated = [...localProprietari.filter(x => x.nume !== numeComplet), p]
    setLocalProprietari(updated)
    try { localStorage.setItem(lsKey, JSON.stringify(updated)) } catch {}
    setBuletinResult(null)
    // auto-select
    setPreset(numeComplet); setBeneficiary(numeComplet); setOwner(numeComplet)
    setBeneficiaryFunction('Proprietar'); setIdentitySeries(bSerie); setIdentityNumber(bNumar)
  }

  function deleteLocalProprietar(nume: string) {
    const updated = localProprietari.filter(p => p.nume !== nume)
    setLocalProprietari(updated)
    try { localStorage.setItem(lsKey, JSON.stringify(updated)) } catch {}
    if (preset === nume) setPreset('')
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
      if (data.amount) setAmount(prev => String(Math.round(((Number(prev) || 0) + data.amount) * 100) / 100))
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
            <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>Generator numerotat lunar, salvat automat în dosarul contabilității.</div>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={savePdf} disabled={pdfBusy} style={{ fontSize:'11px', border:`1px solid ${firma.culoare}`, borderRadius:'7px', background:'transparent', color:legibil(firma.culoare), padding:'6px 10px', cursor:'pointer' }}>{pdfBusy?'...':'Salvează PDF'}</button>
            <button onClick={saveTemplate} disabled={templateBusy} style={{ fontSize:'11px', border:'1px solid #333', borderRadius:'7px', background:'#1A1A1A', color:'#CCC', padding:'6px 10px', cursor:'pointer' }}>{templateBusy?'...':'Salvează șablon'}</button>
            <button onClick={resetNumber} style={{ fontSize:'11px', border:'1px solid #5B3030', borderRadius:'7px', background:'#1A1010', color:'#F87171', padding:'6px 10px', cursor:'pointer' }}>Reset 01</button>
          </div>
        </div>

        <div style={{ padding:'18px 22px' }}>
          {documents.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'5px', background:'#161616', borderRadius:'8px' }}>
              <span style={{ flex:1, fontSize:'11px', color:'#CCC' }}>DP nr. {doc.numar_document} · {dpLabel(doc)}{doc.attachments?.length?` · ${doc.attachments.length} anexe`:''}</span>
              <a href={`/api/chitante/dispozitie?download=${encodeURIComponent(doc.id)}`} style={{ fontSize:'10px', color:legibil(firma.culoare) }}>↓</a>
              <button onClick={()=>editDisposition(doc)} style={{ fontSize:'10px', color:'#8DB8FF', background:'transparent', border:'none', cursor:'pointer' }}>Modifică</button>
              <button onClick={()=>deleteDisposition(doc)} disabled={deletingId===doc.id} style={{ fontSize:'10px', color:'#F87171', background:'transparent', border:'none', cursor:'pointer' }}>{deletingId===doc.id?'...':'✕'}</button>
            </div>
          ))}

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px', marginTop:'12px' }}>
            <select value={firmaId} onChange={e=>setFirmaId(e.target.value)} style={INP}>{firmeDisponibile.map(f=><option key={f.id} value={f.id}>{f.nume}</option>)}</select>
            <input readOnly value={number} placeholder="Număr automat" style={{ ...INP, color:legibil(firma.culoare), fontWeight:700 }}/>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={INP}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr 70px 70px', gap:'8px', marginTop:'8px' }}>
            <input readOnly value={legal?.nrRegCom||''} placeholder="Reg. com." style={{ ...INP, color:'#888' }}/>
            <input readOnly value={legal?.cif||''} placeholder="CIF" style={{ ...INP, color:'#888' }}/>
            <input readOnly value={legal?.adresa||''} placeholder="Adresa" style={{ ...INP, color:'#888' }}/>
            <input readOnly value={legal?.judet||''} style={{ ...INP, color:'#888' }}/>
            <input readOnly value={legal?.tara||''} style={{ ...INP, color:'#888' }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:'8px', marginTop:'8px' }}>
            <input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Proprietar / beneficiar implicit" style={INP}/>
            <input value={beneficiaryFunction} onChange={e=>setBeneficiaryFunction(e.target.value)} placeholder="Calitate / funcție" style={INP}/>
            <input value={identitySeries} onChange={e=>setIdentitySeries(e.target.value)} placeholder="Serie CI" style={INP}/>
            <input value={identityNumber} onChange={e=>setIdentityNumber(e.target.value)} placeholder="Număr CI" style={INP}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr auto auto', gap:'8px', marginTop:'8px' }}>
            <select value={preset} onChange={e=>applyPreset(e.target.value)} style={INP}>
              <option value="">{allProprietari.length ? 'Selectează proprietar...' : 'Niciun proprietar configurat'}</option>
              {allProprietari.map(p=>(
                <option key={p.nume} value={p.nume}>{p.nume}{localProprietari.some(l=>l.nume===p.nume) ? ' ✓' : ''}</option>
              ))}
            </select>
            <button onClick={()=>buletinRef.current?.click()} disabled={buletinBusy} style={{ border:`1px solid ${firma.culoare}`, borderRadius:'8px', background:'transparent', color:legibil(firma.culoare), padding:'9px 14px', cursor:'pointer', fontSize:'12px', fontWeight:600, whiteSpace:'nowrap' }}>{buletinBusy?'AI citește...':'+ Buletin'}</button>
            <button onClick={()=>invoiceRef.current?.click()} disabled={invoiceBusy} style={{ border:'1px solid #333', borderRadius:'8px', background:'#1A1A1A', color:'#CCC', padding:'9px 14px', cursor:'pointer', fontSize:'12px', whiteSpace:'nowrap' }}>{invoiceBusy?'AI analizează...':'+ Facturi AI'}</button>
            <input ref={buletinRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e=>e.target.files?.[0]&&analyzeBuletin(e.target.files[0])}/>
            <input ref={invoiceRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e=>e.target.files&&analyzeInvoices(e.target.files)}/>
          </div>
          {attachedInvoices.length>0 && <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'8px' }}>{attachedInvoices.map(i=><span key={i.id} style={{ fontSize:'10px', padding:'3px 7px', borderRadius:'5px', background:'#1A1A1A', color:'#888' }}>{i.fisier_nume}</span>)}</div>}

          {/* Proprietari locali salvați */}
          {localProprietari.length>0 && (
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'8px' }}>
              {localProprietari.map(p=>(
                <span key={p.nume} style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', padding:'3px 7px', borderRadius:'5px', background:`rgba(${parseInt(firma.culoare.slice(1,3),16)},${parseInt(firma.culoare.slice(3,5),16)},${parseInt(firma.culoare.slice(5,7),16)},.12)`, color:legibil(firma.culoare) }}>
                  {p.nume} · {p.serieCi} {p.numarCi}
                  <button onClick={()=>deleteLocalProprietar(p.nume)} style={{ background:'none', border:'none', color:legibil(firma.culoare), cursor:'pointer', padding:'0 2px', fontSize:'10px', lineHeight:1 }}>✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Panou confirmare buletin */}
          {buletinResult && (
            <div style={{ marginTop:'10px', padding:'14px 16px', background:'#111', border:`1px solid ${firma.culoare}44`, borderRadius:'10px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:legibil(firma.culoare), marginBottom:'10px' }}>Proprietar extras din buletin — confirmă și salvează</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px 80px', gap:'8px', marginBottom:'10px' }}>
                <input value={bPrenume} onChange={e=>setBPrenume(e.target.value)} placeholder="Prenume" style={INP}/>
                <input value={bNume} onChange={e=>setBNume(e.target.value)} placeholder="Nume familie" style={INP}/>
                <input value={bSerie} onChange={e=>setBSerie(e.target.value.toUpperCase())} placeholder="Serie CI" style={INP}/>
                <input value={bNumar} onChange={e=>setBNumar(e.target.value)} placeholder="Nr. CI" style={INP}/>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={saveProprietar} disabled={!bPrenume&&!bNume} style={{ border:'none', borderRadius:'8px', background:firma.culoare, color:'#FFF', padding:'8px 16px', cursor:'pointer', fontSize:'12px', fontWeight:700 }}>Salvează preset</button>
                <button onClick={()=>setBuletinResult(null)} style={{ border:'1px solid #333', borderRadius:'8px', background:'transparent', color:'#888', padding:'8px 12px', cursor:'pointer', fontSize:'12px' }}>Anulează</button>
              </div>
            </div>
          )}
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
