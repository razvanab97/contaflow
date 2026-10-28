'use client'
import { useEffect, useRef, useState } from 'react'
import { REPORT_PAGE_CSS } from '@/lib/documentWorkspace/reportPresentation'
import Icon from '@/components/ui/Icon'
import css from './Report.module.css'

interface Props {
  loading: boolean
  error: string
  isPdf: boolean
  html: string | null
  firmaId: string
  culoare: string
  downloadUrl: string
  onFieldCreated: () => void
  fullscreen?: boolean
  onToggleFullscreen?: () => void
  onDownload: () => void
  downloading: boolean
  onInlineChange?: (key: string, value: string, line?: number) => void
  onFieldFocus?: (key: string) => void
  activeField?: string
}

const ZOOM_STEPS = [50, 75, 100, 125, 150]

// Previzualizare cu selectie de text: selectezi o bucata din document, apare un buton mic
// "Fa camp editabil" langa selectie - ii dai o eticheta si acea portiune (doar ea, restul
// paragrafului ramane neschimbat) devine un camp nou in editor, in plus fata de cele fixe.
function SelectableDocxPreview({ firmaId, html, culoare, onFieldCreated, zoom, onInlineChange, onFieldFocus, activeField }: { firmaId: string; html: string; culoare: string; onFieldCreated: () => void; zoom: number; onInlineChange?: Props['onInlineChange']; onFieldFocus?: Props['onFieldFocus']; activeField?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const htmlRef = useRef(html)
  htmlRef.current = html
  useEffect(() => {
    const container = containerRef.current
    if (container && !container.contains(document.activeElement)) container.innerHTML = html
  }, [html])
  // Evidentierea campului activ se reaplica la fiecare redesenare; derularea la el doar cand se schimba campul.
  useEffect(() => {
    containerRef.current?.querySelectorAll<HTMLElement>('[data-report-field]').forEach(field => field.classList.toggle('report-field-active', field.dataset.reportField === activeField))
  }, [activeField, html])
  useEffect(() => {
    if (containerRef.current?.contains(document.activeElement)) return
    containerRef.current?.querySelector<HTMLElement>(`[data-report-field="${CSS.escape(activeField || '')}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeField])
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null)
  const [labeling, setLabeling] = useState(false)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleMouseUp() {
    const selection = window.getSelection()
    const container = containerRef.current
    if (!selection || selection.isCollapsed || !container) return
    const text = selection.toString().trim()
    const anchorNode = selection.anchorNode
    if (anchorNode?.parentElement?.closest('[contenteditable="true"]')) return
    if (!text || !anchorNode || !container.contains(anchorNode)) return
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setSel({ text, x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top })
    setLabeling(false); setError('')
  }

  async function salveaza() {
    if (!sel || !label.trim()) return
    setSaving(true); setError('')
    const res = await fetch('/api/proiect-documente/campuri-custom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, selectedText: sel.text, eticheta: label.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'Nu am putut crea câmpul'); setSaving(false); return }
    window.getSelection()?.removeAllRanges()
    setSel(null); setLabeling(false); setLabel(''); setSaving(false)
    onFieldCreated()
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        className="report-page"
        onMouseUp={handleMouseUp}
        onFocus={event => {
          const field = (event.target as HTMLElement).closest<HTMLElement>('[data-report-field]')
          if (field?.dataset.reportField) onFieldFocus?.(field.dataset.reportField)
        }}
        onInput={event => {
          const field = (event.target as HTMLElement).closest<HTMLElement>('[data-report-field]')
          if (field?.dataset.reportField) onInlineChange?.(field.dataset.reportField, field.innerText.replace(/\r/g, ''), field.dataset.reportLine === undefined ? undefined : Number(field.dataset.reportLine))
        }}
        onBlur={event => {
          const container = containerRef.current
          if (container && !container.contains(event.relatedTarget as Node | null)) container.innerHTML = htmlRef.current
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.target as HTMLElement).dataset.reportField !== undefined && !(event.target as HTMLElement).dataset.reportField?.endsWith(':content')) event.preventDefault()
        }}
        onPaste={event => {
          const field = (event.target as HTMLElement).closest('[contenteditable="true"]')
          if (!field) return
          event.preventDefault()
          const selection = window.getSelection()
          if (!selection?.rangeCount) return
          const range = selection.getRangeAt(0)
          if (!field.contains(range.commonAncestorContainer)) return
          range.deleteContents()
          const text = document.createTextNode(event.clipboardData.getData('text/plain'))
          range.insertNode(text)
          range.setStartAfter(text); range.collapse(true)
          selection.removeAllRanges(); selection.addRange(range)
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }}
        style={{
          borderRadius: 'var(--r-sm)', userSelect: 'text',
          zoom: zoom / 100, margin: '0 auto',
          boxShadow: '0 1px 2px rgba(16,24,40,.08), 0 18px 40px -18px rgba(16,24,40,.35)',
        }}
      />
      {sel && (
        <div style={{ position: 'absolute', left: sel.x, top: Math.max(0, sel.y - 38), transform: 'translateX(-50%)', zIndex: 20 }}>
          {!labeling ? (
            <button onClick={() => setLabeling(true)} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '6px 10px', borderRadius: 'var(--r-sm)', border: 'none', background:'var(--accent-solid)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,.35)' }}>
              + Fă câmp editabil
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px', background: 'var(--surface)', padding: '6px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
              <input
                autoFocus value={label} onChange={e => setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salveaza(); if (e.key === 'Escape') { setSel(null); setLabeling(false) } }}
                placeholder="Etichetă (ex: Perioadă)" style={{ fontSize: 'var(--fs-sm)', width: '160px', color: 'var(--text-primary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 8px', outline: 'none' }}
              />
              <button onClick={salveaza} disabled={saving || !label.trim()} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-sm)', border: 'none', background:'var(--accent-solid)', color: '#fff', cursor: 'pointer', opacity: saving ? .6 : 1, whiteSpace: 'nowrap' }}>
                {saving ? '...' : 'Salvează'}
              </button>
            </div>
          )}
          {error && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', marginTop: '4px', background: 'var(--surface)', padding: '4px 8px', borderRadius: 'var(--r-sm)' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function ReportPreview({ loading, error, isPdf, html, firmaId, culoare, downloadUrl, onFieldCreated, fullscreen, onToggleFullscreen, onDownload, downloading, onInlineChange, onFieldFocus, activeField }: Props) {
  const [zoom, setZoom] = useState(100)
  const [fitZoom, setFitZoom] = useState(100)
  const [fit, setFit] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomIdx = ZOOM_STEPS.indexOf(zoom)
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => setFitZoom(Math.min(100, Math.max(25, (viewport.clientWidth - 40) / 794 * 100))))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={css.preview} style={{ height: fullscreen ? '100%' : undefined }}>
      <style>{REPORT_PAGE_CSS}</style>
      <style>{`.report-page [contenteditable="true"] { cursor: text; border-radius: 3px; outline: 1px dashed #b6d7cb; min-width: 12px; display: inline-block; transition: background-color .15s; } .report-page [contenteditable="true"]:hover { background: #f1faf6; } .report-page [contenteditable="true"]:focus, .report-page .report-field-active { outline: 2px solid #059669; background: #eaf8f1; } .report-page [contenteditable="true"]:empty::before { content: 'Completează…'; color: #888; }`}</style>
      <div className={css.bar}>
        <div className={css.seg}>
          <button type="button" className={css.segBtn} onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIdx - 1)])} disabled={zoomIdx <= 0} title="Micșorează" aria-label="Micșorează">−</button>
          <span className={css.zoom}>{Math.round(fit ? fitZoom * zoom / 100 : zoom)}%</span>
          <button type="button" className={css.segBtn} onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1)])} disabled={zoomIdx >= ZOOM_STEPS.length - 1} title="Mărește" aria-label="Mărește">+</button>
          <button type="button" className={css.segBtn} onClick={() => { setFit(f => !f); setZoom(100) }}>{fit ? 'Mărime reală' : 'Încadrează'}</button>
        </div>
        <div style={{ flex: 1 }}/>
        {onToggleFullscreen && (
          <button type="button" className={css.barBtn} onClick={onToggleFullscreen} title={fullscreen ? 'Ieși din ecran complet' : 'Ecran complet'} aria-label={fullscreen ? 'Ieși din ecran complet' : 'Ecran complet'}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              {fullscreen ? <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/> : <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>}
            </svg>
          </button>
        )}
        <button type="button" className={css.barBtn} onClick={onDownload} disabled={downloading || loading || !!error || (!isPdf && html == null)} title="Salvează PDF din previzualizare">
          <Icon name="download" size={13} />{downloading ? 'Se pregătește…' : 'Salvează PDF'}
        </button>
      </div>

      <div ref={viewportRef} className={css.mat} style={{ maxHeight: fullscreen ? undefined : 'calc(100vh - 240px)' }}>
        {loading && html == null ? (
          <p className={css.msg}>Se randează previzualizarea…</p>
        ) : error ? (
          <p className={css.msg} style={{ color: 'var(--danger)' }}>{error}</p>
        ) : isPdf ? (
          <iframe src={`${downloadUrl}&preview=1`} style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none', borderRadius: 'var(--r-sm)', background: '#fff' }}/>
        ) : html != null ? (
          <SelectableDocxPreview firmaId={firmaId} html={html} culoare={culoare} onFieldCreated={onFieldCreated} zoom={fit ? fitZoom * zoom / 100 : zoom} onInlineChange={onInlineChange} onFieldFocus={onFieldFocus} activeField={activeField}/>
        ) : (
          <p className={css.msg}>Nu există încă un document de previzualizat.</p>
        )}
      </div>
    </div>
  )
}
