import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { oblioToken } from '@/lib/oblio'

export const dynamic = 'force-dynamic'

// Emite in Oblio factura de cazare pentru o rezervare din ApartPro (butonul „Emite factură” din
// formularul rezervarii). Apelat DOAR server-to-server de ApartPro, cu secretul comun - fara UI aici.
// AB Textile SRL, seria RH (regim hotelier), data emiterii aleasa in ApartPro (implicit azi), trimisa automat in SPV.
// Clientul are tara / judet / localitate de domiciliu reale (completate la rezervare) - fara ele e-Factura nu trece.
// Suma = valoarea bruta a rezervarii = incasarea + comisionul Airbnb (verificat pe borderoul Airbnb).
const SETARI = {
  cif: '52575850',      // AB TEXTILE S.R.L. (neplatitoare de TVA)
  serie: 'RH',
  spvExtern: 1,
}

type Cerere = {
  rezervareId?: string
  canal?: string
  codRezervare?: string
  numeClient?: string
  telefon?: string | null
  email?: string | null
  apartament?: string
  checkin?: string
  checkout?: string
  nopti?: number
  persoane?: number
  suma?: number
  // data emiterii aleasa in ApartPro (YYYY-MM-DD, cel mult azi); lipsa = azi
  dataEmitere?: string
  // domiciliul clientului (cerut pentru e-Factura / SPV): tara, judet si localitate reale, din rezervare
  client?: { tara?: string; judet?: string; localitate?: string; adresa?: string }
}

function autorizat(req: NextRequest) {
  const secret = process.env.APARTPRO_FACTURARE_SECRET || ''
  const primit = req.headers.get('x-apartpro-secret') || ''
  if (!secret || primit.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(primit), Buffer.from(secret))
}

// Ultima factura din serie, direct din Oblio (cerut direct: „să știm să nu facturăm înapoi de ultima dată facturată -
// e interzis”): numerotarea unei serii trebuie sa fie cronologica, deci nicio factura noua cu data mai veche. Se citesc
// TOATE facturile seriei (pagini de 100, fara sa ne bazam pe ordinea intoarsa), inclusiv cele emise direct din Oblio si
// cele anulate (isi pastreaza numarul si data); ciornele nu au numar si nu conteaza.
type FacturaOblio = { seriesName?: string; number?: string | number; issueDate?: string; draft?: number | string | boolean }
async function ultimaFactura(token: string): Promise<{ data: string; numar: string } | null> {
  let ultima: { data: string; numar: string; nr: number } | null = null
  for (let offset = 0, pagini = 0; pagini < 100; offset += 100, pagini++) {
    const q = new URLSearchParams({ cif: SETARI.cif, seriesName: SETARI.serie, limitPerPage: '100', offset: String(offset), orderBy: 'issueDate', orderDir: 'DESC' })
    const res = await fetch(`https://www.oblio.eu/api/docs/invoice/list?${q}`, { headers: { Authorization: `Bearer ${token}` } })
    const out = await res.json().catch(() => ({})) as { status?: number; statusMessage?: string; data?: FacturaOblio[] }
    if (!res.ok || out.status !== 200 || !Array.isArray(out.data)) throw new Error(`Oblio (lista facturilor ${SETARI.serie}): ${out.statusMessage || `eroare ${res.status}`}`)
    for (const f of out.data) {
      if (f.draft && String(f.draft) !== '0') continue
      const d = String(f.issueDate || '').slice(0, 10)
      const nr = Number(String(f.number ?? '').replace(/\D/g, '')) || 0
      // la aceeasi data castiga numarul mai mare (raportat direct: RH 0001 si RH 0002 din 29.10 - aparea RH 0001)
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!ultima || d > ultima.data || (d === ultima.data && nr > ultima.nr))) ultima = { data: d, nr, numar: `${f.seriesName || SETARI.serie} ${f.number ?? ''}`.trim() }
    }
    if (out.data.length < 100) break
  }
  return ultima && { data: ultima.data, numar: ultima.numar }
}

// GET = ultima factura din seria RH (pentru ApartPro: se afiseaza la facturare si limiteaza data emiterii)
export async function GET(req: NextRequest) {
  if (!autorizat(req)) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  try {
    return NextResponse.json({ serie: SETARI.serie, ultima: await ultimaFactura(await oblioToken(SETARI.cif)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Nu am putut citi ultima factură' }, { status: 502 })
  }
}

const zi = (d: string) => { const [y, m, z] = d.split('-'); return `${z}.${m}.${y}` }
const CANAL: Record<string, string> = { airbnb: 'Airbnb', booking: 'Booking.com' }

export async function POST(req: NextRequest) {
  if (!autorizat(req)) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  const r = await req.json().catch(() => ({})) as Cerere

  const suma = Math.round(Number(r.suma) * 100) / 100
  const cod = String(r.codRezervare || '').trim()
  const lipsa = [
    !r.rezervareId && 'ID rezervare',
    !String(r.numeClient || '').trim() && 'numele clientului',
    !cod && 'codul rezervării de la platformă',
    !r.checkin && 'check-in',
    !r.checkout && 'check-out',
    !(suma > 0) && 'suma',
  ].filter(Boolean)
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
  const dataEmitere = String(r.dataEmitere || '').trim() || azi
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmitere) || isNaN(Date.parse(dataEmitere))) lipsa.push('data emiterii (format AAAA-LL-ZZ)')
  else if (dataEmitere > azi) lipsa.push('o dată de emitere care nu e în viitor')
  const tara = String(r.client?.tara || '').trim() || 'Romania'
  const judet = String(r.client?.judet || '').trim(), localitate = String(r.client?.localitate || '').trim(), adresa = String(r.client?.adresa || '').trim()
  const eRomania = /^rom[aâ]nia$/i.test(tara)
  if (eRomania && !judet) lipsa.push('județul clientului')
  if (!localitate) lipsa.push('localitatea clientului')
  if (lipsa.length) return NextResponse.json({ error: `Lipsește: ${lipsa.join(', ')}` }, { status: 400 })

  const platforma = CANAL[String(r.canal)] || String(r.canal || 'platformă')
  // Doar numele clientului si codul rezervarii (cerut direct: „prea multe detalii pe factură, e de ajuns să scrie numele
  // clientului care a făcut rezervarea și codul de pe Airbnb”) - fara apartament, perioada, nopti, persoane
  const descriere = `${String(r.numeClient).trim()} · rezervare ${platforma} ${cod}`

  try {
    const token = await oblioToken(SETARI.cif)
    // interzis: data emiterii inaintea ultimei facturi din serie (daca lista nu se poate citi, NU emitem)
    const ultima = await ultimaFactura(token)
    if (ultima && dataEmitere < ultima.data) {
      return NextResponse.json({ error: `Data emiterii ${zi(dataEmitere)} e înaintea ultimei facturi ${ultima.numar} din ${zi(ultima.data)}. Nu se poate factura în urmă — alege ${zi(ultima.data)} sau o dată ulterioară.`, ultima }, { status: 400 })
    }
    const body = {
      cif: SETARI.cif,
      seriesName: SETARI.serie,
      issueDate: dataEmitere,
      language: 'RO',
      currency: 'RON',
      spvExtern: SETARI.spvExtern,
      // Aceeasi rezervare nu poate fi facturata de doua ori, chiar daca butonul e apasat repetat
      idempotencyKey: `apartpro-rez-${r.rezervareId}`,
      client: {
        name: String(r.numeClient).trim(),
        country: eRomania ? 'Romania' : tara,
        ...(judet ? { state: judet } : {}),
        city: localitate,
        ...(adresa ? { address: adresa } : {}),
        ...(r.telefon ? { phone: r.telefon } : {}),
        ...(r.email ? { email: r.email } : {}),
        save: 0,
      },
      products: [{
        // denumirea (cerut direct: „să rămână doar «servicii conform platformă»”); descrierea = client + codul rezervarii
        name: 'Servicii conform platformă',
        description: descriere,
        price: suma,
        quantity: 1,
        measuringUnit: 'buc',
        productType: 'Serviciu',
        vatName: 'SFDD',
        vatPercentage: 0,
        vatIncluded: 1,
        save: 0,
      }],
    }
    const res = await fetch('https://www.oblio.eu/api/docs/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const out = await res.json().catch(() => ({})) as { status?: number; statusMessage?: string; data?: { seriesName?: string; number?: string; link?: string } }
    if (!res.ok || out.status !== 200 || !out.data?.number) {
      return NextResponse.json({ error: `Oblio: ${out.statusMessage || `eroare ${res.status}`}` }, { status: 502 })
    }
    return NextResponse.json({ serie: out.data.seriesName, numar: out.data.number, link: out.data.link || null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Emiterea facturii a eșuat' }, { status: 500 })
  }
}
