'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { legibil, tint } from '@/lib/colors'

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
  const INP: React.CSSProperties = { fontSize: '12px', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', color: 'var(--c-bbbbbb)', outline: 'none', width: '100%' }
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
    if (section !== 'airbnb-facturi') return
    const res = await fetch(`/api/airbnb/facturi-asteptate?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setAirbnbExpected(data.items || [])
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

  async function importLink() {
    if (!link) return
    setBusy(true); setError('')
    const res = await fetch('/api/chitante/import-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link, firmaId, lunaId, section, supplier, documentType }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setLink(''); await load(); await loadAirbnbExpected() }
    setBusy(false)
  }

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
      setReconcilMessage(data.matched > 0 ? `${data.matched} facturi asociate automat (sumă identică cu taxa de servicii din borderou).` : 'Nu am găsit potriviri noi după taxa de servicii.')
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
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--c-1a1a1a)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-e0e0e0)', marginBottom: '2px' }}>{title}</div>
          {description && <div style={{ fontSize: '11px', color: 'var(--c-888888)' }}>{description}</div>}
        </div>
        {loaded && docs.length > 0 && (
          <button onClick={savePdf} disabled={pdfBusy} style={{ flexShrink:0, fontSize:'11px', fontWeight:600, padding:'6px 12px', borderRadius:'7px', border:`1px solid ${culoare}`, background:'transparent', color:legibil(culoare), cursor:'pointer', opacity:pdfBusy?.6:1 }}>
            {pdfBusy ? '...' : '↓ PDF'}
          </button>
        )}
      </div>

      <div style={{ padding: '18px 22px' }}>
        {section === 'airbnb-facturi' && (
          <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid var(--c-1f1f1f)', borderRadius: '10px', background: 'var(--c-0d0d0d)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', marginBottom:'8px', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:'12px', fontWeight:700, color:'var(--c-dddddd)' }}>Facturi cerute de borderoul Airbnb</div>
                <div style={{ fontSize:'10px', color:'var(--c-777777)' }}>Se generează automat când încarci CSV-ul în Airbnb · Borderou. PDF-urile puse aici se asociază după cod rezervare sau sumă.</div>
              </div>
              {airbnbExpected.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', flexShrink:0 }}>
                  <span style={{ fontSize:'10px', fontWeight:700, color:'var(--accent-mint)', background:'light-dark(rgba(5,150,105,.12), rgba(110,231,176,.1))', border:'1px solid light-dark(rgba(5,150,105,.35), rgba(110,231,176,.3))', borderRadius:'999px', padding:'4px 8px' }}>
                    {airbnbMatched}/{airbnbExpected.length} atașate
                  </span>
                  {airbnbMissing > 0 && (
                    <button onClick={() => setShowOnlyMissing(v => !v)} style={{ fontSize:'10px', fontWeight:700, color:'#f97316', background:'rgba(251,146,60,.1)', border:'1px solid rgba(251,146,60,.35)', borderRadius:'999px', padding:'4px 8px', cursor:'pointer' }}>
                      {showOnlyMissing ? 'arată toate' : `${airbnbMissing} lipsă`}
                    </button>
                  )}
                  {airbnbOrphanDocIds.size > 0 && (
                    <span style={{ fontSize:'10px', fontWeight:700, color:'var(--accent-red)', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:'999px', padding:'4px 8px' }} title="Facturi din lista de mai jos care nu s-au putut asocia cu nicio rezervare din borderou">
                      {airbnbOrphanDocIds.size} fără rezervare
                    </span>
                  )}
                  {airbnbMissing > 0 && airbnbOrphanDocIds.size > 0 && (
                    <button onClick={reconciliazaAutomat} disabled={reconcilBusy} style={{ fontSize:'10px', fontWeight:700, padding:'4px 8px', borderRadius:'999px', border:`1px solid ${culoare}`, background:'transparent', color:legibil(culoare), cursor:'pointer', opacity:reconcilBusy?.6:1 }}>
                      {reconcilBusy ? 'Reconciliez...' : 'Reconciliază automat'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {reconcilMessage && <div style={{ fontSize:'11px', color:'var(--c-aaaaaa)', marginBottom:'8px' }}>{reconcilMessage}</div>}
            {airbnbExpectedError && <div style={{ fontSize:'11px', color:'var(--accent-red)' }}>{airbnbExpectedError}</div>}
            {!airbnbExpectedError && airbnbExpected.length === 0 && (
              <div style={{ fontSize:'11px', color:'var(--c-777777)' }}>Nu există încă facturi așteptate. Încarcă borderoul CSV Airbnb în modulul „Airbnb · Borderou”.</div>
            )}
            {airbnbExpected.length > 0 && showOnlyMissing && airbnbVisibleExpected.length === 0 && (
              <div style={{ fontSize:'11px', color:'var(--accent-mint)' }}>Toate rezervările au factură atașată.</div>
            )}
            {airbnbVisibleExpected.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {airbnbVisibleExpected.map(item => {
                  const attached = !!item.factura_document_id
                  const dates = [formatDate(item.data_start), formatDate(item.data_sfarsit)].filter(Boolean).join(' - ')
                  return (
                    <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'10px', alignItems:'center', padding:'8px 10px', border:'1px solid var(--c-222222)', borderRadius:'8px', background:attached ? 'light-dark(rgba(5,150,105,.12), rgba(110,231,176,.06))' : 'var(--c-141414)' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:700, color:attached ? 'var(--accent-mint)' : 'var(--c-cccccc)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {item.cod_confirmare} · {item.oaspete || 'oaspete necitit'} · {formatCurrency(item.suma, item.moneda)}
                        </div>
                        <div style={{ fontSize:'10px', color:'var(--c-666666)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>
                          {dates || formatDate(item.data_tranzactie)} {item.anunt ? `· ${item.anunt}` : ''}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        {attached ? (
                          <>
                            <span style={{ fontSize:'10px', fontWeight:700, color:'var(--accent-mint)' }}>
                              atașată{item.asociere_metoda === 'taxa_servicii_exacta' ? ' (auto)' : ''}
                            </span>
                            <a href={`/api/chitante/document?id=${encodeURIComponent(item.factura_document_id!)}`} style={{ fontSize:'10px', color:legibil(culoare), textDecoration:'none' }}>↓</a>
                            <button onClick={() => detaseazaFactura(item)} title="Detașează factura de la această rezervare" style={{ fontSize:'10px', color:'var(--accent-red)', background:'transparent', border:'none', cursor:'pointer', padding:0 }}>✕</button>
                          </>
                        ) : attachPickerFor === item.id ? (
                          <>
                            <select value={attachPick[item.id] || ''} onChange={e => setAttachPick(prev => ({ ...prev, [item.id]: e.target.value }))} style={{ fontSize:'10px', padding:'4px 6px', borderRadius:'6px', border:'1px solid var(--c-2a2a2a)', background:'var(--c-0f0f0f)', color:'var(--c-cccccc)', maxWidth:'160px' }}>
                              <option value="">Alege factura...</option>
                              {visibleDocs.map(doc => <option key={doc.id} value={doc.id}>{docLabel(doc)}</option>)}
                            </select>
                            <button onClick={() => atribuieManualFactura(item.id)} disabled={!attachPick[item.id] || attachBusy === item.id} style={{ fontSize:'10px', fontWeight:700, padding:'4px 8px', borderRadius:'6px', border:'none', background:culoare, color:'var(--c-ffffff)', cursor:'pointer', opacity:(!attachPick[item.id] || attachBusy === item.id) ? .5 : 1 }}>
                              {attachBusy === item.id ? '...' : 'Leagă'}
                            </button>
                            <button onClick={() => setAttachPickerFor(null)} style={{ fontSize:'10px', color:'var(--c-888888)', background:'transparent', border:'none', cursor:'pointer' }}>Anulează</button>
                          </>
                        ) : (
                          <button onClick={() => setAttachPickerFor(item.id)} style={{ fontSize:'10px', fontWeight:700, padding:'4px 9px', borderRadius:'6px', border:'1px solid var(--c-333333)', background:'transparent', color:'var(--c-999999)', cursor:'pointer' }}>
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
          <div style={{ fontSize: '11px', color: 'var(--accent-mint)', marginBottom: '16px' }}>Toate facturile sunt deja asociate cu o rezervare din borderou.</div>
        )}
        {loaded && visibleDocs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {(showPaidToggle ? [...visibleDocs].sort((a, b) => Number(!!a.platit) - Number(!!b.platit)) : visibleDocs).map(doc => {
              const isPaid = showPaidToggle && !!doc.platit
              const kind = isPreviewable(doc.fisier_tip, doc.fisier_nume)
              const open = previewIds.has(doc.id)
              return (
                <div key={doc.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: isPaid ? 'var(--c-141414)' : 'var(--c-161616)', border: `1px solid ${isPaid ? 'var(--c-1e1e1e)' : 'var(--c-222222)'}`, borderRadius: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPaid ? 'var(--c-333333)' : culoare, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: isPaid ? 'var(--c-666666)' : 'var(--c-cccccc)', textDecoration: isPaid ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {docLabel(doc)}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--c-666666)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.fisier_nume}
                      </div>
                    </div>
                    {doc.tip_document && <span style={{ fontSize: '10px', color: 'var(--c-888888)' }}>{doc.tip_document}</span>}
                    {showPaidToggle && (
                      <button onClick={() => togglePaid(doc)} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: `1px solid ${isPaid ? 'var(--c-2a2a2a)' : 'light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))'}`, background: isPaid ? 'var(--c-1a1a1a)' : 'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color: isPaid ? 'var(--c-888888)' : 'var(--accent-mint)', cursor: 'pointer', flexShrink: 0 }}>
                        {isPaid ? 'Anulează' : 'Marchează achitat'}
                      </button>
                    )}
                    {kind && (
                      <button onClick={() => togglePreview(doc.id)} style={{ fontSize: '11px', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                        {open ? 'Ascunde' : 'Vezi'}
                      </button>
                    )}
                    <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize: '11px', fontWeight: 600, color: legibil(culoare) }}>↓</a>
                    <button onClick={() => deleteDoc(doc)} style={{ fontSize: '10px', color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                  {open && kind === 'pdf' && (
                    <iframe src={`/api/chitante/document?id=${encodeURIComponent(doc.id)}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                  )}
                  {open && kind === 'image' && (
                    <img src={`/api/chitante/document?id=${encodeURIComponent(doc.id)}&preview=1`} alt={doc.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
        {!loaded && <div style={{ fontSize: '12px', color: 'var(--c-999999)', marginBottom: '12px' }}>Se încarcă...</div>}

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
            <button onClick={importLink} disabled={busy || !link} style={{ padding: '9px 14px', border: 'none', borderRadius: '8px', background: culoare, color: 'var(--c-ffffff)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: busy || !link ? .5 : 1 }}>
              Import
            </button>
          </div>
        )}

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
          style={{
            border: `1.5px dashed ${drag ? culoare : 'var(--c-252525)'}`,
            borderRadius: '10px', padding: '18px',
            textAlign: 'center', cursor: 'pointer',
            background: drag ? `${tint(r,.04)}` : 'var(--c-0d0d0d)',
            transition: 'all .15s',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-666666)', marginBottom: '3px' }}>
            {busy ? 'Se încarcă...' : 'Adaugă fișiere'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--c-888888)' }}>{acceptLabel} · drag & drop sau click</div>
        </div>
        <input ref={fileRef} type="file" multiple accept={fileAccept} style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files && upload(e.target.files)}/>

        {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{error}</p>}
      </div>
    </div>
  )
}
