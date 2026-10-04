'use client'
import { useCallback, useEffect, useState } from 'react'
import { linkDocument } from '@/lib/vizualizare'
import Icon from './Icon'

interface Stare { url: string; nume: string | null; link: { url: string; nume: string; tip: string } | null; eroare: string | null; incarcat: boolean }

// Vizualizator pop-up global pentru orice document (factura, bon, extras, aviz, model, buletin...).
// Se deschide cu deschideDocument(url, nume) din lib/vizualizare.ts. Fisierul se incarca direct din
// storage printr-un link semnat (rapid), cu Descarca / Tab nou, inchidere cu Esc sau click in afara.
export default function DocViewer() {
  const [s, setS] = useState<Stare | null>(null)

  const inchide = useCallback(() => setS(null), [])

  useEffect(() => {
    const deschide = (e: Event) => {
      const { url, nume } = (e as CustomEvent).detail || {}
      if (!url) return
      setS({ url, nume, link: null, eroare: null, incarcat: false })
      linkDocument(url).then(link => {
        setS(prev => (prev && prev.url === url ? { ...prev, link, eroare: link ? null : 'Documentul nu a putut fi deschis.' } : prev))
      })
    }
    window.addEventListener('cf:vezi', deschide)
    return () => window.removeEventListener('cf:vezi', deschide)
  }, [])

  useEffect(() => {
    if (!s) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') inchide() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [s, inchide])

  // Unele browsere nu anunta onLoad pentru PDF-uri in iframe - indicatorul de incarcare dispare
  // oricum dupa 2s, ca sa nu ramana peste document.
  useEffect(() => {
    if (!s?.link || s.incarcat) return
    const t = setTimeout(() => setS(p => (p ? { ...p, incarcat: true } : p)), 2000)
    return () => clearTimeout(t)
  }, [s?.link, s?.incarcat])

  if (!s) return null
  const nume = s.link?.nume || s.nume || 'Document'
  const tip = s.link?.tip || ''
  const ePdf = tip === 'application/pdf'
  const eImagine = tip.startsWith('image/')
  const descarca = s.url
  const sep = descarca.includes('?') ? '&' : '?'

  return (
    <>
      <div className="palette-backdrop" onClick={inchide} />
      <div role="dialog" aria-modal="true" aria-label={`Vizualizare: ${nume}`} className="doc-viewer">
        <div className="doc-viewer-bar">
          <Icon name="fileText" size={16} style={{ color: 'var(--text-muted)' }} />
          <div title={nume} style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nume}</div>
          {s.link && <a href={s.link.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost" title="Deschide în tab nou">Tab nou</a>}
          <a href={descarca.replace(/[?&]preview=1/, '')} className="btn btn-sm" title="Descarcă fișierul"><Icon name="download" size={14} /> Descarcă</a>
          <button onClick={inchide} className="btn btn-sm btn-ghost btn-icon" aria-label="Închide"><Icon name="close" size={16} /></button>
        </div>
        <div className="doc-viewer-body">
          {!s.link && !s.eroare && <div className="doc-viewer-loading"><span className="spinner" /> Se deschide…</div>}
          {s.eroare && (
            <div className="doc-viewer-loading" style={{ flexDirection: 'column', gap: '10px' }}>
              <span style={{ color: 'var(--danger)' }}>{s.eroare}</span>
              <iframe title={nume} src={`${descarca}${sep}preview=1`} style={{ width: '100%', flex: 1, border: 0, background: '#fff', borderRadius: 'var(--r-md)' }} />
            </div>
          )}
          {s.link && ePdf && (
            <>
              {!s.incarcat && <div className="doc-viewer-loading" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}><span className="spinner" /> Se încarcă…</div>}
              <iframe title={nume} src={`${s.link.url}#view=FitH`} onLoad={() => setS(p => (p ? { ...p, incarcat: true } : p))} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
            </>
          )}
          {s.link && eImagine && (
            <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'var(--surface-sunken)' }}>
              <img src={s.link.url} alt={nume} style={{ maxWidth: '100%', height: 'auto', display: 'block', background: '#fff' }} />
            </div>
          )}
          {s.link && !ePdf && !eImagine && (
            <div className="doc-viewer-loading" style={{ flexDirection: 'column', gap: '10px', textAlign: 'center' }}>
              <span>Acest tip de fișier nu se poate previzualiza în browser.</span>
              <a href={descarca} className="btn btn-primary btn-sm">Descarcă</a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
