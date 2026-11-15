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

// Totalul explicit cu moneda lui: (RON) daca exista; altfel - factura emisa in alta moneda (Trendyol
// „Shipping invoice … EUR”, comision in EUR) are DOAR „Total amount inc. VAT (EUR)” → suma + valuta EUR.
// Inainte, aceste facturi se salvau cu suma in EUR dar valuta RON.
// Emitentul platformei scris pe factura. La facturile de comision Trendyol (TYC…) antetul are doar
// clientul (firma noastra), iar AI-ul lua clientul drept furnizor („AB HOMES INVEST”); Trendyol B.V. apare jos.
export function emitentPlatformaDinText(text: string): string | null {
  if (/Trendyol\s+B\.V\./i.test(text) && /NL861934209/.test(text)) return 'Trendyol B.V.'
  return null
}

export function totalExplicitDinText(text: string): { suma: number; valuta: string } | null {
  const ron = sumaRonDinText(text)
  if (ron != null) return { suma: ron, valuta: 'RON' }
  const m = text.match(/Total\s+amount\s+inc(?:l|luding)?\.?\s*VAT\s*\((EUR|USD|HUF|BGN|PLN)\)\s*:?\s*([\d.,]+)/i)
  if (!m) return null
  const n = Number(m[2].replace(/,(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? { suma: Math.round(n * 100) / 100, valuta: m[1].toUpperCase() } : null
}

export async function totalExplicitDinPdf(bytes: Uint8Array): Promise<{ suma: number; valuta: string; emitent: string | null } | null> {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })
    const t = String(text || ''), total = totalExplicitDinText(t)
    return total ? { ...total, emitent: emitentPlatformaDinText(t) } : null
  } catch { return null }
}
