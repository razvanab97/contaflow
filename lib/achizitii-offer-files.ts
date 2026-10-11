import { PDFDocument } from 'pdf-lib'

export const MAX_OFFER_BYTES = 4 * 1024 * 1024
export async function mergeOfferFiles(files: { type: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  if (!files.length || files.length > 10) throw new Error('Adaugă între 1 și 10 fișiere pentru o ofertă.')
  if (files.reduce((sum, file) => sum + file.bytes.length, 0) > MAX_OFFER_BYTES) throw new Error('Fișierele unei oferte pot avea maximum 4 MB în total.')
  const pdf = await PDFDocument.create()
  for (const file of files) {
    if (file.type === 'application/pdf') {
      const original = await PDFDocument.load(file.bytes)
      if (pdf.getPageCount() + original.getPageCount() > 50) throw new Error('O ofertă poate avea maximum 50 de pagini.')
      for (const page of await pdf.copyPages(original, original.getPageIndices())) pdf.addPage(page)
    } else {
      if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Acceptăm PDF, JPG și PNG.')
      if (pdf.getPageCount() >= 50) throw new Error('O ofertă poate avea maximum 50 de pagini.')
      const image = file.type === 'image/png' ? await pdf.embedPng(file.bytes) : await pdf.embedJpg(file.bytes)
      const [width, height] = image.width > image.height ? [842, 595] : [595, 842]
      const page = pdf.addPage([width, height])
      const scale = Math.min((width - 24) / image.width, (height - 24) / image.height)
      const w = image.width * scale, h = image.height * scale
      page.drawImage(image, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h })
    }
  }
  if (!pdf.getPageCount()) throw new Error('Fișierele nu conțin pagini.')
  const bytes = await pdf.save()
  if (bytes.length > MAX_OFFER_BYTES) throw new Error('PDF-ul rezultat depășește 4 MB. Folosește imagini mai mici.')
  return bytes
}
