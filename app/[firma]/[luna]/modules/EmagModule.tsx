'use client'
import { useState, useCallback, useEffect } from 'react'
import TaskSection, { TaskItem } from './TaskSection'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface EmagDoc { id:string; fisier_nume:string; category:string; effect:'cheltuiala'|'reducere'; amount:number; invoiceNumber:string; date:string; notes:string }
interface EmagSummary { bankReceipts:number; bankPayments:number; bankCashflow:number; emagExpenses:number; emagReductions:number; emagNetCost:number; categories:Record<string,number> }

function money(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(v||0) }

interface Props { firma: Firma; lunaId: string; tasks: TaskItem[] }

const CAT_LBL: Record<string,string> = { comision:'Comisioane', cupoane:'Cupoane', publicitate:'Publicitate', transport:'Transport', servicii:'Servicii', altele:'Altele' }

export default function EmagModule({ firma, lunaId, tasks }: Props) {
  const [docs, setDocs] = useState<EmagDoc[]>([])
  const [summary, setSummary] = useState<EmagSummary>({ bankReceipts:0, bankPayments:0, bankCashflow:0, emagExpenses:0, emagReductions:0, emagNetCost:0, categories:{} })
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('automat')
  const [effect, setEffect] = useState<'automat'|'cheltuiala'|'reducere'>('automat')
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'9px 12px', color:'#BBB', outline:'none', width:'100%' }

  const load = useCallback(async () => {
    const res = await fetch(`/api/emag?lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setDocs(data.documents || []); setSummary(data.summary || {}) }
    else setError(data.error || 'Eroare la încărcare')
  }, [lunaId])

  useEffect(() => { load() }, [load])

  async function addInvoice() {
    setBusy(true); setError('')
    const res = await fetch('/api/emag', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url, firmaId:firma.id, lunaId, category, effect, amount, invoiceNumber, date, notes }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setUrl(''); setAmount(''); setInvoiceNumber(''); setNotes(''); await load() }
    setBusy(false)
  }

  async function removeDoc(doc: EmagDoc) {
    if (!confirm(`Ștergi factura „${doc.fisier_nume}"?`)) return
    const res = await fetch(`/api/emag?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    if (res.ok) await load()
    else setError((await res.json().catch(()=>({}))).error || 'Eroare ștergere')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
        {([
          ['Încasări RON', summary.bankReceipts, '#4ADE80'],
          ['Plăți RON', summary.bankPayments, '#F87171'],
          ['Cashflow RON', summary.bankCashflow, summary.bankCashflow>=0?'#4ADE80':'#F87171'],
          ['Cost net eMAG', summary.emagNetCost, firma.culoare],
        ] as [string,number,string][]).map(([label,value,color]) => (
          <div key={label} style={{ padding:'14px', background:'#111', border:'1px solid #1E1E1E', borderRadius:'10px' }}>
            <div style={{ fontSize:'10px', color:'#444', marginBottom:'6px' }}>{label}</div>
            <div style={{ fontSize:'16px', fontWeight:700, color, letterSpacing:'-0.4px' }}>{money(value)}</div>
          </div>
        ))}
      </div>

      {/* Documents */}
      <div style={{ background:'#111', border:'1px solid #1E1E1E', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #1A1A1A' }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'#E0E0E0' }}>Facturi Dante International</div>
          <div style={{ fontSize:'11px', color:'#444', marginTop:'2px' }}>Cost eMAG: {money(summary.emagExpenses)} − {money(summary.emagReductions)} reduceri = {money(summary.emagNetCost)} RON net</div>
        </div>
        <div style={{ padding:'16px 20px' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'5px', background:'#161616', borderRadius:'8px' }}>
              <span style={{ flex:1, fontSize:'11px', color:'#CCC' }}>{doc.date || '—'} · {doc.invoiceNumber || doc.fisier_nume} · {CAT_LBL[doc.category]||doc.category}</span>
              <strong style={{ fontSize:'11px', color:doc.effect==='reducere'?'#4ADE80':'#F87171' }}>{doc.effect==='reducere'?'-':'+'}{money(doc.amount)} RON</strong>
              <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'10px', color:firma.culoare }}>↓</a>
              <button onClick={()=>removeDoc(doc)} style={{ fontSize:'10px', color:'#F87171', background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          ))}

          {/* Add form */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:'8px', marginTop:'12px' }}>
            <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Link PDF Oblio sau platformă Dante" style={INP}/>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={INP}>
              <option value="automat">Categorie automată AI</option>
              {Object.entries(CAT_LBL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <select value={effect} onChange={e=>setEffect(e.target.value as any)} style={INP}>
              <option value="automat">Efect automat AI</option>
              <option value="cheltuiala">Cheltuială</option>
              <option value="reducere">Reducere / storno</option>
            </select>
            <input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Total RON" style={INP}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr auto', gap:'8px', marginTop:'8px' }}>
            <input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="Nr. factură" style={INP}/>
            <input value={date} onChange={e=>setDate(e.target.value)} placeholder="Data" style={INP}/>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observații" style={INP}/>
            <button onClick={addInvoice} disabled={busy||!url} style={{ border:'none', borderRadius:'8px', background:firma.culoare, color:'#FFF', padding:'9px 16px', cursor:'pointer', opacity:busy||!url?.5:1, fontWeight:600, fontSize:'12px' }}>
              {busy?'Se analizează...':'Importă'}
            </button>
          </div>
          {error && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
