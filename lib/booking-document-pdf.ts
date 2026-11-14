import { extractText, getDocumentProxy } from 'unpdf'
import { bookingTypeFromText } from './booking-documents'

export async function identifyBookingPdf(bytes: Uint8Array) {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })
    const type = bookingTypeFromText(text)
    const code = text.match(/(?:Num[aă]rul\s+unit[aă][tț]ii\s+de\s+cazare|\bID\s*:)\s*(\d{5,12})/i)?.[1] || null
    let amount: number | null = null
    if (type === 'borderou-rezervari') {
      const rows = text.split('\n').filter(line => /^\d{8,12}\s+\d{8,12}\s+\d{4}-\d{2}-\d{2}/.test(line.trim()))
      const values = rows.map(line => [...line.matchAll(/\bRON\s+(-?\d+(?:\.\d+)?)/g)].map(match => Number(match[1])))
      if (values.length && values.every(row => row.length >= 3)) amount = values.reduce((sum, row) => sum + Math.round(row[1] * 100), 0) / 100
    } else if (type === 'borderou-plati') {
      const total = text.match(/Valoarea\s+total[aă]\s+a\s+pl[aă][tț]ii\s+([\d.]+,\d{2})\s+lei/i)?.[1]
      if (total) amount = Number(total.replace(/\./g, '').replace(',', '.'))
    }
    return { type, code, amount }
  } catch {
    return { type: null, code: null, amount: null }
  }
}
