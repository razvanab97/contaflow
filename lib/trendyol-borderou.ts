import { citesteFoaieXlsx, type Celula } from '@/lib/xlsx-simplu'

// Borderoul Trendyol = „PaymentOrderDetail_<nr. ordin de plata>_<id vanzator>.xlsx” (Trendyol Seller
// Center → Plati). Foaia „Detail” are toate tranzactiile platii in lei: vanzari, retururi, reduceri,
// cupoane, comisionul Trendyol pe fiecare linie si facturile de taxe retinute (transport TYD etc.).
// Numarul ordinului de plata apare DOAR in numele fisierului si in descrierea incasarii din extras.

export type TipLinieTrendyol = 'vanzare' | 'retur' | 'reducere' | 'transport' | 'taxa' | 'ajustare'

export interface LinieTrendyol {
  nr: string                 // Transaction No (la taxe: numarul facturii, ex. TYD2026000270959)
  tipOriginal: string        // Transaction Type din Trendyol
  tip: TipLinieTrendyol
  comanda: string
  total: number              // Total Amount (pretul catre client)
  comision: number           // Trendyol Revenue (incl. TVA)
  vanzator: number           // Seller Revenue = ce primeste vanzatorul
  dataPlata: string | null   // AAAA-LL-ZZ
}

export interface BorderouTrendyol {
  ordinPlata: string | null
  valuta: string
  linii: LinieTrendyol[]
  totalVanzator: number
}

export function ordinPlataDinNume(nume: string) {
  return String(nume || '').match(/PaymentOrderDetail_(\d{6,})/i)?.[1] || null
}

function tipLinie(t: string): TipLinieTrendyol {
  const s = t.toLowerCase()
  if (s === 'sale') return 'vanzare'
  if (s === 'return') return 'retur'
  if (/^(discount|coupon|promotion)/.test(s)) return 'reducere'
  if (/shipping|cargo|delivery/.test(s)) return 'transport'
  if (/fee|invoice|penalty/.test(s)) return 'taxa'
  return 'ajustare' // CommissionPositive/Negative, SellerRevenue* - doar corectii de comision
}

const num = (v: Celula) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const dataRo = (v: Celula) => { const m = String(v ?? '').match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }

export async function citesteBorderouTrendyol(bytes: Uint8Array | ArrayBuffer, numeFisier = ''): Promise<BorderouTrendyol> {
  const randuri = await citesteFoaieXlsx(bytes, 'Detail').catch(() => citesteFoaieXlsx(bytes))
  const cap = (randuri[0] || []).map(c => String(c ?? '').trim())
  const ix = (k: string) => cap.indexOf(k)
  if (ix('Transaction Type') < 0 || ix('Seller Revenue') < 0) throw new Error('Nu pare un borderou Trendyol (PaymentOrderDetail)')
  const linii: LinieTrendyol[] = []
  for (const r of randuri.slice(1)) {
    if (!r || r[ix('Transaction No')] == null || r[ix('Transaction No')] === '') continue
    const tipOriginal = String(r[ix('Transaction Type')] ?? '')
    linii.push({
      nr: String(r[ix('Transaction No')] ?? ''),
      tipOriginal,
      tip: tipLinie(tipOriginal),
      comanda: String(r[ix('Order Number')] ?? ''),
      total: num(r[ix('Total Amount')]),
      comision: num(r[ix('Trendyol Revenue (including VAT)')]),
      vanzator: num(r[ix('Seller Revenue')]),
      dataPlata: dataRo(r[ix('Payment Date')]),
    })
  }
  const valuta = String(randuri[1]?.[ix('Currency')] ?? 'RON') || 'RON'
  const totalVanzator = Math.round(linii.reduce((s, l) => s + l.vanzator, 0) * 100) / 100
  return { ordinPlata: ordinPlataDinNume(numeFisier), valuta, linii, totalVanzator }
}
