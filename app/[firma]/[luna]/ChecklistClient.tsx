'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const MOD_LABELS: Record<string,string> = { extras:'Extras de cont', emag:'Emag facturi', trendyol:'Trendyol', booking:'Booking', airbnb:'Airbnb', '5stardesk':'5starDesk', angajati:'Documente angajați', resurse_umane:'Resurse umane', acte_contabile:'Acte contabile' }
const UPLOAD_MODS = ['emag','trendyol','booking','airbnb','5stardesk','angajati','resurse_umane','acte_contabile']
const TIP_OPT = ['aviz_plata','factura','borderou','raport_csv','chenzina','foaie_prezenta','stat_plata','contract','altul']
const TIP_LBL: Record<string,string> = { aviz_plata:'Aviz plată', factura:'Factură', borderou:'Borderou', raport_csv:'Raport CSV', chenzina:'Chenzina', foaie_prezenta:'Foaie prezență', stat_plata:'Stat plată', contract:'Contract', altul:'Altul' }

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

interface Firma {
  id:string; slug:string; nume:string; culoare:string
  cif?:string; cui?:string; nr_reg_com?:string; nr_registru_comertului?:string; adresa?:string
  luna_id?:string
}
interface Item { id:string; completat:boolean; checklist_templates?:{ titlu:string; descriere?:string; modul:string; necesita_semnatura:boolean; spre_proiect:boolean; ordine:number } }
interface Extras { id:string; valuta:string; nr_tranzactii:number; nr_documentate:number; procesat_ai:boolean }

async function downloadGeneralPdf(body: Record<string, unknown>, fallbackName: string) {
  const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  if (!res.ok) return (await res.json().catch(() => ({}))).error || 'PDF-ul nu a putut fi generat'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fallbackName
  anchor.click()
  URL.revokeObjectURL(url)
  return ''
}

export default function ChecklistClient({ firma, firmeDisponibile, lunaId, lunaStatus, progresPct, items, extrase, slug, luna, lunaLabel }:
  { firma:Firma; firmeDisponibile:Firma[]; lunaId:string; lunaStatus:string; progresPct:number; items:Item[]; extrase:Extras[]; slug:string; luna:string; lunaLabel:string }
) {
  const sorted = [...items].sort((a,b)=>(a.checklist_templates?.ordine||0)-(b.checklist_templates?.ordine||0))
  const byMod: Record<string,Item[]> = {}
  for (const i of sorted) { const m=i.checklist_templates?.modul||'altul'; if(!byMod[m]) byMod[m]=[]; byMod[m]!.push(i) }
  const total = sorted.length, done = sorted.filter(i=>i.completat).length, pct = total>0?Math.round((done/total)*100):0
  const r = rgb(firma.culoare)

  const [exportLoading, setExportLoading] = useState(false)
  const [globalPdfLoading, setGlobalPdfLoading] = useState(false)
  const [exportError, setExportError] = useState('')
  async function handleExport() {
    setExportLoading(true)
    const res = await fetch('/api/export/zip', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:firma.id, firmaNume:firma.nume, lunaId, luna }) })
    if (res.ok) { const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${firma.nume}_${luna}.zip`; a.click(); URL.revokeObjectURL(url) }
    setExportLoading(false)
  }
  async function saveGlobalPdf() {
    setGlobalPdfLoading(true); setExportError('')
    setExportError(await downloadGeneralPdf({ lunaId, title:`${firma.nume}_${luna}_toate_documentele` }, `${firma.nume}_${luna}_toate_documentele.pdf`))
    setGlobalPdfLoading(false)
  }

  const SB: React.CSSProperties = { fontSize:'13px', fontWeight:500, color:'#888', display:'flex', alignItems:'center', gap:'9px', padding:'8px 18px' }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      <aside style={{ width:'220px', flexShrink:0, background:'#0D0D0D', borderRight:'1px solid #1E1E1E', display:'flex', flexDirection:'column', padding:'20px 0', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ padding:'4px 18px 24px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'28px', height:'28px', background:'#FFF', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#FFF' }}>ContaFlow</span>
        </div>
        <Link href="/dashboard" style={SB}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Dashboard</Link>
        <div style={{ height:'1px', background:'#1E1E1E', margin:'8px 14px' }}/>
        <div style={{ padding:'0 18px 8px', fontSize:'10px', fontWeight:700, color:'#444', letterSpacing:'.12em', textTransform:'uppercase' }}>{firma.nume.replace(' SRL','')}</div>
        <Link href={`/${slug}/${luna}`} style={{ ...SB, color:'#BBB' }}>Checklist</Link>
        <Link href={`/${slug}/${luna}/extras`} style={SB}>Extras de cont</Link>
        {extrase.length>0 && extrase.map(e=>(
          <div key={e.id} style={{ padding:'3px 18px 3px 36px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'11px', color:'#666' }}>{e.valuta}</span>
            <span style={{ fontSize:'11px', color:e.nr_tranzactii>0?'#4ADE80':'#555' }}>{e.nr_tranzactii>0?`${e.nr_tranzactii} tx`:'—'}</span>
          </div>
        ))}
        <div style={{ marginTop:'auto', padding:'12px 18px', fontSize:'11px', color:'#555' }}>{lunaLabel}</div>
      </aside>

      <main style={{ flex:1, padding:'40px 44px', background:'#0F0F0F' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'20px', marginBottom:'22px' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
              <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:firma.culoare }}/>
              <h1 style={{ fontSize:'22px', fontWeight:700, color:'#FFF', letterSpacing:'-0.4px' }}>{firma.nume}</h1>
            </div>
            <p style={{ fontSize:'13px', color:'#888', marginLeft:'19px' }}>{lunaLabel}</p>
          </div>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
            <GlobalSearch />
            <button onClick={saveGlobalPdf} disabled={globalPdfLoading} style={{ fontSize:'12px', fontWeight:700, padding:'9px 13px', borderRadius:'8px', border:`1px solid ${firma.culoare}`, background:'transparent', color:firma.culoare, cursor:'pointer' }}>
              {globalPdfLoading ? 'Se generează...' : 'Salvează toate PDF'}
            </button>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'30px', fontWeight:700, color:firma.culoare, letterSpacing:'-0.8px' }}>{pct}%</div>
            <div style={{ fontSize:'12px', color:'#888' }}>{done}/{total} completate</div>
          </div>
          </div>
        </div>
        {exportError && <p style={{ fontSize:'11px', color:'#F87171', marginBottom:'12px', textAlign:'right' }}>{exportError}</p>}

        <div style={{ height:'3px', background:'#1E1E1E', borderRadius:'2px', marginBottom:'28px' }}>
          <div style={{ height:'3px', borderRadius:'2px', background:firma.culoare, width:`${pct}%` }}/>
        </div>

        {extrase.length>0 && (
          <div style={{ background:'#161616', border:`1px solid rgba(${r},.25)`, borderRadius:'12px', padding:'14px 18px', marginBottom:'20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#FFF', marginBottom:'4px' }}>Extrase procesate AI</div>
              <div style={{ display:'flex', gap:'16px' }}>
                {extrase.map(e=>(
                  <span key={e.id} style={{ fontSize:'12px', fontWeight:500, color:firma.culoare }}>
                    {e.valuta}: {e.nr_tranzactii} tranzacții · {e.nr_documentate} documentate
                  </span>
                ))}
              </div>
            </div>
            <Link href={`/${slug}/${luna}/extras`} style={{ fontSize:'12px', fontWeight:600, color:firma.culoare, padding:'6px 14px', borderRadius:'8px', border:`1px solid rgba(${r},.3)` }}>
              Gestionează →
            </Link>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {Object.entries(byMod).map(([mod, modItems]) => {
            const modDone = modItems.filter(i=>i.completat).length
            return (
              <div key={mod} style={{ background:'#161616', border:'1px solid #242424', borderRadius:'14px', overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 18px', borderBottom:'1px solid #1E1E1E' }}>
                  <span style={{ fontSize:'12px', fontWeight:700, color:'#CCC', textTransform:'uppercase', letterSpacing:'.06em' }}>{MOD_LABELS[mod]||mod}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{ fontSize:'11px', color:'#666' }}>{modDone}/{modItems.length}</span>
                    {mod==='extras' && <Link href={`/${slug}/${luna}/extras`} style={{ fontSize:'11px', fontWeight:600, color:firma.culoare }}>deschide →</Link>}
                    <CategoryPdfButton lunaId={lunaId} module={mod} itemIds={modItems.map(item=>item.id)} title={MOD_LABELS[mod]||mod} culoare={firma.culoare} />
                  </div>
                </div>
                {modItems.map((item, idx) => (
                  <ChecklistItemRow key={item.id} item={item} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare} hasUpload={UPLOAD_MODS.includes(mod)} borderTop={idx>0} />
                ))}
              </div>
            )
          })}
        </div>

        <DispositionPanel firme={firmeDisponibile} firmaInitiala={firma} lunaIdInitial={lunaId} culoare={firma.culoare} />
        <InvoiceDocumentsPanel title="Facturi + chitanță" description="Asociază separat factura și chitanța pentru aceeași plată cash." section="facturi-chitanta" firma={firma} lunaId={lunaId} culoare={firma.culoare} />
        <InvoiceDocumentsPanel title="Facturi restante" description="Facturi care trebuiau plătite, dar nu au fost încă achitate." section="facturi-restante" firma={firma} lunaId={lunaId} culoare={firma.culoare} />

        <div style={{ display:'flex', gap:'10px', marginTop:'28px' }}>
          <Link href={`/${slug}/${luna}/extras`} style={{ fontSize:'13px', fontWeight:600, padding:'9px 18px', borderRadius:'9px', border:'1px solid #282828', color:'#999', background:'#161616' }}>
            Extras de cont →
          </Link>
          <button onClick={handleExport} disabled={exportLoading} style={{ fontSize:'13px', fontWeight:600, padding:'9px 18px', borderRadius:'9px', border:'none', background:firma.culoare, color:'#fff', cursor:'pointer', opacity:exportLoading?.6:1 }}>
            {exportLoading ? 'Se generează...' : 'Export ZIP ↓'}
          </button>
        </div>
      </main>
    </div>
  )
}

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{type:string;title:string;detail:string;href:string}[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json().catch(() => ({}))
      setResults(data.results || [])
      setOpen(true)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])
  return <div style={{ position:'relative', width:'280px' }}>
    <input value={query} onChange={event=>setQuery(event.target.value)} onFocus={()=>setOpen(true)} placeholder="Caută sumă, nume, referință..." style={{ width:'100%', fontSize:'12px', padding:'9px 12px', borderRadius:'8px', border:'1px solid #2A2A2A', background:'#161616', color:'#DDD', outline:'none' }}/>
    {open && query && <div style={{ position:'absolute', zIndex:20, top:'42px', right:0, width:'430px', maxHeight:'360px', overflowY:'auto', background:'#111', border:'1px solid #303030', borderRadius:'10px', boxShadow:'0 14px 40px rgba(0,0,0,.5)' }}>
      {results.length ? results.map((result,index)=><Link key={`${result.href}-${index}`} href={result.href} style={{ display:'block', padding:'10px 12px', borderBottom:'1px solid #222' }}>
        <span style={{ fontSize:'10px', color:'#777', textTransform:'uppercase' }}>{result.type}</span>
        <strong style={{ display:'block', fontSize:'12px', color:'#DDD', marginTop:'2px' }}>{result.title}</strong>
        <span style={{ display:'block', fontSize:'10px', color:'#777', marginTop:'2px' }}>{result.detail}</span>
      </Link>) : <p style={{ padding:'14px', fontSize:'11px', color:'#777' }}>Niciun rezultat.</p>}
      <button onClick={()=>setOpen(false)} style={{ width:'100%', padding:'8px', border:'none', background:'#181818', color:'#777', cursor:'pointer' }}>Închide</button>
    </div>}
  </div>
}

function CategoryPdfButton({ lunaId, module, itemIds, title, culoare }: { lunaId:string; module:string; itemIds:string[]; title:string; culoare:string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    setError(await downloadGeneralPdf({ lunaId, title, scope:module==='extras'?{ extras:true }:{ module }, itemIds }, `${title}.pdf`))
    setBusy(false)
  }
  return <span title={error || 'Salvează toate documentele categoriei într-un singur PDF'}>
    <button onClick={save} disabled={busy} style={{ fontSize:'10px', padding:'4px 7px', borderRadius:'6px', border:`1px solid ${error?'#F87171':'#333'}`, background:'#1B1B1B', color:error?'#F87171':culoare, cursor:'pointer' }}>{busy?'...':'Salvează PDF'}</button>
  </span>
}

interface CashDocument {
  id:string
  fisier_nume:string
  tip_document:string
  furnizor:string
  modul:string
}

interface TransactionSuggestion {
  id:string; data_tranzactie:string; descriere:string; descriere_curatata:string
  referinta:string|null; suma:number; valuta:string
}

function InvoiceDocumentsPanel({ title, description, section, firma, lunaId, culoare }: {
  title:string; description:string; section:'facturi-chitanta'|'facturi-restante'; firma:Firma; lunaId:string; culoare:string
}) {
  const [expanded, setExpanded] = useState(false)
  const [docs, setDocs] = useState<CashDocument[]>([])
  const [supplier, setSupplier] = useState('')
  const [descriptionValue, setDescriptionValue] = useState('')
  const [reference, setReference] = useState('')
  const [documentType, setDocumentType] = useState('factura')
  const [category, setCategory] = useState('altul')
  const [sourceUrl, setSourceUrl] = useState('')
  const [suggestions, setSuggestions] = useState<TransactionSuggestion[]>([])
  const [transactionId, setTransactionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'9px 12px', color:'#BBB', outline:'none', width:'100%' }

  const load = useCallback(async () => {
    const res = await fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}&section=${section}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
  }, [lunaId, section])

  async function toggle() {
    if (!expanded) await load()
    setExpanded(value => !value)
  }

  async function searchSupplier() {
    setError('')
    const res = await fetch(`/api/chitante/sugestii?lunaId=${encodeURIComponent(lunaId)}&supplier=${encodeURIComponent(supplier)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setSuggestions(data.suggestions || [])
    else setError(data.error || 'Căutarea în extras nu a reușit')
  }

  function useSuggestion(suggestion: TransactionSuggestion) {
    setDescriptionValue(suggestion.descriere_curatata || suggestion.descriere || '')
    setReference(suggestion.referinta || '')
    setTransactionId(suggestion.id)
    setSuggestions([])
  }

  async function uploadFiles(files: FileList) {
    setBusy(true); setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      Object.entries({ firmaId:firma.id, lunaId, section, supplier, description:descriptionValue, reference, documentType, category, transactionId }).forEach(([key,value]) => fd.append(key,value))
      fd.append('file', file)
      const res = await fetch('/api/chitante', { method:'POST', body:fd })
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error || 'Încărcarea nu a reușit'); break }
    }
    await load(); setBusy(false)
  }

  async function importUrl() {
    setBusy(true); setError('')
    const res = await fetch('/api/chitante/import-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url:sourceUrl, firmaId:firma.id, lunaId, section, supplier, description:descriptionValue, reference, transactionId }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul din link nu a reușit')
    else { setSourceUrl(''); await load() }
    setBusy(false)
  }
  async function savePdf() {
    setPdfBusy(true); setError('')
    setError(await downloadGeneralPdf({ lunaId, title, scope:{ section } }, `${title}.pdf`))
    setPdfBusy(false)
  }
  async function deleteDocument(doc: CashDocument) {
    if (!window.confirm(`Ștergi documentul „${doc.fisier_nume}”? Asocierea cu tranzacția va fi eliminată.`)) return
    setDeletingId(doc.id); setError('')
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Documentul nu a putut fi șters')
    else {
      if (data.warning) setError(`Documentul a fost eliminat, dar fișierul vechi nu a putut fi curățat: ${data.warning}`)
      await load()
    }
    setDeletingId('')
  }

  return (
    <div style={{ marginTop:'10px', background:'#161616', border:'1px solid #242424', borderRadius:'14px', overflow:'hidden' }}>
      <button onClick={toggle} style={{ width:'100%', display:'flex', justifyContent:'space-between', padding:'15px 18px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
        <span><strong style={{ fontSize:'12px', color:'#DDD', textTransform:'uppercase' }}>{title}</strong><span style={{ display:'block', fontSize:'11px', color:'#777', marginTop:'4px' }}>{description}</span></span>
        <span style={{ fontSize:'11px', color:culoare }}>{docs.length ? `${docs.length} documente` : ''} {expanded?'▲':'▼'}</span>
      </button>
      {expanded && <div style={{ padding:'16px 18px', borderTop:'1px solid #222', background:'#111' }}>
        <button onClick={savePdf} disabled={pdfBusy} style={{ marginBottom:'10px', fontSize:'11px', fontWeight:700, padding:'6px 10px', borderRadius:'7px', border:`1px solid ${culoare}`, background:'transparent', color:culoare, cursor:'pointer' }}>{pdfBusy?'Se generează...':'Salvează PDF categorie'}</button>
        {docs.map(doc => <div key={doc.id} style={{ display:'flex', gap:'8px', alignItems:'center', padding:'8px 10px', marginBottom:'5px', background:'#181818', borderRadius:'8px' }}>
          <span style={{ flex:1, minWidth:0, fontSize:'12px', color:'#CCC', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</span>
          <span style={{ fontSize:'10px', color:'#777' }}>{doc.tip_document}</span>
          <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', color:culoare, fontWeight:700 }}>Descarcă ↓</a>
          <button onClick={()=>deleteDocument(doc)} disabled={deletingId===doc.id} style={{ fontSize:'10px', fontWeight:700, color:'#F87171', background:'#241515', border:'1px solid #5B3030', borderRadius:'6px', padding:'4px 7px', cursor:'pointer' }}>{deletingId===doc.id?'Se șterge...':'Șterge'}</button>
        </div>)}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px', marginTop:'12px' }}>
          <input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Furnizor: Inatech Packaging, Sameday, Jumbo, OpenAI..." style={INP}/>
          <button onClick={searchSupplier} disabled={supplier.length<2} style={{ border:'1px solid #303030', borderRadius:'8px', background:'#202020', color:'#CCC', cursor:'pointer' }}>Caută în extras</button>
          <select value={documentType} onChange={e=>setDocumentType(e.target.value)} style={INP}><option value="factura">Factură</option><option value="chitanta">Chitanță</option></select>
        </div>
        {suggestions.map(s => <button key={s.id} onClick={()=>useSuggestion(s)} style={{ width:'100%', marginTop:'5px', padding:'8px 10px', textAlign:'left', background:'#181818', border:'1px solid #282828', borderRadius:'7px', color:'#AAA', cursor:'pointer' }}>
          <strong style={{ color:'#DDD' }}>{s.data_tranzactie} · {s.suma.toFixed(2)} {s.valuta}</strong> · {s.descriere_curatata || s.descriere} {s.referinta ? `· Ref: ${s.referinta}` : ''}
        </button>)}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px', marginTop:'8px' }}>
          <input value={descriptionValue} onChange={e=>setDescriptionValue(e.target.value)} placeholder="Descrierea plății / facturii" style={INP}/>
          <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Referință bancară (indiciu)" style={INP}/>
          <select value={category} onChange={e=>setCategory(e.target.value)} style={INP}><option value="altul">Altele</option><option value="utilitati">Utilități</option><option value="chirie">Chirie</option></select>
        </div>
        {transactionId && <p style={{ fontSize:'11px', color:'#4ADE80', marginTop:'6px' }}>Tranzacția selectată va fi asociată documentului. Descrierea și referința sunt păstrate pentru verificare.</p>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'8px', marginTop:'8px' }}>
          <input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="Link PDF Oblio" style={INP}/>
          <button onClick={importUrl} disabled={busy || !sourceUrl} style={{ padding:'8px 14px', border:'none', borderRadius:'8px', background:culoare, color:'#FFF', cursor:'pointer', opacity:busy?.6:1 }}>Importă linkul</button>
        </div>
        <button onClick={()=>fileRef.current?.click()} disabled={busy} style={{ marginTop:'8px', width:'100%', padding:'12px', border:`1.5px dashed rgba(${r},.4)`, borderRadius:'9px', background:'#0D0D0D', color:'#999', cursor:'pointer' }}>
          {busy ? 'Se salvează în dosarul contabilității...' : section==='facturi-chitanta' ? 'Adaugă separat factura sau chitanța' : 'Adaugă factura restantă'}
        </button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{display:'none'}} onChange={e=>e.target.files&&uploadFiles(e.target.files)}/>
        {error && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{error}</p>}
      </div>}
    </div>
  )
}

function DispositionPanel({ firme, firmaInitiala, lunaIdInitial, culoare }: { firme:Firma[]; firmaInitiala:Firma; lunaIdInitial:string; culoare:string }) {
  const [expanded, setExpanded] = useState(false)
  const [firmaId, setFirmaId] = useState(firmaInitiala.id)
  const selectedFirma = firme.find(firma => firma.id === firmaId) || firmaInitiala
  const selectedLunaId = selectedFirma.luna_id || lunaIdInitial
  const [number, setNumber] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('ro-RO'))
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [owner, setOwner] = useState('')
  const [ownerAddress, setOwnerAddress] = useState('')
  const [beneficiaryFunction, setBeneficiaryFunction] = useState('')
  const [identitySeries, setIdentitySeries] = useState('')
  const [identityNumber, setIdentityNumber] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState('')
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'9px 12px', color:'#BBB', outline:'none', width:'100%' }

  const loadNumber = useCallback(async () => {
    const res = await fetch(`/api/chitante/dispozitie?lunaId=${encodeURIComponent(selectedLunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setNumber(data.nextNumber)
  }, [selectedLunaId])
  const loadTemplate = useCallback(async () => {
    const res = await fetch(`/api/chitante/dispozitie/template?firmaId=${encodeURIComponent(selectedFirma.id)}`)
    const data = await res.json().catch(() => ({}))
    const template = data.template || {}
    setOwner(template.owner || '')
    setOwnerAddress(template.ownerAddress || '')
    setBeneficiaryFunction(template.beneficiaryFunction || '')
    setIdentitySeries(template.identitySeries || '')
    setIdentityNumber(template.identityNumber || '')
    if (template.defaultPurpose) setPurpose(template.defaultPurpose)
  }, [selectedFirma.id])
  useEffect(() => { if (expanded) { loadNumber(); loadTemplate() } }, [expanded, loadNumber, loadTemplate])

  async function toggle() { if (!expanded) await Promise.all([loadNumber(), loadTemplate()]); setExpanded(value=>!value) }
  async function saveTemplate() {
    setTemplateBusy(true); setError('')
    const res = await fetch('/api/chitante/dispozitie/template', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      firmaId:selectedFirma.id, lunaId:selectedLunaId, template:{ owner, ownerAddress, beneficiaryFunction, identitySeries, identityNumber, defaultPurpose:purpose },
    })})
    if (!res.ok) setError((await res.json().catch(()=>({}))).error || 'Șablonul nu a putut fi salvat')
    setTemplateBusy(false)
  }
  async function resetNumber() {
    if (!window.confirm('Numerotarea dispozițiilor de plată va reîncepe de la 01. Istoricul existent rămâne salvat. Continui?')) return
    setError('')
    const res = await fetch('/api/chitante/dispozitie', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:selectedFirma.id, lunaId:selectedLunaId }) })
    const data = await res.json().catch(()=>({}))
    if (res.ok) setNumber('01')
    else setError(data.error || 'Numerotarea nu a putut fi resetată')
  }
  async function savePdf() {
    setPdfBusy(true); setError('')
    setError(await downloadGeneralPdf({ lunaId:selectedLunaId, title:`Dispozitii_plata_${selectedFirma.nume}`, scope:{ section:'dispozitii-plata' } }, `Dispozitii_plata_${selectedFirma.nume}.pdf`))
    setPdfBusy(false)
  }
  async function generate() {
    setError('')
    const res = await fetch('/api/chitante/dispozitie', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      firmaId:selectedFirma.id, lunaId:selectedLunaId, firmaNume:selectedFirma.nume, cif:selectedFirma.cif||selectedFirma.cui, nrRegCom:selectedFirma.nr_reg_com||selectedFirma.nr_registru_comertului, adresa:selectedFirma.adresa,
      date, beneficiary:beneficiary || owner, function:beneficiaryFunction, amount, purpose, identitySeries, identityNumber, ownerAddress,
    })})
    if (!res.ok) { const data=await res.json().catch(()=>({})); setError(data.error||'Generarea nu a reușit'); return }
    const assigned=res.headers.get('X-Disposition-Number')||number; const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`dispozitie_plata_${assigned}.pdf`; a.click(); URL.revokeObjectURL(url); await loadNumber()
  }
  return <div style={{ marginTop:'10px', background:'#161616', border:'1px solid #242424', borderRadius:'14px', overflow:'hidden' }}>
    <button onClick={toggle} style={{ width:'100%', display:'flex', justifyContent:'space-between', padding:'15px 18px', background:'transparent', border:'none', cursor:'pointer', color:'#DDD', textAlign:'left' }}><span><strong>DISPOZIȚII DE PLATĂ</strong><small style={{display:'block',color:'#777',marginTop:'4px'}}>Generator numerotat lunar, salvat automat în dosarul contabilității.</small></span><span>{expanded?'▲':'▼'}</span></button>
    {expanded && <div style={{ padding:'16px 18px', borderTop:'1px solid #222', background:'#111' }}>
      <div style={{ display:'flex', gap:'8px', marginBottom:'10px', flexWrap:'wrap' }}>
        <button onClick={savePdf} disabled={pdfBusy} style={{fontSize:'11px',border:`1px solid ${culoare}`,borderRadius:'7px',background:'transparent',color:culoare,padding:'6px 10px',cursor:'pointer'}}>{pdfBusy?'Se generează...':'Salvează PDF dispoziții'}</button>
        <button onClick={saveTemplate} disabled={templateBusy} style={{fontSize:'11px',border:'1px solid #333',borderRadius:'7px',background:'#202020',color:'#CCC',padding:'6px 10px',cursor:'pointer'}}>{templateBusy?'Se salvează...':'Salvează șablonul'}</button>
        <button onClick={resetNumber} style={{fontSize:'11px',border:'1px solid #5B3030',borderRadius:'7px',background:'#241515',color:'#F87171',padding:'6px 10px',cursor:'pointer'}}>Resetează la 01</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px' }}>
        <select value={firmaId} onChange={e=>setFirmaId(e.target.value)} style={INP}>{firme.map(f=><option key={f.id} value={f.id}>{f.nume}</option>)}</select>
        <input readOnly value={number} placeholder="Număr automat" style={{...INP,color:culoare,fontWeight:700}}/>
        <input value={date} onChange={e=>setDate(e.target.value)} placeholder="Data" style={INP}/>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr 1fr 1fr', gap:'8px', marginTop:'8px' }}>
        <input value={owner} onChange={e=>{setOwner(e.target.value);if(!beneficiary)setBeneficiary(e.target.value)}} placeholder="Proprietar / beneficiar implicit" style={INP}/>
        <input value={ownerAddress} onChange={e=>setOwnerAddress(e.target.value)} placeholder="Adresa proprietarului / beneficiarului" style={INP}/>
        <input value={beneficiaryFunction} onChange={e=>setBeneficiaryFunction(e.target.value)} placeholder="Calitate / funcție" style={INP}/>
        <input value={identitySeries} onChange={e=>setIdentitySeries(e.target.value)} placeholder="Serie CI" style={INP}/>
        <input value={identityNumber} onChange={e=>setIdentityNumber(e.target.value)} placeholder="Număr CI" style={INP}/>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 2fr auto', gap:'8px', marginTop:'8px' }}>
        <input value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} placeholder="Beneficiar" style={INP}/>
        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Suma RON" style={INP}/>
        <input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Scopul plății" style={INP}/>
        <button onClick={generate} disabled={!(beneficiary||owner)||!amount||!purpose} style={{border:'none',borderRadius:'8px',background:culoare,color:'#FFF',padding:'8px 14px',cursor:'pointer'}}>Generează PDF</button>
      </div>
      {error&&<p style={{fontSize:'11px',color:'#F87171',marginTop:'8px'}}>{error}</p>}
    </div>}
  </div>
}

function CashReceiptsPanel({ firma, lunaId, culoare }: { firma:Firma; lunaId:string; culoare:string }) {
  const [expanded, setExpanded] = useState(false)
  const [docs, setDocs] = useState<CashDocument[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('utilitati')
  const [documentType, setDocumentType] = useState('factura')
  const [supplier, setSupplier] = useState('')
  const [drag, setDrag] = useState(false)
  const [showDisposition, setShowDisposition] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dispositionNumber, setDispositionNumber] = useState('')
  const [dispositionDate, setDispositionDate] = useState(new Date().toLocaleDateString('ro-RO'))
  const [beneficiary, setBeneficiary] = useState('')
  const [beneficiaryFunction, setBeneficiaryFunction] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [identitySeries, setIdentitySeries] = useState('')
  const [identityNumber, setIdentityNumber] = useState('')
  const [companyCif, setCompanyCif] = useState(firma.cif || firma.cui || '')
  const [companyRegCom, setCompanyRegCom] = useState(firma.nr_reg_com || firma.nr_registru_comertului || '')
  const [companyAddress, setCompanyAddress] = useState(firma.adresa || '')
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
    else setError(data.error || 'Documentele nu au putut fi încărcate')
    setLoaded(true)
    setLoading(false)
  }, [lunaId])

  async function toggle() {
    if (!expanded && !loaded) await loadDocs()
    setExpanded(value => !value)
  }

  async function upload(files: FileList) {
    if (!files.length) return
    setUploading(true)
    setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firma.id)
      fd.append('lunaId', lunaId)
      fd.append('category', category)
      fd.append('documentType', documentType)
      fd.append('supplier', supplier)
      const res = await fetch('/api/chitante', { method:'POST', body:fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Fișierul ${file.name} nu a putut fi încărcat`)
        break
      }
    }
    await loadDocs()
    setUploading(false)
  }

  function prepareDisposition(doc?: CashDocument) {
    const docCategory = doc?.modul.endsWith('_chirie') ? 'chirie' : doc?.modul.endsWith('_utilitati') ? 'utilitati' : category
    const docSupplier = doc?.furnizor || supplier
    setPurpose(docCategory === 'chirie' ? `Achitare chirie${docSupplier ? ` - ${docSupplier}` : ''}` : docCategory === 'utilitati' ? `Achitare utilitati${docSupplier ? ` - ${docSupplier}` : ''}` : `Achitare ${docSupplier || 'document cash'}`)
    setShowDisposition(true)
    fetch(`/api/chitante/dispozitie?lunaId=${encodeURIComponent(lunaId)}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => data?.nextNumber && setDispositionNumber(data.nextNumber))
      .catch(() => {})
  }

  async function generateDisposition() {
    setGenerating(true)
    setError('')
    const res = await fetch('/api/chitante/dispozitie', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        firmaId:firma.id,
        lunaId,
        firmaNume:firma.nume,
        cif:companyCif,
        nrRegCom:companyRegCom,
        adresa:companyAddress,
        date:dispositionDate,
        beneficiary,
        function:beneficiaryFunction,
        amount,
        purpose,
        identityType:'C.I.',
        identitySeries,
        identityNumber,
      }),
    })
    if (res.ok) {
      const assignedNumber = res.headers.get('X-Disposition-Number') || dispositionNumber
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `dispozitie_plata_${assignedNumber}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      setDispositionNumber(String(Number.parseInt(assignedNumber, 10) + 1).padStart(2, '0'))
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Dispoziția de plată nu a putut fi generată')
    }
    setGenerating(false)
  }

  const categoryLabel = (modul: string) =>
    modul.endsWith('_utilitati') ? 'Utilități' : modul.endsWith('_chirie') ? 'Chirie' : 'Altul'
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'9px 12px', color:'#BBB', outline:'none', width:'100%' }

  return (
    <div style={{ marginTop:'10px', background:'#161616', border:`1px solid rgba(${r},.3)`, borderRadius:'14px', overflow:'hidden' }}>
      <button onClick={toggle} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'15px 18px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
        <div>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#DDD', textTransform:'uppercase', letterSpacing:'.06em' }}>Facturi cu chitanță</div>
          <div style={{ fontSize:'11px', color:'#777', marginTop:'4px' }}>Documente plătite cash. Utilitățile și chiria vor putea genera dispoziție de plată.</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {loaded && <span style={{ fontSize:'11px', fontWeight:700, color:culoare }}>{docs.length} documente</span>}
          <span style={{ fontSize:'11px', color:'#666' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding:'16px 18px 18px', borderTop:'1px solid #1E1E1E', background:'#111' }}>
          {loading && <p style={{ fontSize:'12px', color:'#666', marginBottom:'12px' }}>Se încarcă...</p>}
          {docs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'16px' }}>
              {docs.map(doc => (
                <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 11px', background:'#171717', border:'1px solid #232323', borderRadius:'8px' }}>
                  <span style={{ fontSize:'12px', color:'#CCC', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</span>
                  <span style={{ fontSize:'10px', color:'#888' }}>{categoryLabel(doc.modul)}</span>
                  {doc.furnizor && <span style={{ fontSize:'10px', color:'#666' }}>{doc.furnizor}</span>}
                  {(doc.modul.endsWith('_utilitati') || doc.modul.endsWith('_chirie')) && (
                    <button onClick={()=>prepareDisposition(doc)} style={{ fontSize:'10px', fontWeight:700, color:'#DDD', background:'#242424', border:'1px solid #303030', borderRadius:'6px', padding:'4px 7px', cursor:'pointer' }}>Generează DP</button>
                  )}
                  <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:700, color:culoare, textDecoration:'none' }}>Descarcă ↓</a>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'8px', marginBottom:'10px' }}>
            <select value={category} onChange={event => setCategory(event.target.value)} style={INP}>
              <option value="utilitati">Utilități</option>
              <option value="chirie">Chirie</option>
              <option value="altul">Altul</option>
            </select>
            <select value={documentType} onChange={event => setDocumentType(event.target.value)} style={INP}>
              <option value="factura">Factură</option>
              <option value="chitanta">Chitanță</option>
            </select>
            <input value={supplier} onChange={event => setSupplier(event.target.value)} placeholder="Furnizor: E.ON Energie, asociație, proprietar..." style={INP} />
          </div>

          <div onClick={()=>fileRef.current?.click()} onDragOver={event=>{event.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);event.dataTransfer.files.length&&upload(event.dataTransfer.files)}}
            style={{ border:`1.5px dashed ${drag?culoare:'#2A2A2A'}`, borderRadius:'10px', padding:'20px', textAlign:'center', cursor:'pointer', background:drag?`rgba(${r},.06)`:'#0D0D0D' }}>
            <p style={{ fontSize:'13px', fontWeight:700, color:'#999' }}>{uploading ? 'Se încarcă...' : 'Adaugă factura și/sau chitanța'}</p>
            <p style={{ fontSize:'11px', color:'#666', marginTop:'3px' }}>PDF, JPG, PNG · poți selecta mai multe fișiere simultan</p>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={event=>event.target.files&&upload(event.target.files)} />
          <button onClick={()=>prepareDisposition()} style={{ marginTop:'10px', fontSize:'12px', fontWeight:700, padding:'8px 14px', borderRadius:'8px', border:`1px solid rgba(${r},.35)`, background:'transparent', color:culoare, cursor:'pointer' }}>
            Generează dispoziție de plată
          </button>

          {showDisposition && (
            <div style={{ marginTop:'14px', padding:'14px', border:'1px solid #272727', borderRadius:'10px', background:'#151515' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'#DDD' }}>Dispoziție de plată către casierie</div>
                  <div style={{ fontSize:'10px', color:'#666', marginTop:'3px' }}>Format copiat după exemplul Nexus ERP. Verifică suma și datele înainte de generare.</div>
                </div>
                <button onClick={()=>setShowDisposition(false)} style={{ background:'transparent', border:'none', color:'#666', cursor:'pointer' }}>Închide</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'8px', marginBottom:'8px' }}>
                <input value={companyCif} onChange={event=>setCompanyCif(event.target.value)} placeholder="CIF firmă" style={INP} />
                <input value={companyRegCom} onChange={event=>setCompanyRegCom(event.target.value)} placeholder="Nr. Registrul Comerțului" style={INP} />
                <input value={companyAddress} onChange={event=>setCompanyAddress(event.target.value)} placeholder="Adresa firmei" style={INP} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'8px', marginBottom:'8px' }}>
                <input value={dispositionNumber} readOnly placeholder="Se atribuie automat" title="Numărul este atribuit automat în ordine, separat pentru fiecare lună" style={{ ...INP, color:culoare, fontWeight:700, cursor:'not-allowed' }} />
                <input value={dispositionDate} onChange={event=>setDispositionDate(event.target.value)} placeholder="Data: 30.07.2025" style={INP} />
                <input value={beneficiary} onChange={event=>setBeneficiary(event.target.value)} placeholder="Numele și prenumele beneficiarului" style={INP} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'8px', marginBottom:'8px' }}>
                <input value={beneficiaryFunction} onChange={event=>setBeneficiaryFunction(event.target.value)} placeholder="Funcția / calitatea" style={INP} />
                <input type="number" min="0" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="Suma RON" style={INP} />
                <input value={purpose} onChange={event=>setPurpose(event.target.value)} placeholder="Scopul plății" style={INP} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'8px' }}>
                <input value={identitySeries} onChange={event=>setIdentitySeries(event.target.value)} placeholder="Serie CI" style={INP} />
                <input value={identityNumber} onChange={event=>setIdentityNumber(event.target.value)} placeholder="Număr CI" style={INP} />
                <button onClick={generateDisposition} disabled={generating || !amount || !beneficiary || !purpose} style={{ fontSize:'12px', fontWeight:700, border:'none', borderRadius:'8px', padding:'9px 14px', background:culoare, color:'#FFF', cursor:'pointer', opacity:generating || !amount || !beneficiary || !purpose ? .5 : 1 }}>
                  {generating ? 'Se generează...' : 'Descarcă PDF'}
                </button>
              </div>
            </div>
          )}
          {error && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

function ChecklistItemRow({ item, firmaId, lunaId, culoare, hasUpload, borderTop }:
  { item:Item; firmaId:string; lunaId:string; culoare:string; hasUpload:boolean; borderTop:boolean }
) {
  const [expanded, setExpanded] = useState(false)
  const [docs, setDocs] = useState<{id:string;fisier_nume:string;tip_document?:string}[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [tip, setTip] = useState('aviz_plata')
  const [desc, setDesc] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const t = item.checklist_templates
  const r = rgb(culoare)

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true)
    const res = await fetch(`/api/checklist/docs?itemId=${item.id}`)
    if (res.ok) { const d = await res.json(); setDocs(d.docs||[]) }
    setLoadingDocs(false)
  }, [item.id])

  async function toggle() {
    if (!expanded && hasUpload && docs.length===0) await loadDocs()
    setExpanded(e=>!e)
  }

  async function upload(files: FileList) {
    setUploading(true)
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file',f); fd.append('itemId',item.id); fd.append('firmaId',firmaId); fd.append('lunaId',lunaId); fd.append('tip',tip); fd.append('desc',desc)
      await fetch('/api/checklist/upload', { method:'POST', body:fd })
    }
    await loadDocs(); setUploading(false); router.refresh()
  }

  async function merge() {
    setMerging(true)
    const res = await fetch('/api/checklist/merge', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itemId:item.id, titlu:t?.titlu||'document' }) })
    if (res.ok) { const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${(t?.titlu||'doc').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`; a.click(); URL.revokeObjectURL(url) }
    setMerging(false)
  }

  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'8px 12px', color:'#BBB', outline:'none', width:'100%' }

  return (
    <div style={{ borderTop:borderTop?'1px solid #1A1A1A':'none', background:item.completat?'rgba(74,222,128,.04)':'transparent' }}>
      <div onClick={hasUpload?toggle:undefined} style={{ display:'flex', alignItems:'flex-start', gap:'12px', padding:'13px 18px', cursor:hasUpload?'pointer':'default' }}>
        <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0, marginTop:'1px', border:item.completat?'none':'1.5px solid #333', background:item.completat?'#4ADE80':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {item.completat && <svg width="10" height="10" fill="none" stroke="#0A0A0A" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'14px', fontWeight:item.completat?400:500, color:item.completat?'#555':'#DDD', textDecoration:item.completat?'line-through':'none' }}>{t?.titlu}</span>
            {t?.necesita_semnatura && <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', background:'rgba(251,146,60,.15)', color:'#FB923C' }}>semnat</span>}
            {t?.spre_proiect && <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', background:'rgba(167,139,250,.15)', color:'#A78BFA' }}>→ proiect</span>}
            {hasUpload && docs.length>0 && <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', background:`rgba(${r},.15)`, color:culoare }}>{docs.length} fișiere</span>}
          </div>
          {t?.descriere && <p style={{ fontSize:'11px', color:'#777', marginTop:'3px' }}>{t.descriere}</p>}
        </div>
        {hasUpload && <span style={{ fontSize:'11px', color:'#555', marginTop:'2px' }}>{expanded?'▲':'▼'}</span>}
      </div>

      {expanded && hasUpload && (
        <div style={{ padding:'0 18px 16px', borderTop:'1px solid #1A1A1A', background:'#111' }}>
          {loadingDocs && <p style={{ fontSize:'12px', color:'#555', padding:'12px 0' }}>Se încarcă...</p>}

          {docs.length>0 && (
            <div style={{ marginTop:'14px', marginBottom:'14px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'8px' }}>Fișiere ({docs.length})</div>
              {docs.map(d => (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#161616', borderRadius:'8px', border:'1px solid #222', marginBottom:'5px' }}>
                  <svg width="14" height="14" fill="none" stroke={culoare} strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                  <span style={{ fontSize:'13px', fontWeight:500, color:'#CCC', flex:1 }}>{d.fisier_nume}</span>
                  {d.tip_document && <span style={{ fontSize:'10px', color:'#666', background:'#1E1E1E', padding:'2px 7px', borderRadius:'5px' }}>{TIP_LBL[d.tip_document]||d.tip_document}</span>}
                </div>
              ))}
              <button onClick={merge} disabled={merging} style={{ marginTop:'10px', fontSize:'12px', fontWeight:700, padding:'8px 16px', borderRadius:'8px', border:'none', background:culoare, color:'#fff', cursor:'pointer', opacity:merging?.6:1 }}>
                {merging ? 'Generare...' : `${docs.length>1?`PDF combinat (${docs.length})`:' Descarcă PDF'} ↓`}
              </button>
            </div>
          )}

          <div style={{ marginTop:docs.length>0?'8px':'14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
              <select value={tip} onChange={e=>setTip(e.target.value)} style={INP}>
                {TIP_OPT.map(o=><option key={o} value={o}>{TIP_LBL[o]}</option>)}
              </select>
              <input type="text" placeholder="Descriere (opțional)" value={desc} onChange={e=>setDesc(e.target.value)} style={INP}/>
            </div>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files.length&&upload(e.dataTransfer.files)}}
              style={{ border:`1.5px dashed ${drag?culoare:'#2A2A2A'}`, borderRadius:'10px', padding:'20px', textAlign:'center', cursor:'pointer', background:drag?`rgba(${r},.06)`:'#0D0D0D' }}>
              {uploading
                ? <div><div style={{ width:'18px', height:'18px', border:`2px solid ${culoare}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 8px' }}/><p style={{ fontSize:'12px', color:'#777' }}>Se încarcă...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
                : <div><p style={{ fontSize:'13px', fontWeight:600, color:'#999' }}>Adaugă fișiere</p><p style={{ fontSize:'11px', color:'#666', marginTop:'3px' }}>PDF, JPG, PNG · mai multe simultan</p></div>
              }
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e=>e.target.files&&upload(e.target.files)}/>
          </div>
        </div>
      )}
    </div>
  )
}
