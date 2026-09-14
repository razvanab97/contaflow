'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import { legibil, tint } from '@/lib/colors'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Doc {
  id: string
  fisier_nume: string
  fisier_tip?: string | null
  furnizor?: string | null
  numar_document?: string | null
  suma?: number | null
  data_document?: string | null
}
interface ImportResult {
  duplicate: boolean
  targetFirma: string | null
  doc?: { id:string; fisier_nume:string }
  extracted?: {
    incredereFirma?: string
    furnizor?: string | null
    numarDocument?: string | null
    suma?: number | null
    moneda?: string | null
    dataDocument?: string | null
  } | null
}

function isPreviewable(tip: string | null | undefined, nume: string) {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default function InboxFacturiModule({ firma, lunaId, luna, tasks }: {
  firma: Firma
  lunaId: string
  luna: string
  tasks: TaskItem[]
}) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<ImportResult[]>([])
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(firma.culoare)

  const load = useCallback(async () => {
    const res = await fetch(`/api/inbox-facturi?firmaId=${encodeURIComponent(firma.id)}&lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
    setLoaded(true)
  }, [firma.id, lunaId])

  useEffect(() => { load() }, [load])

  async function upload(files: FileList) {
    if (!files.length) return
    setBusy(true)
    setError('')
    setResults([])
    const fd = new FormData()
    Array.from(files).forEach(file => fd.append('file', file))
    fd.append('firmaId', firma.id)
    fd.append('lunaId', lunaId)
    fd.append('luna', luna)
    const res = await fetch('/api/inbox-facturi', { method:'POST', body:fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Facturile nu au putut fi importate')
    else setResults(data.imported || [])
    await load()
    setBusy(false)
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Ștergi „${doc.fisier_nume}" din Inbox Facturi?`)) return
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== doc.id))
    else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Documentul nu a putut fi șters')
    }
  }

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:'10px' }}>
        {[
          ['Gmail 1', 'OAuth citire facturi și atașamente'],
          ['Gmail 2', 'Al doilea cont, separat pe aceleași reguli'],
          ['iCloud Mail', 'IMAP cu parolă de aplicație Apple'],
          ['Oblio', 'API token pentru facturi și documente e-Factura disponibile în Oblio'],
        ].map(([title, desc]) => (
          <div key={title} style={{ background:'var(--c-111111)', border:'1px solid var(--c-222222)', borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ fontSize:'13px', fontWeight:700, color:'var(--c-eeeeee)', marginBottom:'4px' }}>{title}</div>
            <div style={{ fontSize:'11px', color:'var(--c-888888)', lineHeight:1.45 }}>{desc}</div>
            <div style={{ marginTop:'10px', display:'inline-flex', padding:'4px 8px', borderRadius:'999px', background:'var(--c-171717)', color:'var(--c-777777)', fontSize:'10px', fontWeight:700 }}>
              pregătit pentru conectare
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--c-1a1a1a)' }}>
          <div style={{ fontSize:'14px', fontWeight:700, color:'var(--c-ffffff)', marginBottom:'4px' }}>Inbox Facturi pentru {firma.nume}</div>
          <div style={{ fontSize:'12px', color:'var(--c-888888)', lineHeight:1.45 }}>
            Încarcă facturi primite pe email/Oblio. AI-ul detectează firma după CIF/nume, verifică duplicatele și salvează documentul la firma potrivită.
          </div>
        </div>

        <div style={{ padding:'18px 22px' }}>
          {loaded && docs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginBottom:'16px' }}>
              {docs.map(doc => {
                const kind = isPreviewable(doc.fisier_tip, doc.fisier_nume)
                const open = previewIds.has(doc.id)
                return (
                  <div key={doc.id}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--c-161616)', border:'1px solid var(--c-222222)', borderRadius:'9px' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:firma.culoare, flexShrink:0 }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:700, color:'var(--c-dddddd)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</div>
                        <div style={{ fontSize:'10px', color:'var(--c-777777)', marginTop:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {[doc.numar_document && `nr. ${doc.numar_document}`, doc.suma != null && `${doc.suma.toFixed(2)}`, doc.data_document].filter(Boolean).join(' · ') || doc.furnizor || 'fără detalii extrase'}
                        </div>
                      </div>
                      {kind && <button onClick={() => togglePreview(doc.id)} style={{ fontSize:'11px', fontWeight:600, color:open?'var(--c-dddddd)':'var(--accent-mint)', background:'transparent', border:'none', cursor:'pointer' }}>{open ? 'Ascunde' : 'Vezi'}</button>}
                      <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:700, color:legibil(firma.culoare), textDecoration:'none' }}>↓</a>
                      <button onClick={() => deleteDoc(doc)} style={{ fontSize:'10px', color:'var(--accent-red)', background:'transparent', border:'none', cursor:'pointer' }}>×</button>
                    </div>
                    {open && kind === 'pdf' && <iframe src={`/api/chitante/document?id=${encodeURIComponent(doc.id)}&preview=1`} style={{ width:'100%', height:'65vh', border:'1px solid var(--c-262626)', borderRadius:'8px', marginTop:'6px', background:'var(--c-ffffff)' }} />}
                    {open && kind === 'image' && <img src={`/api/chitante/document?id=${encodeURIComponent(doc.id)}&preview=1`} alt={doc.fisier_nume} style={{ width:'100%', maxHeight:'65vh', objectFit:'contain', border:'1px solid var(--c-262626)', borderRadius:'8px', marginTop:'6px', background:'var(--c-ffffff)' }} />}
                  </div>
                )
              })}
            </div>
          )}
          {!loaded && <div style={{ fontSize:'12px', color:'var(--c-888888)', marginBottom:'12px' }}>Se încarcă...</div>}

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
            style={{
              border:`1.5px dashed ${drag ? firma.culoare : 'var(--c-252525)'}`,
              borderRadius:'12px',
              padding:'26px',
              textAlign:'center',
              cursor:'pointer',
              background:drag ? tint(r,.06) : 'var(--c-0d0d0d)',
              transition:'all .15s',
            }}
          >
            <div style={{ fontSize:'22px', color:firma.culoare, lineHeight:1, marginBottom:'8px' }}>+</div>
            <div style={{ fontSize:'13px', fontWeight:700, color:'var(--c-777777)', marginBottom:'4px' }}>{busy ? 'Se analizează și se repartizează...' : 'Adaugă facturi din email / Oblio'}</div>
            <div style={{ fontSize:'11px', color:'var(--c-888888)' }}>Poți selecta mai multe PDF/JPG/PNG deodată</div>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => { if (e.target.files) upload(e.target.files); e.target.value='' }}/>

          {results.length > 0 && (
            <div style={{ marginTop:'14px', display:'flex', flexDirection:'column', gap:'6px' }}>
              {results.map((res, idx) => (
                <div key={idx} style={{ padding:'9px 11px', borderRadius:'8px', background:res.duplicate?'rgba(251,146,60,.08)':'rgba(74,222,128,.08)', border:`1px solid ${res.duplicate?'rgba(251,146,60,.25)':'rgba(74,222,128,.2)'}`, fontSize:'11px', color:'var(--c-aaaaaa)' }}>
                  {res.duplicate ? 'Duplicat detectat' : 'Importat'} · {res.targetFirma || 'firmă necunoscută'} · {res.extracted?.incredereFirma || 'verifică'}{res.extracted?.furnizor ? ` · ${res.extracted.furnizor}` : ''}
                </div>
              ))}
            </div>
          )}
          {error && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'10px' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
