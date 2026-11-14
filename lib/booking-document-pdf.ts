import { extractText, getDocumentProxy } from 'unpdf'
import { bookingTypeFromText } from './booking-documents'

export async function identifyBookingPdf(bytes: Uint8Array) {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })
    const type = bookingTypeFromText(text)
    const code = text.match(/(?:Num[aă]rul\s+unit[aă][tț]ii\s+de\s+cazare|\bID\s*:)\s*(\d{5,12})/i)?.[1] || null
    return { type, code }
  } catch {
    return { type: null, code: null }
  }
}
