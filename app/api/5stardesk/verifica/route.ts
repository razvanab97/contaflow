import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { extractInBatches } from '@/lib/pdfBatch'

// Documente cu multe pagini (o factura/rezervare pe pagina) trebuie trimise la AI in bucati -
// altfel raspunsul JSON pentru zeci/sute de randuri depaseste max_tokens si e trunchiat/invalid.
const PAGES_PER_BATCH = 15

interface RezervareRow { codRezervare?: string; numeOaspete?: string; suma?: number }
interface StardeskFacturaRow { numarFactura?: string; numeClient?: string; suma?: number; idRezervare?: string }
interface ComisionFacturaRow { numarFactura?: string; codRezervare?: string; suma?: number }

function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) as T } catch { return null }
}

async function extractBorderou(bytes: Buffer, platforma: 'airbnb' | 'booking'): Promise<RezervareRow[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const instructions = platforma === 'airbnb'
    ? `Acesta e un borderou/raport de câștiguri Airbnb. Contine linii de tip "Payout", "Rezervare" si uneori "Ajustare de definitivare".
Extrage DOAR liniile de tip "Rezervare" (ignora liniile "Payout" si "Ajustare de definitivare" - nu sunt rezervari individuale de facturat, chiar daca mentioneaza acelasi Cod de confirmare ca o rezervare deja extrasa).
Fiecare Cod de confirmare trebuie sa apara O SINGURA DATA in rezultat. Daca acelasi cod pare sa apara pe mai multe linii din document, e semn ca una dintre ele e o ajustare sau o corectie a celeilalte, nu o rezervare noua - pastreaz-o doar pe cea care e clar o linie de tip "Rezervare" si ignor-o pe cealalta.
Pentru fiecare linie de Rezervare: codRezervare = "Cod de confirmare" (ex: "HM49J4C2DW"), numeOaspete = coloana "Oaspete", suma = coloana "Suma" (numar, fara simbol monetar).`
    : `Acesta e un borderou/sumar de plati Booking.com. Contine linii de tip "Rezervare".
Pentru fiecare linie: codRezervare = "Număr rezervare" (numeric, ex: "6721732753"), numeOaspete = "Nume oaspete", suma = coloana "Sumă" (numar, fara simbol monetar).`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role:'user', content:[
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:bytes.toString('base64') } },
      { type:'text', text:`${instructions}
Returneaza DOAR JSON valid, fara alt text:
{"rezervari":[{"codRezervare":"HM49J4C2DW","numeOaspete":"Ion Popescu","suma":142.48}]}
Extrage TOATE liniile de rezervare din document, nu doar primele cateva.` },
    ] }],
  })
  const text = response.content.filter(b => b.type === 'text').map(b => (b as {text:string}).text).join('')
  const parsed = extractJson<{ rezervari?: RezervareRow[] }>(text)
  return parsed?.rezervari || []
}

async function extractStardeskInvoices(bytes: Buffer): Promise<StardeskFacturaRow[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{ role:'user', content:[
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:bytes.toString('base64') } },
      { type:'text', text:`Acest document contine facturi fiscale 5StarDesk, de obicei una pe pagina. Extrage FIECARE factura din TOATE paginile.
Pentru fiecare factura: numarFactura = "Nr." (ex: "ABRH 1188"), numeClient = "Client / Nume:", suma = "Total Factura" (numar, fara simbol monetar), idRezervare = numarul din paranteza "(ID: XXXXXXXXXX)" mentionat langa serviciul de cazare.
Returneaza DOAR JSON valid, fara alt text:
{"facturi":[{"numarFactura":"ABRH 1188","numeClient":"Andrada Gherghey","suma":292.49,"idRezervare":"5649678350"}]}
Extrage TOATE facturile din document (poate fi vorba de zeci de pagini), nu doar primele cateva.` },
    ] }],
  })
  const text = response.content.filter(b => b.type === 'text').map(b => (b as {text:string}).text).join('')
  const parsed = extractJson<{ facturi?: StardeskFacturaRow[] }>(text)
  return parsed?.facturi || []
}

// Airbnb factureaza comision per-rezervare (codul apare direct in text: "rezervarea HM94NK4MXX").
// Booking factureaza comision agregat/lunar (fara cod de rezervare) - deci codRezervare ramane gol pentru Booking.
async function extractComisionInvoices(bytes: Buffer, platforma: 'airbnb' | 'booking'): Promise<ComisionFacturaRow[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const instructions = platforma === 'airbnb'
    ? `Aceasta e o factura de comision Airbnb (Airbnb Ireland UC catre gazda). Descrierea contine textul "pentru rezervarea XXXXXXXXXX din data de ...".
Extrage: numarFactura = "Numărul facturii", codRezervare = codul de rezervare mentionat in descriere (ex: "HM94NK4MXX"), suma = Subtotal (numar, fara simbol monetar, doar suma in RON daca sunt afisate mai multe valute).`
    : `Aceasta e o factura de comision Booking.com (agregata, pentru toate rezervarile dintr-o perioada, NU per rezervare individuala).
Extrage: numarFactura = "Număr factură", suma = "Comision" sau "Suma totală de plată" (numar, fara simbol monetar). Nu exista cod de rezervare individual pe acest tip de factura - lasa codRezervare gol.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role:'user', content:[
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:bytes.toString('base64') } },
      { type:'text', text:`${instructions}
Returneaza DOAR JSON valid, fara alt text:
{"facturi":[{"numarFactura":"AIUC-68449666-RO-329004","codRezervare":"HM94NK4MXX","suma":217.00}]}
Documentul poate avea una sau mai multe facturi.` },
    ] }],
  })
  const text = response.content.filter(b => b.type === 'text').map(b => (b as {text:string}).text).join('')
  const parsed = extractJson<{ facturi?: ComisionFacturaRow[] }>(text)
  return parsed?.facturi || []
}

function normalizeCode(v: string) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }
function normalizeName(v: string) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim()
}

function codesMatch(codeA: string, codeB: string) {
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

// Plasă de siguranță împotriva extragerilor AI care duplică din greșeală același cod de rezervare
// (ex: o linie de "Ajustare de definitivare" citită greșit ca rezervare separată) - păstrează prima apariție.
function dedupeByCode(rows: RezervareRow[]): RezervareRow[] {
  const seen = new Set<string>()
  const out: RezervareRow[] = []
  for (const r of rows) {
    const key = normalizeCode(r.codRezervare || '')
    if (key) { if (seen.has(key)) continue; seen.add(key) }
    out.push(r)
  }
  return out
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

async function computeVerification(sb: ReturnType<typeof getServiceSupabase>, lunaId: string) {
  const { data: allRez } = await sb.from('borderou_rezervari').select('*').eq('luna_id', lunaId)
  const { data: allFact } = await sb.from('stardesk_facturi').select('*').eq('luna_id', lunaId)
  const { data: allComision } = await sb.from('comision_facturi').select('*').eq('luna_id', lunaId)

  const rezervari = allRez || []
  const stardeskFacturi = allFact || []
  const comisionFacturi = allComision || []

  const faraFacturaClient: typeof rezervari = []
  const discrepanteClient: { rezervare:typeof rezervari[number]; factura:typeof stardeskFacturi[number] }[] = []
  for (const rez of rezervari) {
    if (rez.rezolvat_client) continue
    const candidat = gasesteCandidat(rez, stardeskFacturi, f => isStardeskCandidate(rez, f))
    if (!candidat) faraFacturaClient.push(rez)
    else if (!candidat.sumaCorecta) discrepanteClient.push({ rezervare: rez, factura: candidat.factura })
  }

  // Verificare inversă: facturi 5StarDesk care nu se potrivesc cu nicio rezervare din borderoul lunii
  // (rezervare lipsă din borderou, cod citit greșit, sau lună diferită)
  const facturiFaraRezervare = stardeskFacturi.filter(f => !rezervari.some(rez => isStardeskCandidate(rez, f)))

  const rezervariAirbnb = rezervari.filter(r => r.platforma === 'airbnb')
  const comisionAirbnb = comisionFacturi.filter(f => f.platforma === 'airbnb')
  const faraComisionAirbnb: typeof rezervariAirbnb = []
  const discrepanteComisionAirbnb: { rezervare:typeof rezervariAirbnb[number]; factura:typeof comisionAirbnb[number] }[] = []
  for (const rez of rezervariAirbnb) {
    if (rez.rezolvat_comision) continue
    const candidat = gasesteCandidat(rez, comisionAirbnb, f => codesMatch(rez.cod_rezervare, f.cod_rezervare || ''))
    if (!candidat) faraComisionAirbnb.push(rez)
    else if (!candidat.sumaCorecta) discrepanteComisionAirbnb.push({ rezervare: rez, factura: candidat.factura })
  }

  const rezervariBooking = rezervari.filter(r => r.platforma === 'booking')
  const comisionBookingExista = comisionFacturi.some(f => f.platforma === 'booking')

  return {
    totalRezervari: rezervari.length,
    totalFacturiClient: stardeskFacturi.length,
    totalFacturiComision: comisionFacturi.length,
    faraFacturaClient: faraFacturaClient.map(r => ({ id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma })),
    discrepanteClient: discrepanteClient.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma })),
    facturiFaraRezervare: facturiFaraRezervare.map(f => ({ id: f.id, numarFactura: f.numar_factura, numeClient: f.nume_client, suma: f.suma, idRezervare: f.id_rezervare })),
    faraComisionAirbnb: faraComisionAirbnb.map(r => ({ id: r.id, codRezervare: r.cod_rezervare, numeOaspete: r.nume_oaspete, suma: r.suma, platforma: r.platforma })),
    discrepanteComisionAirbnb: discrepanteComisionAirbnb.map(d => ({ id: d.rezervare.id, codRezervare: d.rezervare.cod_rezervare, numeOaspete: d.rezervare.nume_oaspete, suma: d.rezervare.suma, platforma: d.rezervare.platforma, numarFactura: d.factura.numar_factura, sumaFactura: d.factura.suma })),
    comisionBookingLipsa: rezervariBooking.length > 0 && !comisionBookingExista,
    totalRezervariBooking: rezervariBooking.length,
  }
}

type Categorie = 'client' | 'comision-airbnb' | 'comision-booking'

async function extrageBorderouriLipsa(sb: ReturnType<typeof getServiceSupabase>, lunaId: string, firmaId: string) {
  const { data: borderouDocs } = await sb.from('documente')
    .select('id,fisier_path,fisier_nume')
    .eq('luna_id', lunaId)
    .or('fisier_path.like.%/airbnb-borderou/%,fisier_path.like.%/booking-borderou/%')
  const { data: existingRez } = await sb.from('borderou_rezervari').select('document_id').eq('luna_id', lunaId)
  const extractedRezDocIds = new Set((existingRez || []).map(r => r.document_id))

  for (const doc of borderouDocs || []) {
    if (extractedRezDocIds.has(doc.id)) continue
    const platforma: 'airbnb' | 'booking' = doc.fisier_path.includes('/airbnb-borderou/') ? 'airbnb' : 'booking'
    const { data: file } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!file) continue
    const bytes = Buffer.from(await file.arrayBuffer())
    let rezervari: RezervareRow[] = []
    try { rezervari = await extractInBatches(bytes, PAGES_PER_BATCH, b => extractBorderou(b, platforma)) }
    catch (err) { console.error('[5stardesk] extracție borderou eșuată pentru documentul', doc.id, doc.fisier_nume, err) }
    rezervari = dedupeByCode(rezervari)
    if (rezervari.length) {
      await sb.from('borderou_rezervari').insert(rezervari.map(r => ({
        luna_id: lunaId, firma_id: firmaId, document_id: doc.id, platforma,
        cod_rezervare: r.codRezervare || '', nume_oaspete: r.numeOaspete || '', suma: Number(r.suma) || null,
      })))
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { lunaId, firmaId, categorie } = await req.json() as { lunaId?:string; firmaId?:string; categorie?:Categorie }
    if (!lunaId || !firmaId || !categorie) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    const sb = getServiceSupabase()

    // Borderourile sunt referinta pentru toate cele 3 verificari, se extrag mereu (cache pe document_id deja extras)
    await extrageBorderouriLipsa(sb, lunaId, firmaId)

    if (categorie === 'client') {
      const { data: stardeskDocs } = await sb.from('documente')
        .select('id,fisier_path,fisier_nume')
        .eq('luna_id', lunaId)
        .like('fisier_path', '%/5stardesk/%')
      const { data: existingFact } = await sb.from('stardesk_facturi').select('document_id').eq('luna_id', lunaId)
      const extractedFactDocIds = new Set((existingFact || []).map(r => r.document_id))

      for (const doc of stardeskDocs || []) {
        if (extractedFactDocIds.has(doc.id)) continue
        const { data: file } = await sb.storage.from('documente').download(doc.fisier_path)
        if (!file) continue
        const bytes = Buffer.from(await file.arrayBuffer())
        let facturi: StardeskFacturaRow[] = []
        try { facturi = await extractInBatches(bytes, PAGES_PER_BATCH, extractStardeskInvoices) }
        catch (err) { console.error('[5stardesk] extracție facturi client eșuată pentru documentul', doc.id, doc.fisier_nume, err) }
        if (facturi.length) {
          await sb.from('stardesk_facturi').insert(facturi.map(f => ({
            luna_id: lunaId, firma_id: firmaId, document_id: doc.id,
            numar_factura: f.numarFactura || '', nume_client: f.numeClient || '', suma: Number(f.suma) || null, id_rezervare: f.idRezervare || '',
          })))
        }
      }
    }

    if (categorie === 'comision-airbnb' || categorie === 'comision-booking') {
      const pathPattern = categorie === 'comision-airbnb' ? '%/airbnb-facturi/%' : '%/booking-facturi/%'
      const platformaFixa: 'airbnb' | 'booking' = categorie === 'comision-airbnb' ? 'airbnb' : 'booking'
      const { data: comisionDocs } = await sb.from('documente')
        .select('id,fisier_path,fisier_nume')
        .eq('luna_id', lunaId)
        .like('fisier_path', pathPattern)
      const { data: existingComision } = await sb.from('comision_facturi').select('document_id').eq('luna_id', lunaId)
      const extractedComisionDocIds = new Set((existingComision || []).map(r => r.document_id))

      for (const doc of comisionDocs || []) {
        if (extractedComisionDocIds.has(doc.id)) continue
        const { data: file } = await sb.storage.from('documente').download(doc.fisier_path)
        if (!file) continue
        const bytes = Buffer.from(await file.arrayBuffer())
        let facturi: ComisionFacturaRow[] = []
        try { facturi = await extractInBatches(bytes, PAGES_PER_BATCH, b => extractComisionInvoices(b, platformaFixa)) }
        catch (err) { console.error('[5stardesk] extracție facturi comision eșuată pentru documentul', doc.id, doc.fisier_nume, err) }
        if (facturi.length) {
          await sb.from('comision_facturi').insert(facturi.map(f => ({
            luna_id: lunaId, firma_id: firmaId, document_id: doc.id, platforma: platformaFixa,
            numar_factura: f.numarFactura || '', cod_rezervare: f.codRezervare || '', suma: Number(f.suma) || null,
          })))
        }
      }
    }

    return NextResponse.json(await computeVerification(sb, lunaId))
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ totalRezervari: 0, totalFacturiClient: 0, totalFacturiComision: 0, faraFacturaClient: [], discrepanteClient: [], facturiFaraRezervare: [], faraComisionAirbnb: [], discrepanteComisionAirbnb: [], comisionBookingLipsa: false, totalRezervariBooking: 0 })
  const sb = getServiceSupabase()
  return NextResponse.json(await computeVerification(sb, lunaId))
}
