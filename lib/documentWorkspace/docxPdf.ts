'use client'
import JSZip from 'jszip'

// Export PDF fidel documentului Word: docx-preview randeaza .docx-ul cu pagina, antetul, subsolul, fonturile
// si tabelele lui, apoi corectam cele cateva locuri in care se abate de la Word (verificat pe rapoartele
// lunare AB Textile fata de PDF-urile tiparite din Word: corpul se suprapune la cativa puncte).

type Layout = { top: number; left: number; right: number; footer: number; anchors: { relH?: string; x: number; relV?: string; y: number }[] }

// Calibri nu exista in browser: Carlito are exact aceleasi dimensiuni (din Google Fonts).
const CALIBRI = [
  ['normal', 400, '3Jn9SDPw3m-pk039DDeBTFcHXuA'], ['normal', 700, '3Jn4SDPw3m-pk039BIykWXolU8pB2Os'],
  ['italic', 400, '3Jn_SDPw3m-pk039DDKxTl0AfOJL0A'], ['italic', 700, '3Jn6SDPw3m-pk039DDK59XgVUcBG-ul7MA'],
].map(([style, weight, id]) => `@font-face{font-family:'Calibri';font-style:${style};font-weight:${weight};font-display:block;src:local('Calibri'),url(https://fonts.gstatic.com/s/carlito/v4/${id}.woff2) format('woff2')}`).join('')

const PAGE_CSS = `${CALIBRI}
@page{margin:0} body{margin:0;background:#fff}
.docx-wrapper{background:#fff!important;padding:0!important;display:block!important}
.docx-wrapper>section.docx{box-shadow:none!important;margin:0!important;break-after:page}
section.docx{font-family:Calibri,sans-serif;font-size:11pt;hyphens:manual!important;-webkit-hyphens:manual!important}
section.docx *{hyphens:manual!important;-webkit-hyphens:manual!important}
section.docx p[style*="--hang"]::before{display:inline-block;width:var(--hang);white-space:nowrap}`

// Paragrafele goale din antet/subsol au in Word inaltimea fontului marcajului de paragraf: punem acolo un
// caracter invizibil cu acel font. Citim si geometria paginii + ancorele imaginilor din antet.
async function pregateste(buffer: ArrayBuffer): Promise<{ buffer: ArrayBuffer; layout: Layout }> {
  const zip = await JSZip.loadAsync(buffer)
  const twip = (v?: string) => (Number(v) || 0) / 20, emu = (v?: string) => (Number(v) || 0) / 12700
  const doc = await zip.file('word/document.xml')!.async('string')
  const mar = (doc.match(/<w:pgMar [^>]*>/g) || []).pop() || ''
  const a = (k: string) => twip((mar.match(new RegExp('w:' + k + '="(-?[0-9]+)"')) || [])[1])
  const layout: Layout = { top: a('top'), left: a('left'), right: a('right'), footer: a('footer'), anchors: [] }
  const fisiere = Object.keys(zip.files).filter(n => /^word\/(header\d+|footer\d+)\.xml$/.test(n))
  for (const name of fisiere) {
    let xml = await zip.file(name)!.async('string')
    if (/header/.test(name)) for (const m of xml.matchAll(/<wp:anchor[\s\S]*?<\/wp:anchor>/g)) {
      const h = m[0].match(/<wp:positionH relativeFrom="(\w+)">[\s\S]*?<wp:posOffset>(-?\d+)/), v = m[0].match(/<wp:positionV relativeFrom="(\w+)">[\s\S]*?<wp:posOffset>(-?\d+)/)
      layout.anchors.push({ relH: h?.[1], x: emu(h?.[2]), relV: v?.[1], y: emu(v?.[2]) })
    }
    xml = xml.replace(/<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g, p => {
      if (/<w:t[\s>]|<w:drawing|<w:pict|<w:object|<w:tab\/>|<w:br/.test(p)) return p
      const rpr = (p.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/) || [])[1] || ''
      return p.replace(/<\/w:p>$/, `<w:r>${rpr}<w:t xml:space="preserve">​</w:t></w:r></w:p>`)
    })
    zip.file(name, xml)
  }
  return { buffer: await zip.generateAsync({ type: 'arraybuffer' }), layout }
}

function corecteaza(root: Document, L: Layout) {
  const win = root.defaultView!
  const probe = root.createElement('span'); probe.textContent = 'Ăg'; probe.style.display = 'inline-block'
  const cache = new Map<string, number>()
  const natural = (el: HTMLElement) => {
    const cs = win.getComputedStyle(el), k = `${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}|${cs.fontStyle}`
    if (!cache.has(k)) { probe.style.font = cs.font; probe.style.lineHeight = 'normal'; el.appendChild(probe); cache.set(k, probe.getBoundingClientRect().height); probe.remove() }
    return cache.get(k)!
  }
  // Spatierea "multipla" din Word = m x inaltimea naturala a celui mai mare font de pe rand (nu m x marimea fontului).
  root.querySelectorAll<HTMLElement>('section.docx p').forEach(p => {
    const cs = win.getComputedStyle(p), fs = parseFloat(cs.fontSize)
    const ti = parseFloat(cs.textIndent); if (ti < 0) p.style.setProperty('--hang', (-ti) + 'px')
    const m = cs.lineHeight === 'normal' ? 1 : (p.style.lineHeight && !/px|pt|%/.test(p.style.lineHeight) ? parseFloat(p.style.lineHeight) : parseFloat(cs.lineHeight) / fs)
    if (!m) return
    const spans = [...p.querySelectorAll<HTMLElement>('span')].filter(s => s.textContent?.length)
    let h = spans.length ? 0 : natural(p)
    spans.forEach(s => { h = Math.max(h, natural(s)) })
    p.style.lineHeight = (m * h) + 'px'
    if (spans.length && spans.every(x => x.textContent === '​')) p.style.fontSize = win.getComputedStyle(spans[0]).fontSize
  })
  const pt = 4 / 3
  root.querySelectorAll<HTMLElement>('section.docx').forEach(sec => {
    sec.style.position = 'relative'
    const sr = sec.getBoundingClientRect()
    const header = sec.querySelector<HTMLElement>(':scope > header')
    let i = 0
    header?.querySelectorAll('img').forEach(img => {
      const box = img.parentElement as HTMLElement, an = L.anchors[i]
      if (!an || !/top|left/.test(box.getAttribute('style') || '')) return
      i++
      const para = (box.closest('p') as HTMLElement) || header
      const left = an.relH === 'page' ? an.x : an.relH === 'margin' ? L.left + an.x : (box.getBoundingClientRect().left - sr.left) / pt
      const top = an.relV === 'page' ? an.y : an.relV === 'margin' ? L.top + an.y : (para.getBoundingClientRect().top - sr.top) / pt + an.y
      sec.appendChild(box)
      Object.assign(box.style, { position: 'absolute', left: left + 'pt', top: top + 'pt', zIndex: '0' })
    })
    sec.querySelectorAll<HTMLElement>(':scope > header table, :scope > footer table').forEach(t => {
      const cols = [...t.querySelectorAll<HTMLElement>(':scope > colgroup > col')]
      const w = cols.map(c => parseFloat(c.style.width) || 0)
      if (w.length && w.every(x => x > 0)) { t.style.tableLayout = 'fixed'; t.style.width = w.reduce((a, b) => a + b, 0) + (/pt/.test(cols[0].style.width) ? 'pt' : 'px') }
    })
    sec.querySelectorAll<HTMLElement>('p img').forEach(img => {
      const box = img.parentElement as HTMLElement
      if (box.style.position === 'absolute') return
      box.style.verticalAlign = 'bottom'
      const p = box.closest('p') as HTMLElement | null
      if (p && !p.textContent?.replace(/​/g, '').trim()) p.style.lineHeight = 'normal'
    })
    const footer = sec.querySelector<HTMLElement>(':scope > footer')
    if (footer) Object.assign(footer.style, { position: 'absolute', left: L.left + 'pt', right: L.right + 'pt', bottom: L.footer + 'pt', margin: '0', minHeight: '0' })
  })
}

// Randeaza .docx-ul intr-un document (iframe) gata de tiparit; intoarce marimea paginii.
export async function randeazaDocx(target: Document, buffer: ArrayBuffer): Promise<{ width: string; height: string }> {
  const { renderAsync } = await import('docx-preview')
  const { buffer: pregatit, layout } = await pregateste(buffer)
  const style = target.createElement('style'); style.textContent = PAGE_CSS; target.head.appendChild(style)
  const box = target.createElement('div'); target.body.appendChild(box)
  await renderAsync(pregatit, box, undefined, { inWrapper: true, breakPages: true, experimental: true, renderHeaders: true, renderFooters: true, ignoreLastRenderedPageBreak: true, useBase64URL: true })
  await target.fonts.ready
  corecteaza(target, layout)
  const sec = target.querySelector<HTMLElement>('section.docx')
  return { width: sec?.style.width || '210mm', height: sec?.style.minHeight || sec?.style.height || '297mm' }
}

export async function printeazaDocx(url: string, titlu: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Documentul Word nu a putut fi descărcat.')
  const buffer = await res.arrayBuffer()
  const frame = document.createElement('iframe')
  frame.title = 'Raport pentru salvare PDF'
  frame.setAttribute('data-docx-print', '')
  Object.assign(frame.style, { position: 'fixed', width: '900px', height: '1200px', left: '-10000px', top: '0', border: '0' })
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument!
    doc.open(); doc.write('<!doctype html><html lang="ro"><head><meta charset="utf-8"></head><body></body></html>'); doc.close()
    const page = await randeazaDocx(doc, buffer)
    const size = doc.createElement('style'); size.textContent = `@page{size:${page.width} ${page.height};margin:0}`; doc.head.appendChild(size)
    doc.title = titlu.replace(/\.[^.]+$/, '')
    await Promise.all(Array.from(doc.images).map(img => img.decode().catch(() => undefined)))
    const win = frame.contentWindow!
    win.addEventListener('afterprint', () => frame.remove(), { once: true })
    win.focus(); win.print()
    setTimeout(() => frame.remove(), 60_000)
  } catch (e) { frame.remove(); throw e }
}
