// Potrivește rezervările din borderoul Airbnb cu facturile de comision (Airbnb Ireland UC).
// Semnalul principal e codul de rezervare, scris explicit în textul facturii ("...pentru
// rezervarea HM48CP5NWB..."); suma (taxa_servicii din borderoul CSV) e doar rezerva pentru
// facturile la care extragerea codului eșuează, pentru că poate diferi cu 1-3 bani față de
// sumă din rotunjire. Fiecare factură se folosește o singură dată.

import Anthropic from '@anthropic-ai/sdk'

const TOLERANTA = 0.01

export type BorderouCandidat = {
  id: string
  taxa_servicii: number | null
}

export type FacturaCandidat = {
  id: string
  suma: number | null
}

export type PotrivireAirbnb = {
  borderouId: string
  docId: string
  diferenta: number
}

export function potrivesteFacturiAirbnb(randuri: BorderouCandidat[], facturi: FacturaCandidat[]): PotrivireAirbnb[] {
  const candidate: PotrivireAirbnb[] = []
  for (const rand of randuri) {
    if (typeof rand.taxa_servicii !== 'number') continue
    for (const factura of facturi) {
      if (typeof factura.suma !== 'number') continue
      const diferenta = Math.abs(factura.suma - rand.taxa_servicii)
      if (diferenta > TOLERANTA) continue
      candidate.push({ borderouId: rand.id, docId: factura.id, diferenta })
    }
  }
  candidate.sort((a, b) => a.diferenta - b.diferenta)

  const randuriFolosite = new Set<string>()
  const facturiFolosite = new Set<string>()
  const potriviri: PotrivireAirbnb[] = []
  for (const c of candidate) {
    if (randuriFolosite.has(c.borderouId) || facturiFolosite.has(c.docId)) continue
    randuriFolosite.add(c.borderouId)
    facturiFolosite.add(c.docId)
    potriviri.push(c)
  }
  return potriviri
}

export type BorderouCuCod = { id: string; cod_confirmare: string }
export type FacturaCuCod = { id: string; cod_rezervare_airbnb: string | null }

function normalizeazaCod(value: string | null | undefined) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function potrivesteDupaCodRezervare(randuri: BorderouCuCod[], facturi: FacturaCuCod[]): PotrivireAirbnb[] {
  const facturiFolosite = new Set<string>()
  const potriviri: PotrivireAirbnb[] = []
  for (const rand of randuri) {
    const codRand = normalizeazaCod(rand.cod_confirmare)
    if (!codRand) continue
    const factura = facturi.find(f => !facturiFolosite.has(f.id) && normalizeazaCod(f.cod_rezervare_airbnb) === codRand)
    if (!factura) continue
    facturiFolosite.add(factura.id)
    potriviri.push({ borderouId: rand.id, docId: factura.id, diferenta: 0 })
  }
  return potriviri
}

export async function extrageCodRezervareAirbnb(bytes: Uint8Array, mediaType: string): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: Buffer.from(bytes).toString('base64') } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } }
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: 'Aceasta este o factură de comision Airbnb (Airbnb Ireland UC/Airbnb Payments). Găsește codul de confirmare al rezervării la care se referă, de obicei într-o propoziție ca "Taxe de utilizare a platformei online pentru rezervarea XXXXXXXXXX". Codul e de obicei 10 caractere alfanumerice. Răspunde DOAR cu codul găsit, fără alt text sau explicații. Dacă nu găsești niciun cod, răspunde exact cu NULL.' },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
    if (!raw || raw.toUpperCase() === 'NULL') return null
    const match = raw.match(/[A-Z0-9]{6,14}/)
    return match ? match[0] : null
  } catch {
    return null
  }
}
