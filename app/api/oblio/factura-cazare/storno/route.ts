import { NextRequest, NextResponse } from 'next/server'
import { tokenRefuzat } from '@/lib/oblio'
import { cuToken, TokenExpirat, SETARI_RH } from '@/lib/oblio-rh'
import { autorizat, ultimaFactura } from '@/lib/factura-cazare'

export const dynamic = 'force-dynamic'

// Stornarea unei facturi de cazare emise din ApartPro (cerut direct: „așa cum avem funcția de facturare, să avem și
// funcția de stornare a unei facturi deja emise pe o rezervare anume”). Apelat DOAR server-to-server de ApartPro, cu
// secretul comun. In Oblio: factura noua in seria RH cu referenceDocument (refund: 1) = storno total al facturii
// originale (cu minus, acelasi client), trimisa automat in SPV ca si factura. Data stornarii = azi (sau cea aleasa),
// niciodata inaintea ultimei facturi din serie (numerotarea seriei e cronologica).
const zi = (d: string) => { const [y, m, z] = d.split('-'); return `${z}.${m}.${y}` }

export async function POST(req: NextRequest) {
  if (!autorizat(req)) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  const r = await req.json().catch(() => ({})) as { rezervareId?: string; serie?: string; numar?: string; dataEmitere?: string }
  const serie = String(r.serie || '').trim(), numar = String(r.numar || '').trim()
  if (!r.rezervareId || !numar) return NextResponse.json({ error: 'Lipsește factura de stornat' }, { status: 400 })
  if (serie && serie !== SETARI_RH.serie) return NextResponse.json({ error: `Din ApartPro se pot storna doar facturile din seria ${SETARI_RH.serie}` }, { status: 400 })
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
  const dataEmitere = String(r.dataEmitere || '').trim() || azi
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmitere) || dataEmitere > azi) return NextResponse.json({ error: 'Data stornării trebuie să fie azi sau în trecut (AAAA-LL-ZZ)' }, { status: 400 })
  try {
    const ultima = await cuToken(ultimaFactura)
    if (ultima && dataEmitere < ultima.data) {
      return NextResponse.json({ error: `Data stornării ${zi(dataEmitere)} e înaintea ultimei facturi ${ultima.numar} din ${zi(ultima.data)}. Alege ${zi(ultima.data)} sau o dată ulterioară.`, ultima }, { status: 400 })
    }
    const body = {
      cif: SETARI_RH.cif,
      seriesName: SETARI_RH.serie,
      issueDate: dataEmitere,
      spvExtern: 1,
      // aceeasi factura nu poate fi stornata de doua ori, chiar daca butonul e apasat repetat
      idempotencyKey: `apartpro-storno-${SETARI_RH.serie}-${numar}`,
      referenceDocument: { type: 'Factura', seriesName: SETARI_RH.serie, number: numar, refund: 1 },
    }
    type Rasp = { status?: number; statusMessage?: string; data?: { seriesName?: string; number?: string; link?: string } }
    const { res, out } = await cuToken(async token => {
      const res = await fetch('https://www.oblio.eu/api/docs/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const out = await res.json().catch(() => ({})) as Rasp
      if (tokenRefuzat(res.status, out.statusMessage)) throw new TokenExpirat(out.statusMessage || 'token expirat')
      return { res, out }
    })
    if (!res.ok || out.status !== 200 || !out.data?.number) {
      return NextResponse.json({ error: `Oblio: ${out.statusMessage || `eroare ${res.status}`}` }, { status: 502 })
    }
    return NextResponse.json({ serie: out.data.seriesName, numar: out.data.number, link: out.data.link || null, data: dataEmitere })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Stornarea a eșuat' }, { status: 500 })
  }
}
