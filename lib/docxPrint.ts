// Randează un .docx în browser (docx-preview) și deschide fereastra de printare → „Salvează ca PDF".
// Folosit de generatorul de documente și de cardul „document în lucru".
export async function printeazaDocxPdf(url: string, nume: string) {
  const w = window.open('', '_blank')
  if (!w) { alert('Permite ferestrele pop-up pentru a salva PDF-ul.'); return }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${nume.replace(/[<>&]/g, '')}</title><style>body{margin:0}@page{margin:16mm}</style></head><body><div id="c">Se pregătește…</div></body></html>`)
  w.document.close()
  try {
    const { renderAsync } = await import('docx-preview')
    const blob = await (await fetch(url)).blob()
    const c = w.document.getElementById('c'); if (c) c.textContent = ''
    await renderAsync(blob, c as HTMLElement, undefined, { inWrapper: false, ignoreWidth: false, ignoreHeight: false })
    w.focus(); setTimeout(() => w.print(), 400)
  } catch { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">Nu s-a putut randa. Descarcă Word.</p>' }
}
