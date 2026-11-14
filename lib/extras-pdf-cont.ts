import { extractText, getDocumentProxy } from 'unpdf'

// Contul caruia ii apartine un PDF de extras (IBAN-ul scris pe el sau, la PDF-urile criptate, in numele
// fisierului BT „Extrase_RO88BTRLRONCRT…”) - ca PDF-ul unui cont sa nu poata fi atasat la alt cont.
const RE_IBAN = /RO\d{2}[A-Z]{4}[A-Z0-9]{16}/
export const normIban = (s: string | null | undefined) => String(s || '').replace(/\s+/g, '').toUpperCase()
// La BT moneda e in IBAN: RO88 BTRL RON CRT… / RO38 BTRL EUR CRT…
export const monedaIban = (iban: string) => iban.match(/^RO\d{2}BTRL(RON|EUR|USD|GBP)/)?.[1] || null

export async function ibanDinPdf(bytes: Uint8Array, numeFisier: string): Promise<string | null> {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false })
    const prima = String((Array.isArray(text) ? text[0] : text) || '').replace(/\s+/g, '')
    const m = prima.match(RE_IBAN)
    if (m) return m[0]
  } catch { /* PDF criptat (cod de deblocare) - incercam numele fisierului */ }
  return normIban(numeFisier).match(RE_IBAN)?.[0] || null
}

// null = PDF-ul se potriveste (sau nu se poate verifica); altfel motivul refuzului.
export function verificaContPdf(ibanPdf: string | null, cont: { iban?: string | null; valuta?: string | null }): string | null {
  if (!ibanPdf) return null
  const ibanCont = normIban(cont.iban)
  // conturile BT ale aceleiasi firme difera adesea doar prin moneda (…RON CRT0678234101 / …EUR CRT0678234101)
  const eticheta = (iban: string) => `${monedaIban(iban) ? monedaIban(iban) + ' ' : ''}····${iban.slice(-4)}`
  if (ibanCont && ibanCont !== ibanPdf) return `PDF-ul este al contului ${eticheta(ibanPdf)}, nu al acestui cont (${eticheta(ibanCont)}). Alege PDF-ul extrasului corect.`
  const moneda = monedaIban(ibanPdf)
  if (!ibanCont && moneda && cont.valuta && moneda !== String(cont.valuta).toUpperCase()) return `PDF-ul este al unui cont în ${moneda} (····${ibanPdf.slice(-4)}), iar acesta e contul în ${cont.valuta}. Alege PDF-ul extrasului corect.`
  return null
}
