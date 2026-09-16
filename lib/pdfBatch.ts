import { PDFDocument } from 'pdf-lib'

// Imparte un PDF mare in bucati de cel mult `pagesPerBatch` pagini fiecare - documente ca cele din
// 5StarDesk pot avea zeci/sute de pagini (de obicei o factura pe pagina), iar trimise integral
// intr-un singur apel AI, raspunsul JSON depaseste max_tokens si e trunchiat/invalid, pierzand
// silentios TOATE randurile acelui document, nu doar cele de dupa limita.
async function splitPdfIntoBatches(bytes: Buffer, pagesPerBatch: number): Promise<Buffer[]> {
  const source = await PDFDocument.load(bytes)
  const pageCount = source.getPageCount()
  if (pageCount <= pagesPerBatch) return [bytes]

  const batches: Buffer[] = []
  for (let start = 0; start < pageCount; start += pagesPerBatch) {
    const indices = Array.from({ length: Math.min(pagesPerBatch, pageCount - start) }, (_, i) => start + i)
    const out = await PDFDocument.create()
    const pages = await out.copyPages(source, indices)
    pages.forEach(p => out.addPage(p))
    batches.push(Buffer.from(await out.save()))
  }
  return batches
}

// Ruleaza o functie de extractie AI pe fiecare bucata a unui PDF mare si concateneaza rezultatele.
export async function extractInBatches<T>(bytes: Buffer, pagesPerBatch: number, extractFn: (batchBytes: Buffer) => Promise<T[]>): Promise<T[]> {
  const batches = await splitPdfIntoBatches(bytes, pagesPerBatch)
  const results: T[] = []
  for (const batch of batches) {
    results.push(...await extractFn(batch))
  }
  return results
}
