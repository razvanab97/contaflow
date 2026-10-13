import { extractText, getDocumentProxy } from 'unpdf'
import { regesReportFromText } from './reges-reports'

export async function readRegesPdf(bytes: Uint8Array) {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })
    return regesReportFromText(String(text || ''))
  } catch { return null }
}
