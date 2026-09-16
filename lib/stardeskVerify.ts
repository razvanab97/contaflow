import { getServiceSupabase } from '@/lib/supabase/server'

function normalizeCode(v: string) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }
function normalizeName(v: string) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim()
}

export function codesMatch(codeA: string, codeB: string) {
  const a = normalizeCode(codeA)
  const b = normalizeCode(codeB)
  return a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))
}

// Un nume citit de AI cu caractere non-latine (chirilice etc.) se poate reduce, dupa normalizare,
// la un singur cuvant scurt ramas (ex. "Elena Погореловская" -> "elena") - fara prag minim, acel
// cuvant s-ar potrivi prin substring cu orice alt nume care il contine intamplator ("Carmen Elena
// Ilie"), producand o asociere gresita intre doua persoane diferite. Cerem minim 6 caractere pe
// varianta mai scurta, ca sa nu conteze un singur prenume comun ca potrivire sigura.
function namesLikelyMatch(a: string, b: string) {
  if (!a || !b) return false
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  return short.length >= 6 && long.includes(short)
}

function sameAmount(a: number|null, b: number|null) { return a != null && b != null && Math.abs(a - b) < 1 }

// O factura e "aceeasi rezervare" daca se potriveste codul SAU numele oaspetelui - indiferent
// de suma. Suma se verifica separat, ca sa distingem "nicio factura gasita" de "factura gasita,
// dar suma nu corespunde" (discrepanta de pret - trebuie adusa in fata, nu ascunsa/ignorata).
function isStardeskCandidate(rez: { cod_rezervare:string; nume_oaspete:string|null }, factura: { id_rezervare:string|null; nume_client:string|null }) {
  if (codesMatch(rez.cod_rezervare, factura.id_rezervare || '')) return true
  return namesLikelyMatch(normalizeName(rez.nume_oaspete || ''), normalizeName(factura.nume_client || ''))
}

type Candidat<F> = { factura: F; sumaCorecta: boolean } | null

// Cauta printre facturile candidate (cod SAU nume potrivit) una cu suma identica; daca nu exista
// nicio potrivire exacta, intoarce primul candidat oricum, marcat ca discrepanta de pret.
function gasesteCandidat<F extends { suma: number|null }>(rez: { cod_rezervare:string; nume_oaspete:string|null; suma:number|null }, facturi: F[], esteCandidat: (f:F)=>boolean): Candidat<F> {
  const candidati = facturi.filter(esteCandidat)
  if (!candidati.length) return null
  const exact = candidati.find(f => sameAmount(rez.suma, f.suma))
  return exact ? { factura: exact, sumaCorecta: true } : { factura: candidati[0], sumaCorecta: false }
}

// Airbnb factureaza clientul cu suma BRUTA (inainte de comisionul retinut), iar borderoul arata
// suma NETA primita de gazda - deci "factura - borderou" ar trebui sa fie exact comisionul Airbnb
// al acelei rezervari. Daca se potriveste, discrepanta e explicata (nu e o eroare de facturare,
// doar TVA/comision normal) si nu mai trebuie sa apara ca "problema" de rezolvat.
function comisionExplicaDiferenta(
  rez: { cod_rezervare:string; suma:number|null },
  facturaClient: { suma:number|null },
  comisionAirbnb: { cod_rezervare:string|null; suma:number|null }[],
) {
  const comision = comisionAirbnb.find(c => codesMatch(rez.cod_rezervare, c.cod_rezervare || ''))
  if (!comision || comision.suma == null || rez.suma == null || facturaClient.suma == null) return null
  const diferentaReala = facturaClient.suma - rez.suma
  return { comision, explicat: Math.abs(diferentaReala - comision.suma) < 1 }
}

export async function computeVerification(sb: ReturnType<typeof getServiceSupabase>, lunaId: string) {
  const { data: allRez } = await sb.from('borderou_rezervari').select('*').eq('luna_id', lunaId)
  const { data: allFact } = await sb.from('stardesk_facturi').select('*').eq('luna_id', lunaId)
  const { data: allComision } = await sb.from('comision_facturi').select('*').eq('luna_id', lunaId)

  const rezervari = allRez || []
  const stardeskFacturi = allFact || []
  const comisionFacturi = allComision || []
  const comisionAirbnb = comisionFacturi.filter(f => f.platforma === 'airbnb')

  const faraFacturaClient: typeof rezervari = []
  const discrepanteClient: { rezervare:typeof rezervari[number]; factura:typeof stardeskFacturi[number] }[] = []
  const discrepanteExplicateComision: { rezervare:typeof rezervari[number]; factura:typeof stardeskFacturi[number]; comision:typeof comisionAirbnb[number] }[] = []
  for (const rez of rezervari) {
    if (rez.rezolvat_client) continue
    const candidat = gasesteCandidat(rez, stardeskFacturi, f => isStardeskCandidate(rez, f))
    if (!candidat) { faraFacturaClient.push(rez); continue }
    if (candidat.sumaCorecta) continue
    const explicatie = rez.platforma === 'airbnb' ? comisionExplicaDiferenta(rez, candidat.factura, comisionAirbnb) : null
    if (explicatie?.explicat) discrepanteExplicateComision.push({ rezervare: rez, factura: candidat.factura, comision: explicatie.comision })
    else discrepanteClient.push({ rezervare: rez, factura: candidat.factura })
  }

  // Verificare inversă: facturi 5StarDesk care nu se potrivesc cu nicio rezervare din borderoul lunii
  // (rezervare lipsă din borderou, cod citit greșit, sau lună diferită)
  const facturiFaraRezervare = stardeskFacturi.filter(f => !rezervari.some(rez => isStardeskCandidate(rez, f)))

  // Comisionul e doar o fractiune din suma rezervarii, nu aceeasi suma - deci aici verificam
  // NUMAI daca exista o factura de comision pentru cod, fara sa comparam sume (comparatia de suma
  // relevanta e deja facuta mai sus, ca parte din explicarea discrepantei facturii de client).
  const rezervariAirbnb = rezervari.filter(r => r.platforma === 'airbnb')
  const faraComisionAirbnb: typeof rezervariAirbnb = []
  for (const rez of rezervariAirbnb) {
    if (rez.rezolvat_comision) continue
    const areComision = comisionAirbnb.some(f => codesMatch(rez.cod_rezervare, f.cod_rezervare || ''))
    if (!areComision) faraComisionAirbnb.push(rez)
  }

  const rezervariBooking = rezervari.filter(r => r.platforma === 'booking')
  const comisionBookingExista = comisionFacturi.some(f => f.platforma === 'booking')

  return {
    totalRezervari: rezervari.length,
    totalFacturiClient: stardeskFacturi.length,
    totalFacturiComision: comisionFacturi.length,
    faraFacturaClient: faraFacturaClient.map(r => ({ id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma })),
    discrepanteClient: discrepanteClient.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma })),
    discrepanteExplicateComision: discrepanteExplicateComision.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma, numarComision: d.comision.numar_factura, sumaComision: d.comision.suma })),
    facturiFaraRezervare: facturiFaraRezervare.map(f => ({ id: f.id, numarFactura: f.numar_factura, numeClient: f.nume_client, suma: f.suma, idRezervare: f.id_rezervare })),
    faraComisionAirbnb: faraComisionAirbnb.map(r => ({ id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma })),
    comisionBookingLipsa: rezervariBooking.length > 0 && !comisionBookingExista,
    totalRezervariBooking: rezervariBooking.length,
  }
}

export type VerificareResult = Awaited<ReturnType<typeof computeVerification>>

// Numarul de "probleme" (discrepante de pret) de aratat pe Dashboard, ca sa fie vizibile fara sa
// intri manual in modulul 5StarDesk al fiecarei firme - trebuie sesizate la timp, cat mai poate fi
// emisa o factura corectata.
export async function getStardeskDiscrepanteCount(lunaId: string): Promise<number> {
  const sb = getServiceSupabase()
  const result = await computeVerification(sb, lunaId)
  return result.discrepanteClient.length
}
