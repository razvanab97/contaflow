import { PDFDocument } from 'pdf-lib'
import { extractText, getDocumentProxy } from 'unpdf'
export { pdfPageCount } from '@/lib/pdfBatch'

// Detectează dacă furnizorul extras de AI este E.ON (E.ON, E.ON Energie România, E.ON Energie
// Romania, E.ON Energie România S.A. etc.). Acceptă și varianta fără punct ("EON"), dar cere
// limită de cuvânt ca să evite potriviri întâmplătoare în mijlocul altor nume ("neon", "aeon").
export function isEonInvoice(supplier: string | null | undefined): boolean {
  const normalized = String(supplier || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /\be\.?\s*-?\s*on\b/.test(normalized)
}

// Plasa de siguranta cand AI-ul citeste gresit furnizorul (ex. ia numele clientului de sus drept furnizor):
// recunoaste factura E.ON direct din textul primelor pagini ale PDF-ului.
export async function isEonPdf(pdf: Buffer | Uint8Array): Promise<boolean> {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: false })
    const primele = (Array.isArray(text) ? text.slice(0, 2).join('\n') : String(text)).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return /E\.ON Energie Romania|seria [A-Z]{1,3} EON|eon\.ro\/(contact|myline)|\bE\.ON (ACTUAL|Myline|DUO|Duo|GAZ|Gaz)\b/i.test(primele)
  } catch {
    return false
  }
}

// Reconstruiește fizic PDF-ul păstrând DOAR prima pagină - pentru TOATE facturile E.ON (curent, gaz, Duo),
// fără excepții: prima pagină are suma, numărul facturii, scadența și data emiterii; paginile 2+ (grafice de consum, condiții generale) nu trebuie salvate, trimise la AI sau afișate.
// Nu doar "ignoră" paginile suplimentare - creează un document nou, validat, cu exact 1 pagină.
export async function keepOnlyFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  const sourcePdf = await PDFDocument.load(pdfBuffer)
  const pageCount = sourcePdf.getPageCount()
  if (pageCount < 1) throw new Error('PDF-ul nu conține nicio pagină')
  if (pageCount === 1) return pdfBuffer

  const outputPdf = await PDFDocument.create()
  const [firstPage] = await outputPdf.copyPages(sourcePdf, [0])
  outputPdf.addPage(firstPage)
  const result = Buffer.from(await outputPdf.save())

  const validationPdf = await PDFDocument.load(result)
  if (validationPdf.getPageCount() !== 1)
    throw new Error('Splitarea facturii E.ON a eșuat: rezultatul nu are exact o pagină')

  return result
}
