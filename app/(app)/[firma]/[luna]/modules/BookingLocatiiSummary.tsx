'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { legibil, tint } from '@/lib/colors'

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

interface Doc {
  id: string
  fisier_nume: string
  tip_document?: string
  furnizor?: string
  numar_document?: string | null
  suma?: number | null
  data_document?: string | null
  cod_unitate_booking?: string | null
}
interface Locatie {
  id: string
  cod: string
  denumire: string
  activa: boolean
  created_at?: string | null
}

function cleanSupplier(value?: string | null) {
  return String(value || '').split('|')[0]?.trim() || ''
}

function docLabel(doc: Doc) {
  const parts = [
    doc.numar_document ? `Nr. ${doc.numar_document}` : '',
    cleanSupplier(doc.furnizor),
    doc.data_document,
    doc.suma != null ? `${doc.suma.toFixed(2)} RON` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : doc.fisier_nume
}

export default function BookingLocatiiSummary({ firmaId, lunaId, culoare }: { firmaId: string; lunaId: string; culoare: string }) {
  const [locatii, setLocatii] = useState<Locatie[]>([])
  const [docsFacturi, setDocsFacturi] = useState<Doc[]>([])
  const [docsBorderou, setDocsBorderou] = useState<Doc[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cod, setCod] = useState('')
  const [denumire, setDenumire] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [link, setLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)

  const load = useCallback(async () => {
    const [locRes, facturiRes, borderouRes] = await Promise.all([
      fetch(`/api/booking/locatii?firmaId=${encodeURIComponent(firmaId)}`),
      fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}&section=booking-facturi`),
      fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}&section=booking-borderou`),
    ])
    const [locData, facturiData, borderouData] = await Promise.all([locRes.json().catch(()=>({})), facturiRes.json().catch(()=>({})), borderouRes.json().catch(()=>({}))])
    if (locRes.ok) setLocatii(locData.locatii || [])
    if (facturiRes.ok) setDocsFacturi(facturiData.docs || [])
    if (borderouRes.ok) setDocsBorderou(borderouData.docs || [])
    setLoaded(true)
  }, [firmaId, lunaId])

  useEffect(() => { load() }, [load])

  async function addLocatie() {
    if (!cod.trim() || !denumire.trim()) return
    setBusy(true); setError('')
    const res = await fetch('/api/booking/locatii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, cod: cod.trim(), denumire: denumire.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Nu am putut adăuga locația')
    else { setCod(''); setDenumire(''); await load() }
    setBusy(false)
  }

  async function addBulk() {
    if (!bulkText.trim()) return
    setBusy(true); setError('')
    const res = await fetch('/api/booking/locatii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, bulkText }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Nu am putut adăuga locațiile')
    else { setBulkText(''); setShowBulk(false); await load() }
    setBusy(false)
  }

  async function uploadFiles(files: FileList) {
    if (!files.length) return
    setUploadBusy(true); setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      fd.append('lunaId', lunaId)
      fd.append('section', 'booking-auto')
      fd.append('category', 'altul')
      const res = await fetch('/api/chitante', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Eroare upload'); break }
    }
    await load()
    setUploadBusy(false)
  }

  async function importLink(urlOverride?: string) {
    const targetUrl = urlOverride || link
    if (!targetUrl) return
    setUploadBusy(true); setError('')
    const res = await fetch('/api/chitante/import-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, firmaId, lunaId, section: 'booking-auto' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setLink(''); await load() }
    setUploadBusy(false)
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
        uploadFiles(dt.files)
        return
      }
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

  async function removeLocatie(loc: Locatie) {
    if (!confirm(`Ștergi locația „${loc.denumire}" (${loc.cod})? Documentele deja încărcate rămân, doar nu vor mai fi grupate sub ea.`)) return
    const res = await fetch(`/api/booking/locatii?id=${encodeURIComponent(loc.id)}`, { method: 'DELETE' })
    if (res.ok) setLocatii(prev => prev.filter(l => l.id !== loc.id))
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Nu am putut șterge locația') }
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Ștergi „${doc.fisier_nume}"?`)) return
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
    if (res.ok) await load()
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Documentul nu a putut fi șters') }
  }

  const activeLocatii = locatii.filter(l => l.activa)
  const facturiFaraLocatie = docsFacturi.filter(d => !d.cod_unitate_booking || !activeLocatii.some(l => l.cod === d.cod_unitate_booking))
  const borderouFaraLocatie = docsBorderou.filter(d => !d.cod_unitate_booking || !activeLocatii.some(l => l.cod === d.cod_unitate_booking))

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--c-1a1a1a)' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-ffffff)', marginBottom: '4px' }}>Proprietăți Booking.com</div>
        <div style={{ fontSize: '12px', color: 'var(--c-888888)', lineHeight: 1.45 }}>
          Fiecare proprietate are un cod (numărul unității de cazare din Booking) — facturile de comision și borderourile se grupează automat după acest cod, extras din documentul încărcat.
        </div>
      </div>

      <div style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          <input value={cod} onChange={e => setCod(e.target.value)} placeholder="Cod (ex. 15331624)" style={{ width: '140px', fontSize: '12px', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', color: 'var(--c-dddddd)', outline: 'none' }}/>
          <input value={denumire} onChange={e => setDenumire(e.target.value)} placeholder="Denumire locație" style={{ flex: 1, minWidth: '200px', fontSize: '12px', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', color: 'var(--c-dddddd)', outline: 'none' }}/>
          <button onClick={addLocatie} disabled={busy || !cod.trim() || !denumire.trim()} style={{ fontSize: '12px', fontWeight: 700, padding: '9px 14px', borderRadius: '8px', border: 'none', background: culoare, color: '#fff', cursor: 'pointer', opacity: (busy || !cod.trim() || !denumire.trim()) ? .5 : 1 }}>
            Adaugă
          </button>
          <button onClick={() => setShowBulk(v => !v)} style={{ fontSize: '12px', fontWeight: 700, padding: '9px 14px', borderRadius: '8px', border: `1px solid ${culoare}`, background: 'transparent', color: legibil(culoare), cursor: 'pointer' }}>
            {showBulk ? 'Ascunde' : 'Adaugă mai multe deodată'}
          </button>
        </div>

        {showBulk && (
          <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} placeholder={'Lipește lista de proprietăți copiată din Booking extranet (cod + denumire pe același rând, ex:\n15331624   SkyPort Modern & stylish apartment...\n14207430   Oaza de natură lângă Gară...)'} style={{ fontSize: '12px', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '10px 12px', color: 'var(--c-dddddd)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}/>
            <button onClick={addBulk} disabled={busy || !bulkText.trim()} style={{ alignSelf: 'flex-start', fontSize: '12px', fontWeight: 700, padding: '9px 14px', borderRadius: '8px', border: 'none', background: culoare, color: '#fff', cursor: 'pointer', opacity: (busy || !bulkText.trim()) ? .5 : 1 }}>
              Adaugă din listă
            </button>
          </div>
        )}

        {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginBottom: '10px' }}>{error}</p>}
        {!loaded && <div style={{ fontSize: '12px', color: 'var(--c-888888)' }}>Se încarcă...</div>}
        {loaded && activeLocatii.length === 0 && (
          <div style={{ fontSize: '11px', color: 'var(--c-777777)' }}>Nu ai adăugat încă nicio proprietate Booking.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeLocatii.map(loc => {
            const facturi = docsFacturi.filter(d => d.cod_unitate_booking === loc.cod)
            const borderouri = docsBorderou.filter(d => d.cod_unitate_booking === loc.cod)
            const complet = facturi.length > 0 && borderouri.length > 0
            return (
              <div key={loc.id} style={{ background: 'var(--c-161616)', border: `1px solid ${complet ? 'rgba(74,222,128,.25)' : 'var(--c-222222)'}`, borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-eeeeee)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.denumire}</div>
                    <div style={{ fontSize: '10px', color: 'var(--c-777777)' }}>Cod: {loc.cod}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: complet ? 'var(--accent-mint)' : '#f97316', background: complet ? 'rgba(74,222,128,.1)' : 'rgba(251,146,60,.1)', border: `1px solid ${complet ? 'rgba(74,222,128,.3)' : 'rgba(251,146,60,.3)'}`, borderRadius: '999px', padding: '3px 8px' }}>
                      {facturi.length} factur{facturi.length===1?'ă':'i'} · {borderouri.length} borderou{borderouri.length===1?'':'ri'}
                    </span>
                    <button onClick={() => removeLocatie(loc)} title="Șterge locația" style={{ fontSize: '11px', color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
                {(facturi.length > 0 || borderouri.length > 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {[...facturi, ...borderouri].map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 9px', background: 'var(--c-0f0f0f)', borderRadius: '7px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--c-666666)', textTransform: 'uppercase', flexShrink: 0 }}>{docsFacturi.includes(doc) ? 'factură' : 'borderou'}</span>
                        <div style={{ flex: 1, minWidth: 0, fontSize: '11px', color: 'var(--c-cccccc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{docLabel(doc)}</div>
                        <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize: '11px', color: legibil(culoare), textDecoration: 'none', flexShrink: 0 }}>↓</a>
                        <button onClick={() => deleteDoc(doc)} style={{ fontSize: '10px', color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--c-1a1a1a)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-dddddd)', marginBottom: '4px' }}>Adaugă facturi sau borderouri Booking</div>
          <div style={{ fontSize: '10px', color: 'var(--c-777777)', marginBottom: '10px' }}>Un singur loc pentru ambele — AI-ul recunoaște ce e fiecare fișier și îl pune la proprietatea potrivită.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginBottom: '10px' }}>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="Link PDF Booking.com" style={{ fontSize: '12px', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', color: 'var(--c-dddddd)', outline: 'none' }}/>
            <button onClick={() => importLink()} disabled={uploadBusy || !link} style={{ padding: '9px 14px', border: 'none', borderRadius: '8px', background: culoare, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: uploadBusy || !link ? .5 : 1 }}>
              Import
            </button>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files) }}
            style={{
              border: `1.5px dashed ${drag ? culoare : 'var(--c-252525)'}`,
              borderRadius: '10px', padding: '18px',
              textAlign: 'center', cursor: 'pointer',
              background: drag ? tint(r, .04) : 'var(--c-0d0d0d)',
              transition: 'all .15s',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-666666)', marginBottom: '3px' }}>
              {uploadBusy ? 'Se încarcă...' : 'Adaugă fișiere'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--c-888888)' }}>PDF, JPG, PNG · drag & drop, click sau Cmd+V</div>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }}/>
        </div>

        {(facturiFaraLocatie.length > 0 || borderouFaraLocatie.length > 0) && (
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--c-1a1a1a)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-888888)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
              Nealocate unei proprietăți ({facturiFaraLocatie.length + borderouFaraLocatie.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {[...facturiFaraLocatie, ...borderouFaraLocatie].map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 9px', background: 'var(--c-161616)', borderRadius: '7px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--c-666666)', textTransform: 'uppercase', flexShrink: 0 }}>{facturiFaraLocatie.includes(doc) ? 'factură' : 'borderou'}</span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '11px', color: 'var(--c-cccccc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.cod_unitate_booking ? `Cod necunoscut: ${doc.cod_unitate_booking}` : 'Fără cod detectat'}>{docLabel(doc)}</div>
                  <span style={{ fontSize: '9px', color: 'var(--c-666666)', flexShrink: 0 }}>{doc.cod_unitate_booking ? `cod ${doc.cod_unitate_booking}` : 'fără cod'}</span>
                  <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize: '11px', color: legibil(culoare), textDecoration: 'none', flexShrink: 0 }}>↓</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
