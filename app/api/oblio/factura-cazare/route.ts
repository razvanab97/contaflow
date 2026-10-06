import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { oblioToken } from '@/lib/oblio'

export const dynamic = 'force-dynamic'

// Emite in Oblio factura de cazare pentru o rezervare din ApartPro (butonul „Emite factură” din
// formularul rezervarii). Apelat DOAR server-to-server de ApartPro, cu secretul comun - fara UI aici.
// AB Textile SRL, seria RH (regim hotelier), data emiterii = ziua emiterii, trimisa automat in SPV.
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
}

function autorizat(req: NextRequest) {
  const secret = process.env.APARTPRO_FACTURARE_SECRET || ''
  const primit = req.headers.get('x-apartpro-secret') || ''
  if (!secret || primit.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(primit), Buffer.from(secret))
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
  if (lipsa.length) return NextResponse.json({ error: `Lipsește: ${lipsa.join(', ')}` }, { status: 400 })

  const platforma = CANAL[String(r.canal)] || String(r.canal || 'platformă')
  const nopti = Number(r.nopti) || 0
  const descriere = [
    r.apartament,
    `${zi(r.checkin!)} – ${zi(r.checkout!)}${nopti ? ` (${nopti} ${nopti === 1 ? 'noapte' : 'nopți'})` : ''}`,
    r.persoane ? `${r.persoane} ${Number(r.persoane) === 1 ? 'persoană' : 'persoane'}` : '',
    `rezervare ${platforma} ${cod}`,
  ].filter(Boolean).join(' · ')

  try {
    const token = await oblioToken(SETARI.cif)
    const body = {
      cif: SETARI.cif,
      seriesName: SETARI.serie,
      issueDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }),
      language: 'RO',
      currency: 'RON',
      spvExtern: SETARI.spvExtern,
      mentions: `Rezervare ${platforma}: ${cod}`,
      // Aceeasi rezervare nu poate fi facturata de doua ori, chiar daca butonul e apasat repetat
      idempotencyKey: `apartpro-rez-${r.rezervareId}`,
      client: {
        name: String(r.numeClient).trim(),
        ...(r.telefon ? { phone: r.telefon } : {}),
        ...(r.email ? { email: r.email } : {}),
        save: 0,
      },
      products: [{
        name: 'Servicii de cazare',
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
