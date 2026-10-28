'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { linkDocument } from '@/lib/vizualizare'
import Icon from './Icon'

// Document Word (.docx): randat in browser cu docx-preview (acelasi randator ca la „Salveaza PDF” din Raport lunar), in
// pagini ca in Word. Se ia fisierul direct din storage; daca browserul il blocheaza (CORS), prin ruta aplicatiei.
function DocxVizualizare({ urlStorage, urlApp }: { urlStorage: string; urlApp: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [stare, setStare] = useState<'incarca' | 'gata' | 'eroare'>('incarca')
  useEffect(() => {
    let anulat = false
    ;(async () => {
      try {
        let res = await fetch(urlStorage, { cache: 'no-store' }).catch(() => null)
        if (!res?.ok) res = await fetch(urlApp, { cache: 'no-store' })
        if (!res.ok) throw new Error('descarcare')
        const buffer = await res.arrayBuffer()
        const doc = frame.current?.contentDocument
        if (!doc || anulat) return
        doc.open(); doc.write('<!doctype html><html lang="ro"><head><meta charset="utf-8"><style>html{background:#e9ecef}body{margin:0;padding:16px 0}</style></head><body></body></html>'); doc.close()
        const { randeazaDocx } = await import('@/lib/documentWorkspace/docxPdf')
        await randeazaDocx(doc, buffer)
        // pe ecran: paginile una sub alta, centrate, cu umbra (stilul de tiparire le lipeste si le face fara umbra)
        const st = doc.createElement('style')
        st.textContent = '.docx-wrapper{background:transparent!important;padding:0!important;display:flex!important;flex-direction:column;align-items:center;gap:14px}.docx-wrapper>section.docx{box-shadow:0 1px 8px rgba(0,0,0,.2)!important;margin:0!important;background:#fff}'
        doc.head.appendChild(st)
        // pe ecran ingust pagina (A4) se micsoreaza ca sa incapa pe latime, in loc sa iasa din fereastra
        const pagina = doc.querySelector<HTMLElement>('section.docx')?.getBoundingClientRect().width || 0
        const larg = frame.current?.clientWidth || 0
        if (pagina && larg && pagina > larg - 16) doc.body.style.setProperty('zoom', String((larg - 16) / pagina))
        if (!anulat) setStare('gata')
      } catch { if (!anulat) setStare('eroare') }
    })()
    return () => { anulat = true }
  }, [urlStorage, urlApp])
  return (
    <>
      {stare === 'incarca' && <div className="doc-viewer-loading" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'var(--surface-sunken)', zIndex: 1 }}><span className="spinner" /> Se pregătește documentul…</div>}
      {stare === 'eroare' && <div className="doc-viewer-loading" style={{ position: 'absolute', inset: 0, flexDirection: 'column', gap: '10px', textAlign: 'center', background: 'var(--surface-sunken)', zIndex: 1 }}>
        <span>Documentul Word nu a putut fi afișat aici.</span>
        <a href={urlApp} className="btn btn-primary btn-sm">Descarcă</a>
      </div>}
      <iframe ref={frame} title="Document Word" style={{ width: '100%', height: '100%', border: 0, background: '#e9ecef' }} />
    </>
  )
}

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
  const eDocx = tip.includes('wordprocessingml.document') || /\.docx$/i.test(nume)
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
          {s.link && eDocx && !ePdf && <DocxVizualizare key={s.link.url} urlStorage={s.link.url} urlApp={descarca.replace(/[?&]preview=1/, '')} />}
          {s.link && !ePdf && !eImagine && !eDocx && (
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
