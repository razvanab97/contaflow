'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import TaskSection, { TaskItem } from '../../app/(app)/[firma]/[luna]/modules/TaskSection'
import type { DocumentTemplate, ListItem } from '@/lib/documentWorkspace/types'
import { parseMultilineToItems, itemsToMultiline } from '@/lib/documentWorkspace/types'
import ReportHeader from './ReportHeader'
import ReportTabs, { ReportTab } from './ReportTabs'
import ReportPreview from './ReportPreview'
import ReportEditor, { CampCustom } from './ReportEditor'
import ReportHistory from './ReportHistory'
import ReportFiles from './ReportFiles'
import { SaveStatus } from './ReportAutosaveStatus'
import { printReport } from '@/lib/documentWorkspace/reportPresentation'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface ProiectDoc { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; updated_at: string }

const SECTIUNE = 'raport_lunar'
const AUTOSAVE_DELAY = 800

interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  luna: string
  lunaLabel: string
  modulSlug: string
  template: DocumentTemplate
}

// Orchestrator generic de "document workspace" - nu contine nimic specific documentului
// (raport lunar AB Textile); primeste `template` din afara si il randeaza. Un document viitor
// (raport trimestrial, cerere etc.) ar refolosi acelasi component cu alt DocumentTemplate.
export default function ReportWorkspace({ firma, lunaId, tasks, luna, lunaLabel, modulSlug, template }: Props) {
  const [tab, setTab] = useState<ReportTab>('editare')
  const [isNarrow, setIsNarrow] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const [doc, setDoc] = useState<ProiectDoc | null>(null)
  const [docLoading, setDocLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [sablonConfigurat, setSablonConfigurat] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [configureError, setConfigureError] = useState('')

  const [values, setValues] = useState<Record<string, string | ListItem[]>>({ perioada: '', autorizatii: [], obiective: [], activitati: [] })
  const [custom, setCustom] = useState<CampCustom[]>([])

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewIsPdf, setPreviewIsPdf] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null)
  const customTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const customSaves = useRef<Record<string, () => Promise<void>>>({})
  const activeCustomSaves = useRef(new Set<Promise<void>>())
  const saveQueue = useRef<Promise<ProiectDoc | null>>(Promise.resolve(null))
  const docRef = useRef<ProiectDoc | null>(null)
  const saveFailed = useRef(false)
  const previewRequest = useRef(0)
  const valuesRef = useRef(values)
  valuesRef.current = values

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    setIsNarrow(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const loadPreview = useCallback(async (docId: string) => {
    const request = ++previewRequest.current
    setPreviewLoading(true); setPreviewError('')
    try {
      const res = await fetch(`/api/proiect-documente/preview?id=${docId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (request !== previewRequest.current) return
      if (!res.ok) setPreviewError(data.error || 'Previzualizarea a eșuat')
      else if (data.pdf) { setPreviewIsPdf(true); setPreviewHtml(null) }
      else { setPreviewHtml(data.html || ''); setPreviewIsPdf(false) }
      setPreviewLoading(false)
    } catch {
      if (request === previewRequest.current) { setPreviewError('Previzualizarea nu a putut fi încărcată.'); setPreviewLoading(false) }
    }
  }, [])

  const loadAll = useCallback(async () => {
    setDocLoading(true)
    const [docData, campuriData, customData] = await Promise.all([
      fetch(`/api/proiect-documente?firmaId=${encodeURIComponent(firma.id)}&sectiune=${SECTIUNE}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/proiect-documente/campuri?firmaId=${encodeURIComponent(firma.id)}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/proiect-documente/campuri-custom?firmaId=${encodeURIComponent(firma.id)}`).then(r => r.json()).catch(() => ({})),
    ])
    const newDoc: ProiectDoc | null = docData.doc || null
    docRef.current = newDoc
    setDoc(newDoc)
    setSablonConfigurat(!!campuriData.sablonConfigurat)
    if (campuriData.campuri) {
      setValues({
        perioada: campuriData.campuri.perioada || '',
        autorizatii: parseMultilineToItems(campuriData.campuri.autorizatii || ''),
        obiective: parseMultilineToItems(campuriData.campuri.obiective || ''),
        activitati: parseMultilineToItems(campuriData.campuri.activitati || ''),
      })
    }
    setCustom(customData.campuri || [])
    setDocLoading(false)
    if (newDoc) loadPreview(newDoc.id)
  }, [firma.id, loadPreview])

  useEffect(() => { loadAll() }, [loadAll])

  function doSave(v: typeof values): Promise<ProiectDoc | null> {
    const next = saveQueue.current.then(() => saveValues(v))
    saveQueue.current = next
    return next
  }

  async function saveValues(v: typeof values): Promise<ProiectDoc | null> {
    if (!sablonConfigurat) { setSaveStatus('idle'); return doc }
    setSaveStatus('saving')
    try {
      const body = {
        firmaId: firma.id,
        perioada: typeof v.perioada === 'string' ? v.perioada : '',
        autorizatii: itemsToMultiline(Array.isArray(v.autorizatii) ? v.autorizatii : []),
        obiective: itemsToMultiline(Array.isArray(v.obiective) ? v.obiective : []),
        activitati: itemsToMultiline(Array.isArray(v.activitati) ? v.activitati : []),
      }
      const res = await fetch('/api/proiect-documente/genereaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { saveFailed.current = true; setSaveStatus('error'); return null }
      saveFailed.current = false
      docRef.current = data.doc
      setDoc(data.doc)
      setSaveStatus('saved'); setSavedAt(new Date())
      loadPreview(data.doc.id)
      return data.doc
    } catch {
      saveFailed.current = true
      setSaveStatus('error')
      return null
    }
  }

  function scheduleSave(nextValues: typeof values) {
    setSaveStatus('saving')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const run = async () => { await doSave(nextValues) }
    pendingSaveRef.current = run
    debounceRef.current = setTimeout(async () => { pendingSaveRef.current = null; await run() }, AUTOSAVE_DELAY)
  }

  function flushPendingSave(): Promise<void> {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    const fn = pendingSaveRef.current
    pendingSaveRef.current = null
    return fn ? fn() : Promise.resolve()
  }

  // Salveaza draft-ul curent la parasirea paginii / schimbarea lunii, ca sa nu se piarda date.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingSaveRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      flushPendingSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFieldChange(key: string, value: string | ListItem[]) {
    setValues(prev => {
      const next = { ...prev, [key]: value }
      scheduleSave(next)
      return next
    })
  }

  async function handleGenerateClick() {
    setGenerating(true)
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    pendingSaveRef.current = null
    await doSave(valuesRef.current)
    setGenerating(false)
  }

  async function handleConfigure() {
    setConfiguring(true); setConfigureError('')
    const res = await fetch('/api/proiect-documente/configureaza-sablon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setConfigureError(data.error || 'Configurarea a eșuat')
    else {
      setSablonConfigurat(true)
      setValues({
        perioada: data.campuri.perioada || '',
        autorizatii: parseMultilineToItems(data.campuri.autorizatii || ''),
        obiective: parseMultilineToItems(data.campuri.obiective || ''),
        activitati: parseMultilineToItems(data.campuri.activitati || ''),
      })
    }
    setConfiguring(false)
  }

  function handleCustomChange(id: string, valoare: string) {
    setCustom(prev => prev.map(c => c.id === id ? { ...c, valoare } : c))
    setSaveStatus('saving')
    if (customTimers.current[id]) clearTimeout(customTimers.current[id])
    const run = async () => {
      const res = await fetch('/api/proiect-documente/campuri-custom', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, id, valoare }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveStatus('error'); throw new Error(data.error || 'Câmpul nu a putut fi salvat.') }
      if (customSaves.current[id] === run) delete customSaves.current[id]
      setSaveStatus('saved'); setSavedAt(new Date())
      if (data.doc) { docRef.current = data.doc; setDoc(data.doc); loadPreview(data.doc.id) }
    }
    customSaves.current[id] = run
    customTimers.current[id] = setTimeout(() => {
      const job = run()
      activeCustomSaves.current.add(job)
      job.catch(() => setSaveStatus('error')).finally(() => activeCustomSaves.current.delete(job))
    }, AUTOSAVE_DELAY)
  }

  async function handleExport() {
    if (!doc) return
    setExporting(true); setExportError('')
    try {
      for (const timer of Object.values(customTimers.current)) clearTimeout(timer)
      await Promise.all([...activeCustomSaves.current])
      await Promise.all(Object.values(customSaves.current).map(run => run()))
      await flushPendingSave()
      await saveQueue.current
      const currentDoc = docRef.current
      if (saveFailed.current || !currentDoc) throw new Error('Salvarea a eșuat. Reîncearcă înainte de export.')
      const res = await fetch(`/api/proiect-documente/preview?id=${currentDoc.id}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Exportul nu a putut fi pregătit.')
      if (data.pdf) {
        window.location.assign(`/api/proiect-documente/download?id=${currentDoc.id}`)
      } else {
        await printReport(data.html, currentDoc.fisier_nume)
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Exportul PDF a eșuat.')
    } finally { setExporting(false) }
  }

  async function handleCustomLabelChange(id: string, eticheta: string) {
    setCustom(prev => prev.map(c => c.id === id ? { ...c, eticheta } : c))
    await fetch('/api/proiect-documente/campuri-custom', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, id, eticheta }) })
  }

  async function handleCustomDelete(id: string, eticheta: string) {
    if (!confirm(`Ștergi câmpul "${eticheta}"? Textul rămâne fix, cu valoarea de acum — nu va mai fi editabil aici.`)) return
    setCustom(prev => prev.filter(c => c.id !== id))
    const res = await fetch('/api/proiect-documente/campuri-custom', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, id }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.doc) { docRef.current = data.doc; setDoc(data.doc); loadPreview(data.doc.id) }
    else loadAll()
  }

  async function handleUpload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('firmaId', firma.id); fd.append('sectiune', SECTIUNE)
    const res = await fetch('/api/proiect-documente', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { docRef.current = data.doc; setDoc(data.doc); loadPreview(data.doc.id) }
    setUploading(false)
  }

  async function handleRemoveDoc() {
    if (!doc || !confirm('Ștergi documentul curent? Va trebui reîncărcat de la zero.')) return
    docRef.current = null; setDoc(null); setPreviewHtml(null)
    await fetch(`/api/proiect-documente?firmaId=${encodeURIComponent(firma.id)}&sectiune=${SECTIUNE}`, { method: 'DELETE' })
  }

  const previewNode = (
    <ReportPreview
      loading={previewLoading} error={previewError} isPdf={previewIsPdf} html={previewHtml}
      firmaId={firma.id} culoare={firma.culoare}
      downloadUrl={doc ? `/api/proiect-documente/download?id=${doc.id}` : '#'}
      onFieldCreated={loadAll}
      fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)}
      onDownload={handleExport} downloading={exporting}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReportHeader
        firmaNume={firma.nume} firmaSlug={firma.slug} luna={luna} lunaLabel={lunaLabel} modulSlug={modulSlug}
        title={template.title} saveStatus={saveStatus} savedAt={savedAt}
        onBeforeNavigate={() => { flushPendingSave() }}
      />

      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--c-777777)', fontSize: 'var(--fs-sm)', margin: 0 }}>Editează câmpurile și urmărește raportul. Modificările se salvează automat.</p>
        <button onClick={handleExport} disabled={!doc || exporting || docLoading} style={{ padding: '10px 16px', background: 'var(--accent-solid)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', cursor: 'pointer', fontWeight: 600, opacity: !doc || exporting ? .6 : 1 }}>
          {exporting ? 'Se pregătește PDF-ul...' : 'Salvează PDF'}
        </button>
      </div>

      <ReportTabs active={tab} onChange={setTab}/>
      {exportError && <p role="alert" style={{ color: 'var(--danger)' }}>{exportError}</p>}

      {docLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ height: '200px', borderRadius: 'var(--r-lg)', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }}/>
          <div style={{ height: '120px', borderRadius: 'var(--r-lg)', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)' }}/>
        </div>
      ) : !doc ? (
        <ReportFiles doc={doc} culoare={firma.culoare} uploading={uploading} onUpload={handleUpload} onRemove={handleRemoveDoc}/>
      ) : tab === 'editare' ? (
        isNarrow ? (
          <div style={{ display: 'grid', gap: '16px' }}>
          <details style={{ border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '12px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '10px' }}>Vezi raportul</summary>
            {previewNode}
          </details>
          <fieldset disabled={exporting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <ReportEditor
            template={template} sablonConfigurat={sablonConfigurat} configuring={configuring} onConfigure={handleConfigure}
            values={values} onFieldChange={handleFieldChange}
            custom={custom} onCustomChange={handleCustomChange} onCustomLabelChange={handleCustomLabelChange} onCustomDelete={handleCustomDelete}
            onGenerate={handleGenerateClick} generating={generating} configureError={configureError}
          />
          </fieldset>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '22px', alignItems: 'start' }}>
            <div style={{ position: 'sticky', top: '20px', minWidth: 0 }}>{previewNode}</div>
            <fieldset disabled={exporting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <ReportEditor
              template={template} sablonConfigurat={sablonConfigurat} configuring={configuring} onConfigure={handleConfigure}
              values={values} onFieldChange={handleFieldChange}
              custom={custom} onCustomChange={handleCustomChange} onCustomLabelChange={handleCustomLabelChange} onCustomDelete={handleCustomDelete}
              onGenerate={handleGenerateClick} generating={generating} configureError={configureError}
            />
            </fieldset>
          </div>
        )
      ) : tab === 'previzualizare' ? (
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>{previewNode}</div>
      ) : tab === 'istoric' ? (
        <ReportHistory updatedAt={doc.updated_at} fisierNume={doc.fisier_nume}/>
      ) : (
        <ReportFiles doc={doc} culoare={firma.culoare} uploading={uploading} onUpload={handleUpload} onRemove={handleRemoveDoc}/>
      )}

      {fullscreen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '820px', height: '92vh' }}>{previewNode}</div>
        </div>
      )}
    </div>
  )
}
