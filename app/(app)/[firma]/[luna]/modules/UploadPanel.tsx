'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import CopyButton from '@/components/CopyButton'

interface Doc {
  id: string
  fisier_nume: string
  fisier_tip?: string | null
  tip_document?: string
  furnizor?: string
  numar_document?: string | null
  suma?: number | null
  data_document?: string | null
  platit?: boolean
  data_platii?: string|null
}

interface AirbnbExpectedInvoice {
  id: string
  cod_confirmare: string
  oaspete?: string | null
  anunt?: string | null
  data_start?: string | null
  data_sfarsit?: string | null
  data_tranzactie?: string | null
  moneda?: string | null
  suma?: number | null
  status?: string | null
  factura_document_id?: string | null
  asociere_metoda?: string | null
  documente?: { fisier_nume?: string | null } | null
}

function isPreviewable(tip: string | null | undefined, nume: string) {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}

interface Props {
  firmaId: string
  lunaId: string
  section: string
  culoare: string
  title: string
  description?: string
  showLinkImport?: boolean
  linkPlaceholder?: string
  documentTypeOptions?: { value: string; label: string }[]
  showPaidToggle?: boolean
  onChange?: () => void
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

function cleanSupplier(value?: string | null) {
  return String(value || '').split('|')[0]?.trim() || ''
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ro-RO', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function formatMoney(value?: number | null) {
  return typeof value === 'number' ? `${value.toFixed(2)} RON` : ''
}

function formatCurrency(value?: number | null, currency?: string | null) {
  if (typeof value !== 'number') return ''
  return `${value.toFixed(2)} ${currency || 'RON'}`
}

function docLabel(doc: Doc) {
  const parts = [
    doc.numar_document ? `Factura ${doc.numar_document}` : '',
    cleanSupplier(doc.furnizor),
    formatDate(doc.data_document),
    formatMoney(doc.suma),
  ].filter(Boolean)
  return parts.length ? parts.join(' - ') : doc.fisier_nume
}

export default function UploadPanel({
  firmaId, lunaId, section, culoare, title, description,
  showLinkImport = false, linkPlaceholder, documentTypeOptions, showPaidToggle = false, onChange,
}: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [airbnbExpected, setAirbnbExpected] = useState<AirbnbExpectedInvoice[]>([])
  const [airbnbExpectedError, setAirbnbExpectedError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [link, setLink] = useState('')
  const [supplier, setSupplier] = useState('')
  const [documentType, setDocumentType] = useState(documentTypeOptions?.[0]?.value || 'altul')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const [showOnlyMissing, setShowOnlyMissing] = useState(false)
  const [reconcilBusy, setReconcilBusy] = useState(false)
  const [reconcilMessage, setReconcilMessage] = useState('')
  const [attachPickerFor, setAttachPickerFor] = useState<string | null>(null)
  const [attachPick, setAttachPick] = useState<Record<string, string>>({})
  const [attachBusy, setAttachBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)
  const INP: React.CSSProperties = { fontSize: 'var(--fs-sm)', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-md)', padding: '9px 12px', color: 'var(--c-bbbbbb)', outline: 'none', width: '100%' }
  const acceptsCsv = section === 'airbnb-borderou'
  const fileAccept = acceptsCsv ? '.pdf,.jpg,.jpeg,.png,.csv,text/csv' : '.pdf,.jpg,.jpeg,.png'
  const acceptLabel = acceptsCsv ? 'PDF, JPG, PNG, CSV' : 'PDF, JPG, PNG'

  const load = useCallback(async () => {
    const res = await fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}&section=${section}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
    setLoaded(true)
  }, [lunaId, firmaId, section])

  const loadAirbnbExpected = useCallback(async () => {
    if (section !== 'airbnb-facturi') {
      // In Borderou: un CSV nou genereaza rezervarile - anuntam lista de rezervari sa se reincarce.
      if (section === 'airbnb-borderou') window.dispatchEvent(new CustomEvent('cf:airbnb-refresh'))
      return
    }
    const res = await fetch(`/api/airbnb/facturi-asteptate?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setAirbnbExpected(data.items || [])
      // Anunta lista de rezervari (AirbnbRezervari) ca s-a schimbat ceva (borderou nou, factura atasata etc.)
      window.dispatchEvent(new CustomEvent('cf:airbnb-refresh'))
      setAirbnbExpectedError('')
    } else {
      setAirbnbExpected([])
      setAirbnbExpectedError(data.error || 'Nu pot citi facturile așteptate din borderou')
    }
  }, [lunaId, firmaId, section])

  useEffect(() => { load(); loadAirbnbExpected() }, [load, loadAirbnbExpected])

  async function upload(files: FileList) {
    setBusy(true); setError('')
    const documentTypeLabel = documentTypeOptions?.find(o => o.value === documentType)?.label || ''
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      fd.append('lunaId', lunaId)
      fd.append('section', section)
      fd.append('category', 'altul')
      fd.append('documentType', documentType)
      fd.append('documentTypeLabel', documentTypeLabel)
      fd.append('supplier', supplier)
      const res = await fetch('/api/chitante', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d.error || 'Eroare upload'); break }
    }
    await load()
    await loadAirbnbExpected()
    setBusy(false)
    onChange?.()
  }

  async function importLink(urlOverride?: string) {
    const targetUrl = urlOverride || link
    if (!targetUrl) return
    setBusy(true); setError('')
    const res = await fetch('/api/chitante/import-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, firmaId, lunaId, section, supplier, documentType }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setLink(''); await load(); await loadAirbnbExpected() }
    setBusy(false)
  }

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) {
        e.preventDefault()
        const dt = new DataTransfer()
        files.forEach(file => dt.items.add(file))
        upload(dt.files)
        return
      }
      if (!showLinkImport) return
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text && /^https?:\/\//i.test(text)) {
        e.preventDefault()
        setLink(text)
        importLink(text)
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  })

  async function savePdf() {
    setPdfBusy(true)
    try {
      const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, title, scope:{ section } }) })
      if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${title.replace(/[^a-zA-Z0-9]+/g,'_')}.pdf`; a.click(); URL.revokeObjectURL(u) }
      else { const e=await res.json().catch(()=>({error:'Eroare server'})); alert(e.error||'Eroare la generare PDF') }
    } catch(e) { alert('Eroare conexiune: '+String(e)) }
    setPdfBusy(false)
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Ștergi „${doc.fisier_nume}"?`)) return
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
    if (res.ok) { setDocs(prev => prev.filter(d => d.id !== doc.id)); await loadAirbnbExpected(); onChange?.() }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Documentul nu a putut fi șters') }
  }

  async function togglePaid(doc: Doc) {
    const next = !doc.platit
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, platit: next } : d))
    const res = await fetch('/api/chitante/plata', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, platit: next }) })
    if (!res.ok) setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, platit: doc.platit } : d))
  }

  async function renameDoc(doc: Doc, fisier_nume: string) {
    if (!fisier_nume.trim() || fisier_nume === doc.fisier_nume) return
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, fisier_nume } : d))
    await fetch('/api/documente/rename', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, fisier_nume }) })
  }

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function reconciliazaAutomat() {
    setReconcilBusy(true)
    setReconcilMessage('')
    const res = await fetch('/api/airbnb/facturi-asteptate/reconciliaza', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, lunaId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setReconcilMessage(data.error || 'Reconcilierea a eșuat')
    else {
      setReconcilMessage(data.matched > 0 ? `${data.matched} facturi asociate automat (${data.dupaCod} după codul de rezervare, ${data.dupaSuma} după sumă exactă).` : 'Nu am găsit potriviri noi.')
      await loadAirbnbExpected()
    }
    setReconcilBusy(false)
  }

  async function detaseazaFactura(item: AirbnbExpectedInvoice) {
    if (!confirm(`Detașezi factura de la rezervarea ${item.cod_confirmare}?`)) return
    const res = await fetch(`/api/airbnb/facturi-asteptate/reconciliaza?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    if (res.ok) await loadAirbnbExpected()
    else { const d = await res.json().catch(() => ({})); setAirbnbExpectedError(d.error || 'Nu am putut detașa factura') }
  }

  async function atribuieManualFactura(itemId: string) {
    const docId = attachPick[itemId]
    if (!docId) return
    setAttachBusy(itemId)
    const res = await fetch('/api/airbnb/facturi-asteptate/reconciliaza', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, docId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setAirbnbExpectedError(data.error || 'Nu am putut atașa factura')
    else {
      setAttachPickerFor(null)
      setAttachPick(prev => { const next = { ...prev }; delete next[itemId]; return next })
      await loadAirbnbExpected()
    }
    setAttachBusy(null)
  }

  // Reconciliere borderou ↔ facturi: câte rezervări au factură, câte lipsesc,
  // și câte facturi din lista de mai jos nu s-au putut asocia cu nicio rezervare.
  const airbnbMatchedIds = new Set(airbnbExpected.map(i => i.factura_document_id).filter(Boolean) as string[])
  const airbnbMatched = airbnbExpected.filter(i => i.factura_document_id).length
  const airbnbMissing = airbnbExpected.length - airbnbMatched
  const airbnbOrphanDocIds = section === 'airbnb-facturi' && airbnbExpected.length > 0
    ? new Set(docs.filter(d => !airbnbMatchedIds.has(d.id)).map(d => d.id))
    : new Set<string>()
  const airbnbVisibleExpected = showOnlyMissing ? airbnbExpected.filter(i => !i.factura_document_id) : airbnbExpected
  // Facturile deja asociate unei rezervări nu mai apar în lista de jos — rămân vizibile doar prin rezervarea lor de mai sus.
  const visibleDocs = section === 'airbnb-facturi' ? docs.filter(d => !airbnbMatchedIds.has(d.id)) : docs

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{title}</div>
          {description && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>{description}</div>}
        </div>
        {loaded && docs.length > 0 && (
          <button onClick={savePdf} disabled={pdfBusy} className="btn btn-sm" title="Descarcă toate documentele într-un PDF" style={{ flexShrink:0, opacity:pdfBusy?.6:1 }}>
            {pdfBusy ? 'Se generează…' : '↓ PDF'}
          </button>
        )}
      </div>

      <div style={{ padding: '16px' }}>
        {section === 'airbnb-facturi' && (
          <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid var(--c-1f1f1f)', borderRadius: 'var(--r-md)', background: 'var(--c-0d0d0d)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', marginBottom:'8px', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:'var(--fs-sm)', fontWeight:700, color:'var(--c-dddddd)' }}>Facturi cerute de borderoul Airbnb</div>
                <div style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)' }}>Se generează automat când încarci CSV-ul în Airbnb · Borderou. PDF-urile puse aici se asociază după cod rezervare sau sumă.</div>
              </div>
              {airbnbExpected.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', flexShrink:0 }}>
                  <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--success)', background:'light-dark(rgba(5,150,105,.12), rgba(110,231,176,.1))', border:'1px solid light-dark(rgba(5,150,105,.35), rgba(110,231,176,.3))', borderRadius:'var(--r-full)', padding:'4px 8px' }}>
                    {airbnbMatched}/{airbnbExpected.length} atașate
                  </span>
                  {airbnbMissing > 0 && (
                    <button onClick={() => setShowOnlyMissing(v => !v)} style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--warning)', background:'rgba(251,146,60,.1)', border:'1px solid rgba(251,146,60,.35)', borderRadius:'var(--r-full)', padding:'4px 8px', cursor:'pointer' }}>
                      {showOnlyMissing ? 'arată toate' : `${airbnbMissing} lipsă`}
                    </button>
                  )}
                  {airbnbOrphanDocIds.size > 0 && (
                    <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--danger)', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:'var(--r-full)', padding:'4px 8px' }} title="Facturi din lista de mai jos care nu s-au putut asocia cu nicio rezervare din borderou">
                      {airbnbOrphanDocIds.size} fără rezervare
                    </span>
                  )}
                  {airbnbMissing > 0 && airbnbOrphanDocIds.size > 0 && (
                    <button onClick={reconciliazaAutomat} disabled={reconcilBusy} style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'4px 8px', borderRadius:'var(--r-full)', border:'1px solid var(--accent)', background:'transparent', color:'var(--accent)', cursor:'pointer', opacity:reconcilBusy?.6:1 }}>
                      {reconcilBusy ? 'Reconciliez...' : 'Reconciliază automat'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {reconcilMessage && <div style={{ fontSize:'var(--fs-xs)', color:'var(--c-aaaaaa)', marginBottom:'8px' }}>{reconcilMessage}</div>}
            {airbnbExpectedError && <div style={{ fontSize:'var(--fs-xs)', color:'var(--danger)' }}>{airbnbExpectedError}</div>}
            {!airbnbExpectedError && airbnbExpected.length === 0 && (
              <div style={{ fontSize:'var(--fs-xs)', color:'var(--c-777777)' }}>Nu există încă facturi așteptate. Încarcă borderoul CSV Airbnb în modulul „Airbnb · Borderou”.</div>
            )}
            {airbnbExpected.length > 0 && showOnlyMissing && airbnbVisibleExpected.length === 0 && (
              <div style={{ fontSize:'var(--fs-xs)', color:'var(--success)' }}>Toate rezervările au factură atașată.</div>
            )}
            {airbnbVisibleExpected.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {airbnbVisibleExpected.map(item => {
                  const attached = !!item.factura_document_id
                  const dates = [formatDate(item.data_start), formatDate(item.data_sfarsit)].filter(Boolean).join(' - ')
                  return (
                    <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'10px', alignItems:'center', padding:'8px 10px', border:'1px solid var(--c-222222)', borderRadius:'var(--r-md)', background:attached ? 'light-dark(rgba(5,150,105,.12), rgba(110,231,176,.06))' : 'var(--c-141414)' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
                          <CopyButton value={item.cod_confirmare} />
                          <span style={{ fontSize:'var(--fs-sm)', fontWeight:700, color:attached ? 'var(--success)' : 'var(--c-cccccc)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {item.cod_confirmare} · {item.oaspete || 'oaspete necitit'} · {formatCurrency(item.suma, item.moneda)}
                          </span>
                        </div>
                        <div style={{ fontSize:'var(--fs-xs)', color:'var(--c-666666)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>
                          {dates || formatDate(item.data_tranzactie)} {item.anunt ? `· ${item.anunt}` : ''}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        {attached ? (
                          <>
                            <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--success)' }}>
                              atașată{item.asociere_metoda === 'cod_rezervare' ? ' (auto · cod)' : item.asociere_metoda === 'taxa_servicii_exacta' ? ' (auto · sumă)' : ''}
                            </span>
                            <a href={`/api/chitante/document?id=${encodeURIComponent(item.factura_document_id!)}`} style={{ fontSize:'var(--fs-xs)', color:'var(--accent)', textDecoration:'none' }}>↓</a>
                            <button onClick={() => detaseazaFactura(item)} title="Detașează factura de la această rezervare" style={{ fontSize:'var(--fs-xs)', color:'var(--danger)', background:'transparent', border:'none', cursor:'pointer', padding:0 }}>✕</button>
                          </>
                        ) : attachPickerFor === item.id ? (
                          <>
                            <select value={attachPick[item.id] || ''} onChange={e => setAttachPick(prev => ({ ...prev, [item.id]: e.target.value }))} style={{ fontSize:'var(--fs-xs)', padding:'4px 6px', borderRadius:'var(--r-sm)', border:'1px solid var(--c-2a2a2a)', background:'var(--c-0f0f0f)', color:'var(--c-cccccc)', maxWidth:'160px' }}>
                              <option value="">Alege factura...</option>
                              {visibleDocs.map(doc => <option key={doc.id} value={doc.id}>{docLabel(doc)}</option>)}
                            </select>
                            <button onClick={() => atribuieManualFactura(item.id)} disabled={!attachPick[item.id] || attachBusy === item.id} style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'4px 8px', borderRadius:'var(--r-sm)', border:'none', background:'var(--accent-solid)', color:'#fff', cursor:'pointer', opacity:(!attachPick[item.id] || attachBusy === item.id) ? .5 : 1 }}>
                              {attachBusy === item.id ? '...' : 'Leagă'}
                            </button>
                            <button onClick={() => setAttachPickerFor(null)} style={{ fontSize:'var(--fs-xs)', color:'var(--c-888888)', background:'transparent', border:'none', cursor:'pointer' }}>Anulează</button>
                          </>
                        ) : (
                          <button onClick={() => setAttachPickerFor(item.id)} style={{ fontSize:'var(--fs-xs)', fontWeight:700, padding:'4px 9px', borderRadius:'var(--r-sm)', border:'1px solid var(--c-333333)', background:'transparent', color:'var(--c-999999)', cursor:'pointer' }}>
                            Atașează factură
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Document list */}
        {section === 'airbnb-facturi' && loaded && docs.length > 0 && visibleDocs.length === 0 && (
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)', marginBottom: '16px' }}>Toate facturile sunt deja asociate cu o rezervare din borderou.</div>
        )}
        {loaded && visibleDocs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {(showPaidToggle ? [...visibleDocs].sort((a, b) => Number(!!a.platit) - Number(!!b.platit)) : visibleDocs).map(doc => {
              const isPaid = showPaidToggle && !!doc.platit
              const kind = isPreviewable(doc.fisier_tip, doc.fisier_nume)
              const open = previewIds.has(doc.id)
              return (
                <div key={doc.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: isPaid ? 'var(--c-141414)' : 'var(--c-161616)', border: `1px solid ${isPaid ? 'var(--c-1e1e1e)' : 'var(--c-222222)'}`, borderRadius: 'var(--r-md)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPaid ? 'var(--c-333333)' : culoare, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: isPaid ? 'var(--c-666666)' : 'var(--c-cccccc)', textDecoration: isPaid ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {docLabel(doc)}
                      </div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-666666)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.fisier_nume}
                      </div>
                    </div>
                    {doc.tip_document && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-888888)' }}>{doc.tip_document}</span>}
                    {showPaidToggle && (
                      <button onClick={() => togglePaid(doc)} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${isPaid ? 'var(--c-2a2a2a)' : 'light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))'}`, background: isPaid ? 'var(--c-1a1a1a)' : 'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color: isPaid ? 'var(--c-888888)' : 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}>
                        {isPaid ? 'Anulează' : 'Marchează achitat'}
                      </button>
                    )}
                    {kind && (
                      <button onClick={() => togglePreview(doc.id)} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                        {open ? 'Ascunde' : 'Vezi'}
                      </button>
                    )}
                    <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} title="Descarcă" aria-label={`Descarcă ${doc.fisier_nume}`} className="btn btn-sm btn-ghost btn-icon" style={{ color:'var(--accent)' }}>↓</a>
                    <button onClick={() => deleteDoc(doc)} title="Șterge" aria-label={`Șterge ${doc.fisier_nume}`} className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--danger)' }}>✕</button>
                  </div>
                  {open && kind === 'pdf' && (
                    <iframe src={`/api/chitante/document?id=${encodeURIComponent(doc.id)}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-262626)', borderRadius: 'var(--r-md)', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                  )}
                  {open && kind === 'image' && (
                    <img src={`/api/chitante/document?id=${encodeURIComponent(doc.id)}&preview=1`} alt={doc.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: 'var(--r-md)', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
        {!loaded && <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>{[0, 1].map(i => <div key={i} className="skeleton" style={{ height: '44px' }} />)}</div>}

        {/* Options row */}
        <div style={{ display: 'grid', gridTemplateColumns: supplier !== undefined ? '1fr' + (documentTypeOptions ? ' 1fr' : '') : '1fr', gap: '8px', marginBottom: '10px' }}>
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Furnizor / descriere (opțional)" style={INP}/>
          {documentTypeOptions && (
            <select value={documentType} onChange={e => setDocumentType(e.target.value)} style={INP}>
              {documentTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>

        {/* Link import */}
        {showLinkImport && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginBottom: '10px' }}>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder={linkPlaceholder || 'Link PDF (HTTPS)'} style={INP}/>
            <button onClick={() => importLink()} disabled={busy || !link} style={{ padding: '9px 14px', border: 'none', borderRadius: 'var(--r-md)', background:'var(--accent-solid)', color: '#fff', cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600, opacity: busy || !link ? .5 : 1 }}>
              Import
            </button>
          </div>
        )}

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`Adaugă fișiere (${acceptLabel})`}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
          style={{
            border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--r-md)', padding: '20px 16px',
            textAlign: 'center', cursor: busy ? 'wait' : 'pointer',
            background: drag ? 'var(--accent-soft)' : 'var(--surface-sunken)',
            transition: 'background-color .15s, border-color .15s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={drag ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ margin: '0 auto 6px', display: 'block' }}><path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {busy ? 'Se încarcă…' : drag ? 'Eliberează pentru a încărca' : 'Adaugă fișiere'}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{acceptLabel} · trage aici sau click</div>
        </div>
        <input ref={fileRef} type="file" multiple accept={fileAccept} style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files && upload(e.target.files)}/>

        {error && <p role="alert" style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)', marginTop: '8px' }}>{error}</p>}
      </div>
    </div>
  )
}
