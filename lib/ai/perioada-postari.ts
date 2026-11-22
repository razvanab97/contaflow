import Anthropic from '@anthropic-ai/sdk'

// Citește din „Anexe" (PDF/imagine cu capturi de postări + statistici) datele la care au fost publicate
// postările unei campanii. Întoarce datele găsite (ISO) + prima/ultima, ca să calculăm perioada de
// implementare și, din ea, data Deciziei (cu 7 zile înainte) și a Raportului (la o lună după).

export interface PerioadaPostari { dateGasite: string[]; prima: string | null; ultima: string | null; nota: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
type MediaImg = 'image/png' | 'image/jpeg'

export async function extragePerioadaPostari(bytes: Uint8Array, mediaType: string, an?: number): Promise<PerioadaPostari | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const data = Buffer.from(bytes).toString('base64')
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: (mediaType === 'image/png' ? 'image/png' : 'image/jpeg') as MediaImg, data } }
    const anCtx = an && an >= 2024 && an <= 2035 ? an : new Date().getFullYear()
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [source, { type: 'text', text:
        `Document „Anexe": capturi de ecran cu postări pe rețele sociale (Facebook/Instagram etc.) și statistici, pentru o campanie din anul ${anCtx}.

Găsește DATELE la care au fost PUBLICATE postările (data de lângă nume/oră, nu datele din statistici/grafice). Extrage doar ce se vede efectiv, nu inventa. Dacă o postare are doar ziua și luna (ex. „15 ianuarie" / „Jan 15"), folosește anul ${anCtx}. Ignoră datele relative pe care nu le poți transforma sigur (ex. „acum 2 zile") — notează-le la „nota".

Răspunde DOAR cu JSON, fără alt text:
{"dateGasite":["YYYY-MM-DD", ...],"prima":"YYYY-MM-DD sau null","ultima":"YYYY-MM-DD sau null","nota":"scurt: câte postări ai datat, ce n-ai putut data"}

„dateGasite" = toate datele de publicare găsite (poate avea duplicate). „prima"/„ultima" = cea mai veche / cea mai nouă dată din ele.` }] }],
    })
    const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const p = JSON.parse(m[0]) as { dateGasite?: unknown; prima?: unknown; ultima?: unknown; nota?: unknown }
    const dateGasite = Array.isArray(p.dateGasite) ? p.dateGasite.filter((x): x is string => typeof x === 'string' && ISO.test(x)) : []
    const ordonate = [...dateGasite].sort()
    const prima = (typeof p.prima === 'string' && ISO.test(p.prima)) ? p.prima : (ordonate[0] || null)
    const ultima = (typeof p.ultima === 'string' && ISO.test(p.ultima)) ? p.ultima : (ordonate[ordonate.length - 1] || null)
    return { dateGasite, prima, ultima, nota: typeof p.nota === 'string' ? p.nota.slice(0, 300) : '' }
  } catch {
    return null
  }
}
