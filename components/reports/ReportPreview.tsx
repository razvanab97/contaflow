'use client'
import { useRef, useState } from 'react'

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
}

const ZOOM_STEPS = [50, 75, 100, 125, 150]

// Previzualizare cu selectie de text: selectezi o bucata din document, apare un buton mic
// "Fa camp editabil" langa selectie - ii dai o eticheta si acea portiune (doar ea, restul
// paragrafului ramane neschimbat) devine un camp nou in editor, in plus fata de cele fixe.
function SelectableDocxPreview({ firmaId, html, culoare, onFieldCreated, zoom }: { firmaId: string; html: string; culoare: string; onFieldCreated: () => void; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
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
        className="docx-preview"
        onMouseUp={handleMouseUp}
        style={{
          background: '#ffffff', color: '#1a1a1a', borderRadius: '4px', padding: '32px 40px',
          fontSize: '14px', lineHeight: 1.6, userSelect: 'text',
          width: `${zoom}%`, maxWidth: '760px', margin: '0 auto',
          boxShadow: '0 1px 3px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.2)',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {sel && (
        <div style={{ position: 'absolute', left: sel.x, top: Math.max(0, sel.y - 38), transform: 'translateX(-50%)', zIndex: 20 }}>
          {!labeling ? (
            <button onClick={() => setLabeling(true)} style={{ fontSize: '11px', fontWeight: 600, padding: '6px 10px', borderRadius: '7px', border: 'none', background: culoare, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,.35)' }}>
              + Fă câmp editabil
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px', background: 'var(--c-161616)', padding: '6px', borderRadius: '8px', border: '1px solid var(--c-2a2a2a)', boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
              <input
                autoFocus value={label} onChange={e => setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salveaza(); if (e.key === 'Escape') { setSel(null); setLabeling(false) } }}
                placeholder="Etichetă (ex: Perioadă)" style={{ fontSize: '12px', width: '160px', color: 'var(--c-dddddd)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '5px 8px', outline: 'none' }}
              />
              <button onClick={salveaza} disabled={saving || !label.trim()} style={{ fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '6px', border: 'none', background: culoare, color: '#fff', cursor: 'pointer', opacity: saving ? .6 : 1, whiteSpace: 'nowrap' }}>
                {saving ? '...' : 'Salvează'}
              </button>
            </div>
          )}
          {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '4px', background: 'var(--c-161616)', padding: '4px 8px', borderRadius: '6px' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function ReportPreview({ loading, error, isPdf, html, firmaId, culoare, downloadUrl, onFieldCreated, fullscreen, onToggleFullscreen }: Props) {
  const [zoom, setZoom] = useState(100)
  const zoomIdx = ZOOM_STEPS.indexOf(zoom)

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: fullscreen ? '100%' : undefined }}>
      {/* Card header: zoom, pagina, fullscreen, download */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--c-1a1a1a)', flexShrink: 0 }}>
        <button onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIdx - 1)])} disabled={zoomIdx <= 0} title="Micșorează" style={{ width: '24px', height: '24px', background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', color: 'var(--c-999999)', cursor: 'pointer', fontSize: '13px', opacity: zoomIdx <= 0 ? .4 : 1 }}>−</button>
        <span style={{ fontSize: '11px', color: 'var(--c-888888)', minWidth: '36px', textAlign: 'center' }}>{zoom}%</span>
        <button onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1)])} disabled={zoomIdx >= ZOOM_STEPS.length - 1} title="Mărește" style={{ width: '24px', height: '24px', background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', color: 'var(--c-999999)', cursor: 'pointer', fontSize: '13px', opacity: zoomIdx >= ZOOM_STEPS.length - 1 ? .4 : 1 }}>+</button>
        <div style={{ flex: 1 }}/>
        {onToggleFullscreen && (
          <button onClick={onToggleFullscreen} title={fullscreen ? 'Ieși din ecran complet' : 'Ecran complet'} style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', color: 'var(--c-999999)', cursor: 'pointer' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              {fullscreen ? <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/> : <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>}
            </svg>
          </button>
        )}
        <a href={downloadUrl} title="Descarcă" style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', color: 'var(--c-999999)' }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </a>
      </div>

      {/* Zona "mat" din jurul paginii - fixa, ca sa arate ca o coala reala indiferent de tema */}
      <div style={{ flex: 1, background: '#1c1c1c', overflowY: 'auto', padding: '24px 20px' }}>
        {loading ? (
          <p style={{ fontSize: '12px', color: 'var(--c-666666)', textAlign: 'center' }}>Se randează previzualizarea...</p>
        ) : error ? (
          <p style={{ fontSize: '12px', color: 'var(--accent-red)', textAlign: 'center' }}>{error}</p>
        ) : isPdf ? (
          <iframe src={`${downloadUrl}&preview=1`} style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none', borderRadius: '4px', background: '#fff' }}/>
        ) : html != null ? (
          <SelectableDocxPreview firmaId={firmaId} html={html} culoare={culoare} onFieldCreated={onFieldCreated} zoom={zoom}/>
        ) : (
          <p style={{ fontSize: '12px', color: 'var(--c-666666)', textAlign: 'center' }}>Nu există încă un document de previzualizat.</p>
        )}
      </div>
    </div>
  )
}
