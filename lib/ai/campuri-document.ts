import Anthropic from '@anthropic-ai/sdk'

export interface CampuriDocument {
  suma: number | null
  moneda: string | null
  furnizor: string | null
  numarDocument: string | null
  dataDocument: string | null
}

// Citeste campurile de baza (suma totala de plata, moneda, emitent, numar, data) dintr-o factura,
// bon, chitanta sau aviz de plata. Folosit pentru completarea documentelor vechi fara suma.
export async function extrageCampuriDocument(bytes: Uint8Array, mediaType: string): Promise<CampuriDocument | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const data = Buffer.from(bytes).toString('base64')
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: (mediaType === 'image/png' ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg', data } }
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [source, { type: 'text', text:
        `Document contabil (factura, bon fiscal, chitanta, invoice sau aviz de plata). Extrage DOAR ce scrie pe document.
Raspunde DOAR cu JSON: {"suma":123.45,"moneda":"RON|EUR|USD|HUF|BGN sau null","furnizor":"emitentul documentului sau null","numarDocument":"seria si numarul sau null","dataDocument":"AAAA-LL-ZZ sau null"}
"suma" = TOTALUL de plata al documentului (cu TVA), nu un subtotal. Daca e un aviz de plata, totalul platit/de incasat din aviz. Nu inventa: daca nu e clar, pune null.` }] }],
    })
    const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const p = JSON.parse(m[0])
    const suma = typeof p.suma === 'number' && Number.isFinite(p.suma) && p.suma > 0 && p.suma < 10_000_000 ? Math.round(p.suma * 100) / 100 : null
    return {
      suma,
      moneda: typeof p.moneda === 'string' && /^[A-Z]{3}$/.test(p.moneda) ? p.moneda : null,
      furnizor: typeof p.furnizor === 'string' && p.furnizor.trim() ? p.furnizor.trim().slice(0, 200) : null,
      numarDocument: typeof p.numarDocument === 'string' && p.numarDocument.trim() ? p.numarDocument.trim().slice(0, 80) : null,
      dataDocument: typeof p.dataDocument === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dataDocument) ? p.dataDocument : null,
    }
  } catch {
    return null
  }
}
