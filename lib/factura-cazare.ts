import type { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { toateFacturile, SETARI_RH } from '@/lib/oblio-rh'

// Comun pentru rutele ApartPro de facturare cazare (emitere + stornare): secretul comun si ultima factura din seria RH
const SETARI = SETARI_RH

export function autorizat(req: NextRequest) {
  const secret = process.env.APARTPRO_FACTURARE_SECRET || ''
  const primit = req.headers.get('x-apartpro-secret') || ''
  if (!secret || primit.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(primit), Buffer.from(secret))
}

// Ultima factura din serie, direct din Oblio (cerut direct: „să știm să nu facturăm înapoi de ultima dată facturată -
// e interzis”): numerotarea unei serii trebuie sa fie cronologica, deci nicio factura noua cu data mai veche. Se citesc
// TOATE facturile seriei (pagini de 100, fara sa ne bazam pe ordinea intoarsa), inclusiv cele emise direct din Oblio si
// cele anulate (isi pastreaza numarul si data); ciornele nu au numar si nu conteaza.
export async function ultimaFactura(token: string): Promise<{ data: string; numar: string } | null> {
  let ultima: { data: string; numar: string; nr: number } | null = null
  for (const f of await toateFacturile(token)) {
    if (f.draft && String(f.draft) !== '0') continue
    const d = String(f.issueDate || '').slice(0, 10)
    const nr = Number(String(f.number ?? '').replace(/\D/g, '')) || 0
    // la aceeasi data castiga numarul mai mare (raportat direct: RH 0001 si RH 0002 din 29.10 - aparea RH 0001)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!ultima || d > ultima.data || (d === ultima.data && nr > ultima.nr))) ultima = { data: d, nr, numar: `${f.seriesName || SETARI.serie} ${f.number ?? ''}`.trim() }
  }
  return ultima && { data: ultima.data, numar: ultima.numar }
}
