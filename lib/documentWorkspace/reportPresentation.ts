// Shared by the editor preview and the printable document.
export const REPORT_PAGE_CSS = `
.report-page { box-sizing: border-box; background: #fff; color: #1a1a1a;
  font: 16px/1.6 Arial, Helvetica, sans-serif; padding: 32px 40px;
  width: 794px; overflow-wrap: anywhere; }
.report-page ul { list-style: disc; padding-left: 22px; margin: 6px 0; }
.report-page ol { list-style: decimal; padding-left: 22px; margin: 6px 0; }
.report-page li { margin: 2px 0; }
.report-page p { margin: 8px 0; }
.report-page h1 { font-size: 24px; font-weight: 700; margin: 16px 0 8px; }
.report-page h2 { font-size: 20px; font-weight: 700; margin: 14px 0 8px; }
.report-page h3 { font-size: 18px; font-weight: 700; margin: 12px 0 8px; }
.report-page table { border-collapse: collapse; width: 100%; }
.report-page td, .report-page th { border: 1px solid #ddd; padding: 6px 10px; vertical-align: top; }
.report-page img { max-width: 100%; }
.report-page a { color: inherit; text-decoration: underline; }
`

export async function printReport(html: string, title: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.title = 'Raport pentru salvare PDF'
  Object.assign(frame.style, { position: 'fixed', width: '1px', height: '1px', left: '-10000px', border: '0' })
  document.body.appendChild(frame)
  try {
    const doc = frame.contentDocument
    if (!doc) throw new Error('Fereastra de export nu a putut fi deschisă.')
    doc.open()
    doc.write(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><style>
      ${REPORT_PAGE_CSS}
      @page { size: A4; margin: 8.4667mm 10.5833mm; }
      body { margin: 0; }
      .report-page { width: auto; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      thead { display: table-header-group; }
      img, h1, h2, h3 { break-inside: avoid; }
      h1, h2, h3 { break-after: avoid; }
      p, li { orphans: 3; widows: 3; }
    </style></head><body><main class="report-page">${html}</main></body></html>`)
    doc.close()
    doc.title = title.replace(/\.[^.]+$/, '')
    await Promise.all(Array.from(doc.images).map(img => img.decode().catch(() => undefined)))
    await doc.fonts.ready
    const win = frame.contentWindow
    if (!win) throw new Error('Exportul PDF nu este disponibil.')
    win.addEventListener('afterprint', () => frame.remove(), { once: true })
    win.focus()
    win.print()
    // Some browsers do not emit afterprint for a hidden frame.
    setTimeout(() => frame.remove(), 60_000)
  } catch (error) {
    frame.remove()
    throw error
  }
}
