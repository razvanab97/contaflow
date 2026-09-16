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

export async function pdfPageCount(bytes: Buffer): Promise<number> {
  const source = await PDFDocument.load(bytes)
  return source.getPageCount()
}

// Extrage un interval arbitrar de pagini [pageStart, pageEnd] (index de la 1, inclusiv) intr-un
// PDF nou - folosit pentru a separa un fisier care contine mai multe documente distincte
// (ex. un export in bloc din ANAF/Oblio cu zeci de facturi de la furnizori diferiti) in fisiere
// individuale, ca fiecare sa fie procesat separat cu datele lui corecte.
export async function extractPageRange(bytes: Buffer, pageStart: number, pageEnd: number): Promise<Buffer> {
  const source = await PDFDocument.load(bytes)
  const pageCount = source.getPageCount()
  const start = Math.max(1, pageStart)
  const end = Math.min(pageCount, pageEnd)
  const indices = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start - 1 + i)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(source, indices)
  pages.forEach(p => out.addPage(p))
  return Buffer.from(await out.save())
}
