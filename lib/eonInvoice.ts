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

// Facturile Hidroelectrica (8 pagini) - aceeasi regula ca la E.ON: doar prima pagina conteaza (suma, numarul
// facturii, scadenta, data emiterii); cerut direct: „la fel și în cazul Contaflow” (dupa apartpro).
export function isHidroelectricaInvoice(supplier: string | null | undefined): boolean {
  return /hidroelectrica/i.test(String(supplier || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}
// Furnizorii la care se pastreaza DOAR prima pagina din PDF
export function isFirstPageOnlyInvoice(supplier: string | null | undefined): boolean {
  return isEonInvoice(supplier) || isHidroelectricaInvoice(supplier)
}

async function textPrimelePagini(pdf: Buffer | Uint8Array): Promise<string | null> {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: false })
    return (Array.isArray(text) ? text.slice(0, 2).join('\n') : String(text)).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    return null
  }
}
const RE_EON_PDF = /E\.ON Energie Romania|seria [A-Z]{1,3} EON|eon\.ro\/(contact|myline)|\bE\.ON (ACTUAL|Myline|DUO|Duo|GAZ|Gaz)\b/i
const RE_HIDRO_PDF = /SPEEH HIDROELECTRICA|hidroelectrica\.ro|HIDROELECTRICA S\.?A\b/i

// Plasa de siguranta cand AI-ul citeste gresit furnizorul (ex. ia numele clientului de sus drept furnizor):
// recunoaste factura E.ON direct din textul primelor pagini ale PDF-ului.
export async function isEonPdf(pdf: Buffer | Uint8Array): Promise<boolean> {
  const t = await textPrimelePagini(pdf)
  return !!t && RE_EON_PDF.test(t)
}
// La fel, pentru E.ON SAU Hidroelectrica (o singura citire a textului)
export async function isFirstPageOnlyPdf(pdf: Buffer | Uint8Array): Promise<boolean> {
  const t = await textPrimelePagini(pdf)
  return !!t && (RE_EON_PDF.test(t) || RE_HIDRO_PDF.test(t))
}

// Reconstruiește fizic PDF-ul păstrând DOAR prima pagină - pentru TOATE facturile E.ON (curent, gaz, Duo) și Hidroelectrica,
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
    throw new Error('Splitarea facturii (E.ON / Hidroelectrica) a eșuat: rezultatul nu are exact o pagină')

  return result
}
