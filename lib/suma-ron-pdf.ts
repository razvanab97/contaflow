import { extractText, getDocumentProxy } from 'unpdf'

// Totalul in lei scris EXPLICIT pe document (ex. facturile Trendyol: „Total amount inc. VAT (RON) : 130.55”,
// urmat de „Total amount inc. VAT (EUR) : 24.79”). Citirea generala cu AI lua uneori ultimul total, cel
// in EUR, si il salva ca RON - de aceea, cand documentul are randul cu (RON), suma vine de aici.
export function sumaRonDinText(text: string): number | null {
  const m = text.match(/Total\s+amount\s+inc(?:l|luding)?\.?\s*VAT\s*\(RON\)\s*:?\s*([\d.,]+)/i)
  if (!m) return null
  const raw = m[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export async function sumaRonDinPdf(bytes: Uint8Array): Promise<number | null> {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })
    return sumaRonDinText(String(text || ''))
  } catch { return null }
}
