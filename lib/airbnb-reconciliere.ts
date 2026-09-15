// Potrivește rezervările din borderoul Airbnb cu facturile de comision (Airbnb Ireland UC)
// după suma exactă: taxa_servicii din borderoul CSV este identică, până la ban, cu suma
// facturii — spre deosebire de valoarea totală a rezervării, care nu are legătură directă
// cu factura de comision. Fiecare factură se folosește o singură dată (asignare greedy,
// cea mai mică diferență întâi).

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
