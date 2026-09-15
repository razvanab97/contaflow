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
  platit?: boolean | null
  data_platii?: string | null
  tranzactie_id?: string | null
}
interface ImportResult {
  duplicate: boolean
  skipped?: boolean
  skipReason?: string
  targetFirma: string | null
  source?: string | null
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
interface InboxSource {
  id: string
  provider: 'gmail' | 'icloud_imap' | 'oblio'
  eticheta: string
  email: string | null
  status: 'neconectat' | 'activ' | 'eroare' | 'pauzat'
  last_sync_at?: string | null
}
interface SyncJob {
  id: string
  source_id: string
  status: 'queued' | 'running' | 'done' | 'error'
  messages_checked?: number | null
  pdfs_found?: number | null
  imported_count?: number | null
  duplicate_count?: number | null
  skipped_count?: number | null
  since_date?: string | null
  error_message?: string | null
  result?: { imported?: ImportResult[]; since?: string; until?: string } | null
  created_at?: string | null
  updated_at?: string | null
}
interface GmailPreviewRow {
  id: string
  threadId?: string | null
  subject: string
  from: string
  date: string
  snippet?: string
  pdfs: { filename: string; size?: number | null }[]
}
interface GmailPreview {
  source: { id: string; eticheta: string; email?: string | null }
  sinceDate: string
  untilDate?: string | null
  messagesChecked: number
  pdfsFound: number
  messages: GmailPreviewRow[]
}

const SOURCES: { key:string; title:string; provider: InboxSource['provider']; desc:string; hint:string; placeholder:string }[] = [
  {
    key: 'gmail-1',
    title: 'Gmail 1',
    provider: 'gmail',
    desc: 'OAuth citire facturi și atașamente',
    hint: 'Salvăm contul aici; următorul pas tehnic este OAuth Google pentru citire automată.',
    placeholder: 'email@gmail.com',
  },
  {
    key: 'gmail-2',
    title: 'Gmail 2',
    provider: 'gmail',
    desc: 'Al doilea cont, separat pe aceleași reguli',
    hint: 'Se configurează separat, ca să putem ști din ce cont a venit factura.',
    placeholder: 'al-doilea-cont@gmail.com',
  },
  {
    key: 'icloud',
    title: 'iCloud Mail',
    provider: 'icloud_imap',
    desc: 'IMAP cu parolă de aplicație Apple',
    hint: 'În aplicație salvăm contul; parola de aplicație se pune server-side, nu se afișează în browser.',
    placeholder: 'nume@icloud.com',
  },
  {
    key: 'oblio',
    title: 'Oblio',
    provider: 'oblio',
    desc: 'API token pentru facturi și documente e-Factura disponibile în Oblio',
    hint: 'În aplicație salvăm contul Oblio; token-ul API se ține server-side.',
    placeholder: 'cont@oblio.eu',
  },
]

function isPreviewable(tip: string | null | undefined, nume: string) {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

function defaultSyncStart(workMonth: string) {
  const match = workMonth.match(/^(\d{4})-(\d{2})/)
  const base = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : new Date()
  const prev = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1))
  return prev.toISOString().slice(0, 10)
}

function todayIso() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

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
  const [sources, setSources] = useState<InboxSource[]>([])
  const [sourcesLoaded, setSourcesLoaded] = useState(false)
  const [editingSource, setEditingSource] = useState<string | null>(null)
  const [sourceEmail, setSourceEmail] = useState('')
  const [sourceSecret, setSourceSecret] = useState('')
  const [sourceBusy, setSourceBusy] = useState(false)
  const [sourceError, setSourceError] = useState('')
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([])
  const [syncStartDate, setSyncStartDate] = useState(() => defaultSyncStart(luna))
  const [syncEndDate, setSyncEndDate] = useState(() => todayIso())
  const [previewBusySourceId, setPreviewBusySourceId] = useState<string | null>(null)
  const [gmailPreview, setGmailPreview] = useState<GmailPreview | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [deleteBusy, setDeleteBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(firma.culoare)

  const load = useCallback(async () => {
    const res = await fetch(`/api/inbox-facturi?firmaId=${encodeURIComponent(firma.id)}&lunaId=${encodeURIComponent(lunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
    setLoaded(true)
  }, [firma.id, lunaId])

  useEffect(() => { load() }, [load])

  const loadSources = useCallback(async () => {
    const res = await fetch(`/api/inbox-facturi/surse?firmaId=${encodeURIComponent(firma.id)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setSources(data.sources || [])
    setSourcesLoaded(true)
  }, [firma.id])

  useEffect(() => { loadSources() }, [loadSources])

  const loadSyncJobs = useCallback(async () => {
    const res = await fetch(`/api/inbox-facturi/gmail/sync?firmaId=${encodeURIComponent(firma.id)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return
    const jobs: SyncJob[] = data.jobs || []
    setSyncJobs(jobs)
    const latestDone = jobs.find(job => job.status === 'done' && job.result?.imported)
    if (latestDone?.result?.imported) {
      setResults(latestDone.result.imported)
      const since = latestDone.since_date ? ` din ${new Date(latestDone.since_date).toLocaleDateString('ro-RO')}` : ''
      const until = latestDone.result?.until ? ` până la ${new Date(latestDone.result.until).toLocaleDateString('ro-RO')}` : ' până azi'
      setSyncMessage(`Ultimul Gmail: ${latestDone.messages_checked || 0} emailuri verificate${since}${until}, ${latestDone.pdfs_found || 0} PDF-uri găsite, ${latestDone.imported_count || 0} importate, ${latestDone.duplicate_count || 0} duplicate, ${latestDone.skipped_count || 0} sărite.`)
      await load()
      await loadSources()
    }
  }, [firma.id, load, loadSources])

  useEffect(() => { loadSyncJobs() }, [loadSyncJobs])

  useEffect(() => {
    if (!syncJobs.some(job => job.status === 'queued' || job.status === 'running')) return
    const id = window.setInterval(() => { loadSyncJobs() }, 5000)
    return () => window.clearInterval(id)
  }, [loadSyncJobs, syncJobs])

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

  async function deleteSelectedDocs() {
    const ids = [...selectedDocIds]
    if (!ids.length) return
    if (!confirm(`Ștergi ${ids.length} facturi selectate din Inbox Facturi?`)) return
    setDeleteBusy(true)
    setError('')
    const deletedIds = new Set<string>()
    for (const id of ids) {
      const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(id)}`, { method:'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Unele facturi nu au putut fi șterse')
        break
      }
      deletedIds.add(id)
    }
    setDocs(prev => prev.filter(doc => !deletedIds.has(doc.id)))
    setSelectedDocIds(prev => new Set([...prev].filter(id => !deletedIds.has(id))))
    setDeleteBusy(false)
  }

  function toggleSelectedDoc(id: string) {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllDocs() {
    setSelectedDocIds(prev => prev.size === docs.length ? new Set() : new Set(docs.map(doc => doc.id)))
  }

  async function togglePaid(doc: Doc) {
    const next = !doc.platit
    setDocs(prev => prev.map(item => item.id === doc.id ? { ...item, platit: next, data_platii: next ? todayIso() : null } : item))
    const res = await fetch('/api/chitante/plata', {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ id: doc.id, platit: next }),
    })
    if (!res.ok) {
      setDocs(prev => prev.map(item => item.id === doc.id ? doc : item))
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Statusul de plată nu a putut fi schimbat')
    }
  }

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function sourceFor(title: string) {
    return sources.find(source => source.eticheta === title)
  }

  function startEditSource(title: string) {
    const current = sourceFor(title)
    setEditingSource(title)
    setSourceEmail(current?.email || (title === 'Oblio' ? 'abhomesinvest@gmail.com' : ''))
    setSourceSecret('')
    setSourceError('')
  }

  async function saveSource(sourceDef: typeof SOURCES[number]) {
    setSourceBusy(true)
    setSourceError('')
    const res = await fetch('/api/inbox-facturi/surse', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        firmaId: firma.id,
        provider: sourceDef.provider,
        eticheta: sourceDef.title,
        email: sourceEmail,
        status: sourceEmail.trim() ? 'activ' : 'neconectat',
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSourceBusy(false)
    if (!res.ok) {
      setSourceError(data.error || 'Sursa nu a putut fi salvată')
      return
    }
    setSources(prev => {
      const next = prev.filter(source => source.id !== data.source.id && source.eticheta !== data.source.eticheta)
      return [...next, data.source]
    })
    setEditingSource(null)
    setSourceEmail('')
    setSourceSecret('')
  }

  async function connectOblio() {
    setSourceBusy(true)
    setSourceError('')
    const res = await fetch('/api/inbox-facturi/oblio/connect', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        firmaId: firma.id,
        email: sourceEmail,
        clientSecret: sourceSecret,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSourceBusy(false)
    if (!res.ok) {
      setSourceError(data.error || 'Oblio nu a putut fi conectat')
      return
    }
    setSources(prev => {
      const next = prev.filter(source => source.id !== data.source.id && source.eticheta !== data.source.eticheta)
      return [...next, data.source]
    })
    setEditingSource(null)
    setSourceEmail('')
    setSourceSecret('')
    setSyncMessage(`Oblio conectat. Firme găsite în cont: ${(data.companies || []).map((c: { company?: string; cif?: string }) => c.company || c.cif).filter(Boolean).join(', ') || 'niciuna listată'}.`)
  }

  function connectGmail(sourceDef: typeof SOURCES[number]) {
    const params = new URLSearchParams({
      firmaId: firma.id,
      eticheta: sourceDef.title,
      returnTo: window.location.pathname,
    })
    window.location.href = `/api/inbox-facturi/gmail/start?${params.toString()}`
  }

  async function syncGmail(source: InboxSource) {
    setSyncingSourceId(source.id)
    setError('')
    setSyncMessage('Sincronizarea Gmail a pornit în fundal. Poți pleca de pe pagină; când revii, statusul se actualizează de aici.')
    setResults([])
    const res = await fetch('/api/inbox-facturi/gmail/sync', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ sourceId: source.id, firmaId: firma.id, lunaId, luna, sinceDate: syncStartDate, untilDate: syncEndDate }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Sincronizarea Gmail a eșuat')
    } else {
      setSyncMessage(data.alreadyRunning ? 'Sincronizarea Gmail rulează deja în fundal.' : 'Sincronizarea Gmail rulează în fundal. Poți pleca de pe pagină.')
      await loadSyncJobs()
    }
    setSyncingSourceId(null)
  }

  async function previewGmail(source: InboxSource) {
    setPreviewBusySourceId(source.id)
    setError('')
    setSyncMessage('')
    setGmailPreview(null)
    const res = await fetch('/api/inbox-facturi/gmail/sync', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ sourceId: source.id, firmaId: firma.id, lunaId, luna, sinceDate: syncStartDate, untilDate: syncEndDate, preview: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Preview-ul Gmail a eșuat')
    else setGmailPreview(data)
    setPreviewBusySourceId(null)
  }

  function latestJobFor(sourceId: string | undefined) {
    if (!sourceId) return null
    return syncJobs.find(job => job.source_id === sourceId) || null
  }

  function jobText(job: SyncJob | null) {
    if (!job) return ''
    if (job.status === 'queued') return 'În coadă pentru sincronizare'
    if (job.status === 'running') return 'Sincronizare în fundal...'
    if (job.status === 'error') return `Eroare sync: ${job.error_message || 'verifică reconectarea'}`
    const since = job.since_date ? ` din ${new Date(job.since_date).toLocaleDateString('ro-RO')}` : ''
    const until = job.result?.until ? ` până la ${new Date(job.result.until).toLocaleDateString('ro-RO')}` : ''
    return `Ultimul sync${since}${until}: ${job.imported_count || 0} noi, ${job.duplicate_count || 0} duplicate, ${job.skipped_count || 0} sărite`
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:'10px' }}>
        {SOURCES.map(sourceDef => {
          const source = sourceFor(sourceDef.title)
          const active = source?.status === 'activ'
          const editing = editingSource === sourceDef.title
          const job = latestJobFor(source?.id)
          const jobRunning = job?.status === 'queued' || job?.status === 'running'
          return (
          <div key={sourceDef.key} style={{ background:'var(--c-111111)', border:`1px solid ${active ? 'rgba(74,222,128,.25)' : 'var(--c-222222)'}`, borderRadius:'12px', padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:700, color:'var(--c-eeeeee)', marginBottom:'4px' }}>{sourceDef.title}</div>
                <div style={{ fontSize:'11px', color:'var(--c-888888)', lineHeight:1.45 }}>{sourceDef.desc}</div>
              </div>
              <div style={{ flexShrink:0, display:'inline-flex', padding:'4px 8px', borderRadius:'999px', background:active?'rgba(74,222,128,.12)':'var(--c-171717)', color:active?'var(--accent-green)':'var(--c-777777)', fontSize:'10px', fontWeight:700 }}>
                {!sourcesLoaded ? '...' : active ? 'configurat' : 'neconectat'}
              </div>
            </div>
            {source?.email && <div style={{ marginTop:'9px', fontSize:'11px', color:'var(--c-aaaaaa)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{source.email}</div>}
            <div style={{ marginTop:'9px', fontSize:'10px', color:'var(--c-666666)', lineHeight:1.45 }}>{sourceDef.hint}</div>
            {source?.last_sync_at && <div style={{ marginTop:'5px', fontSize:'10px', color:'var(--c-666666)' }}>Ultima conectare: {new Date(source.last_sync_at).toLocaleString('ro-RO')}</div>}
            {job && <div style={{ marginTop:'5px', fontSize:'10px', color:job.status === 'error' ? 'var(--accent-red)' : jobRunning ? legibil(firma.culoare) : 'var(--c-666666)' }}>{jobText(job)}</div>}
            {editing ? (
              <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', gap:'8px' }}>
                <input value={sourceEmail} onChange={e => setSourceEmail(e.target.value)} placeholder={sourceDef.placeholder} style={{ fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'8px 10px', color:'var(--c-dddddd)', outline:'none' }}/>
                {sourceDef.provider === 'oblio' && <input type="password" value={sourceSecret} onChange={e => setSourceSecret(e.target.value)} placeholder="Token API din Oblio → Setări → Date Cont" style={{ fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'8px 10px', color:'var(--c-dddddd)', outline:'none' }}/>}
                <div style={{ display:'flex', gap:'7px' }}>
                  <button onClick={() => sourceDef.provider === 'oblio' ? connectOblio() : saveSource(sourceDef)} disabled={sourceBusy} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'7px', border:'none', background:firma.culoare, color:'var(--c-ffffff)', cursor:'pointer', opacity:sourceBusy?.6:1 }}>{sourceDef.provider === 'oblio' ? 'Testează și salvează' : 'Salvează'}</button>
                  <button onClick={() => { setEditingSource(null); setSourceSecret('') }} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'7px', border:'1px solid var(--c-2a2a2a)', background:'transparent', color:'var(--c-888888)', cursor:'pointer' }}>Anulează</button>
                </div>
                {sourceError && <div style={{ fontSize:'10px', color:'var(--accent-red)' }}>{sourceError}</div>}
              </div>
            ) : (
              <div style={{ marginTop:'10px', display:'flex', flexWrap:'wrap', gap:'7px' }}>
                {sourceDef.provider === 'gmail' && (
                  <button onClick={() => connectGmail(sourceDef)} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'7px', border:'none', background:firma.culoare, color:'var(--c-ffffff)', cursor:'pointer' }}>
                    {active ? 'Reconectează Google' : 'Conectează Google'}
                  </button>
                )}
                {sourceDef.provider === 'gmail' && source?.id && active && (
                  <button onClick={() => previewGmail(source)} disabled={previewBusySourceId === source.id} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'7px', border:'1px solid rgba(59,130,246,.35)', background:'rgba(59,130,246,.08)', color:'var(--accent-blue)', cursor:'pointer', opacity:previewBusySourceId === source.id ? .65 : 1 }}>
                    {previewBusySourceId === source.id ? 'Verifică...' : 'Preview'}
                  </button>
                )}
                {sourceDef.provider === 'gmail' && source?.id && active && (
                  <button onClick={() => syncGmail(source)} disabled={syncingSourceId === source.id || jobRunning} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'7px', border:'1px solid rgba(74,222,128,.35)', background:'rgba(74,222,128,.08)', color:'var(--accent-green)', cursor:'pointer', opacity:(syncingSourceId === source.id || jobRunning) ? .65 : 1 }}>
                    {jobRunning ? 'Rulează...' : syncingSourceId === source.id ? 'Pornește...' : 'Sincronizează'}
                  </button>
                )}
                <button onClick={() => startEditSource(sourceDef.title)} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'7px', border:`1px solid ${active ? 'rgba(74,222,128,.35)' : firma.culoare}`, background:'transparent', color:active?'var(--accent-green)':legibil(firma.culoare), cursor:'pointer' }}>
                  {active ? 'Configurează' : sourceDef.provider === 'gmail' ? 'Email manual' : 'Conectează'}
                </button>
              </div>
            )}
          </div>
        )})}
      </div>

      <div style={{ background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--c-1a1a1a)' }}>
          <div style={{ fontSize:'14px', fontWeight:700, color:'var(--c-ffffff)', marginBottom:'4px' }}>Inbox Facturi pentru {firma.nume}</div>
          <div style={{ fontSize:'12px', color:'var(--c-888888)', lineHeight:1.45 }}>
            Încarcă facturi primite pe email/Oblio. AI-ul detectează firma după CIF/nume, verifică duplicatele și salvează documentul la firma potrivită.
          </div>
          <div style={{ marginTop:'14px', display:'flex', flexWrap:'wrap', alignItems:'end', gap:'10px' }}>
            <label style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'10px', fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--c-777777)' }}>
              Sincronizează de la
              <input type="date" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} style={{ fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'8px 10px', color:'var(--c-dddddd)', outline:'none' }}/>
            </label>
            <label style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'10px', fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--c-777777)' }}>
              Până la
              <input type="date" value={syncEndDate} onChange={e => setSyncEndDate(e.target.value)} style={{ fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'8px 10px', color:'var(--c-dddddd)', outline:'none' }}/>
            </label>
            <div style={{ fontSize:'11px', color:'var(--c-777777)', lineHeight:1.45, paddingBottom:'8px' }}>
              Intervalul se aplică la butonul „Sincronizează” de pe Gmail 1/Gmail 2.
            </div>
          </div>
        </div>

        <div style={{ padding:'18px 22px' }}>
          {loaded && docs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginBottom:'16px' }}>
              <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'4px' }}>
                <button onClick={toggleAllDocs} style={{ fontSize:'11px', fontWeight:700, padding:'7px 10px', borderRadius:'8px', border:'1px solid var(--c-2a2a2a)', background:'transparent', color:'var(--c-aaaaaa)', cursor:'pointer' }}>
                  {selectedDocIds.size === docs.length ? 'Deselectează toate' : 'Selectează toate'}
                </button>
                {selectedDocIds.size > 0 && (
                  <button onClick={deleteSelectedDocs} disabled={deleteBusy} style={{ fontSize:'11px', fontWeight:800, padding:'7px 10px', borderRadius:'8px', border:'1px solid rgba(239,68,68,.35)', background:'rgba(239,68,68,.08)', color:'var(--accent-red)', cursor:'pointer', opacity:deleteBusy ? .65 : 1 }}>
                    Șterge selectate ({selectedDocIds.size})
                  </button>
                )}
              </div>
              {docs.map(doc => {
                const kind = isPreviewable(doc.fisier_tip, doc.fisier_nume)
                const open = previewIds.has(doc.id)
                const selected = selectedDocIds.has(doc.id)
                return (
                  <div key={doc.id}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--c-161616)', border:'1px solid var(--c-222222)', borderRadius:'9px' }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleSelectedDoc(doc.id)} style={{ width:15, height:15, accentColor:firma.culoare, cursor:'pointer' }}/>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:doc.platit ? 'var(--accent-green)' : firma.culoare, flexShrink:0 }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:700, color:'var(--c-dddddd)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</div>
                        <div style={{ fontSize:'10px', color:'var(--c-777777)', marginTop:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {[doc.numar_document && `nr. ${doc.numar_document}`, doc.suma != null && `${doc.suma.toFixed(2)}`, doc.data_document].filter(Boolean).join(' · ') || doc.furnizor || 'fără detalii extrase'}
                          {doc.tranzactie_id ? ' · legată de tranzacție' : ''}
                          {doc.platit ? ` · plătită${doc.data_platii ? ` ${doc.data_platii}` : ''}` : ' · neplătită'}
                        </div>
                      </div>
                      <button onClick={() => togglePaid(doc)} style={{ fontSize:'11px', fontWeight:700, padding:'6px 9px', borderRadius:'7px', border:`1px solid ${doc.platit ? 'rgba(74,222,128,.35)' : 'rgba(251,146,60,.35)'}`, background:doc.platit?'rgba(74,222,128,.08)':'rgba(251,146,60,.08)', color:doc.platit?'var(--accent-green)':legibil(firma.culoare), cursor:'pointer' }}>
                        {doc.platit ? 'Plătită' : 'Setează plătit'}
                      </button>
                      {kind && <button onClick={() => togglePreview(doc.id)} style={{ fontSize:'11px', fontWeight:600, color:open?'var(--c-dddddd)':'var(--accent-mint)', background:'transparent', border:'none', cursor:'pointer' }}>{open ? 'Ascunde' : 'Vezi'}</button>}
                      <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:700, color:legibil(firma.culoare), textDecoration:'none' }}>↓</a>
                      <button onClick={() => deleteDoc(doc)} style={{ fontSize:'11px', fontWeight:700, padding:'6px 9px', borderRadius:'7px', border:'1px solid rgba(239,68,68,.35)', background:'rgba(239,68,68,.06)', color:'var(--accent-red)', cursor:'pointer' }}>Șterge</button>
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

          {gmailPreview && (
            <div style={{ marginTop:'14px', padding:'12px', borderRadius:'10px', border:'1px solid rgba(59,130,246,.25)', background:'rgba(59,130,246,.06)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'8px' }}>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:800, color:'var(--c-dddddd)' }}>Preview {gmailPreview.source.eticheta}{gmailPreview.source.email ? ` · ${gmailPreview.source.email}` : ''}</div>
                  <div style={{ fontSize:'10px', color:'var(--c-888888)', marginTop:'3px' }}>
                    {gmailPreview.messagesChecked} emailuri verificate · {gmailPreview.pdfsFound} PDF-uri găsite · {gmailPreview.sinceDate}{gmailPreview.untilDate ? ` → ${gmailPreview.untilDate}` : ' → azi'}
                  </div>
                </div>
                <button onClick={() => {
                  const source = sources.find(item => item.id === gmailPreview.source.id)
                  if (source) syncGmail(source)
                }} style={{ fontSize:'11px', fontWeight:800, padding:'7px 10px', borderRadius:'8px', border:'1px solid rgba(74,222,128,.35)', background:'rgba(74,222,128,.08)', color:'var(--accent-green)', cursor:'pointer' }}>
                  Importă această listă
                </button>
              </div>
              {gmailPreview.messages.length === 0 ? (
                <div style={{ fontSize:'11px', color:'var(--c-888888)' }}>Nu s-au găsit emailuri cu PDF în intervalul ales.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'260px', overflow:'auto' }}>
                  {gmailPreview.messages.map(row => (
                    <div key={row.id} style={{ padding:'9px 10px', borderRadius:'8px', border:'1px solid rgba(59,130,246,.18)', background:'var(--c-111111)' }}>
                      <div style={{ fontSize:'11px', fontWeight:800, color:'var(--c-dddddd)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.subject}</div>
                      <div style={{ fontSize:'10px', color:'var(--c-777777)', marginTop:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {row.from || 'expeditor necunoscut'} · {row.date || 'dată necunoscută'} · {row.pdfs.length} PDF
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginTop:'6px' }}>
                        {row.pdfs.map((pdf, idx) => (
                          <span key={`${row.id}-${idx}`} style={{ fontSize:'10px', color:'var(--c-aaaaaa)', border:'1px solid var(--c-262626)', borderRadius:'999px', padding:'3px 7px', background:'var(--c-161616)' }}>
                            {pdf.filename}{pdf.size ? ` · ${Math.round(pdf.size / 1024)} KB` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop:'14px', display:'flex', flexDirection:'column', gap:'6px' }}>
              {syncMessage && <div style={{ padding:'9px 11px', borderRadius:'8px', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.2)', fontSize:'11px', color:'var(--c-aaaaaa)' }}>{syncMessage}</div>}
              {results.map((res, idx) => (
                <div key={idx} style={{ padding:'9px 11px', borderRadius:'8px', background:res.skipped?'rgba(148,163,184,.08)':res.duplicate?'rgba(251,146,60,.08)':'rgba(74,222,128,.08)', border:`1px solid ${res.skipped?'rgba(148,163,184,.22)':res.duplicate?'rgba(251,146,60,.25)':'rgba(74,222,128,.2)'}`, fontSize:'11px', color:'var(--c-aaaaaa)' }}>
                  {res.skipped ? 'Sărit' : res.duplicate ? 'Duplicat detectat' : 'Importat'} · {res.targetFirma || 'firmă necunoscută'} · {res.extracted?.incredereFirma || 'verifică'}{res.extracted?.furnizor ? ` · ${res.extracted.furnizor}` : ''}{res.skipReason ? ` · ${res.skipReason}` : ''}{res.source ? ` · ${res.source}` : ''}
                </div>
              ))}
            </div>
          )}
          {syncMessage && results.length === 0 && <div style={{ marginTop:'14px', padding:'9px 11px', borderRadius:'8px', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.2)', fontSize:'11px', color:'var(--c-aaaaaa)' }}>{syncMessage}</div>}
          {error && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'10px' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
