import { extractText, getDocumentProxy } from 'unpdf'
import { salaryPaymentFromText } from './salary-payment'

export async function readSalaryPaymentPdf(bytes: Uint8Array) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })
  return salaryPaymentFromText(String(text || ''))
}
