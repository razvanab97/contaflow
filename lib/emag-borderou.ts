import { citesteFoaieXlsx, type Celula } from '@/lib/xlsx-simplu'

// Borderourile eMAG (Marketplace → Financiar), recunoscute dupa coloane:
//  - DP  „ab_homes_invest_dp_<DP ID>_<zz_ll_aaaa>.xlsx” = desfasuratorul unei plati: cate unul pentru
//        CASH (ramburs: COD Cashing, Courier retain…) si unul pentru CARD (CO Cashing, Refund CO), pe
//        fiecare jumatate de luna. „Payout date” = data borderoului.
//  - DC  „ab_homes_invest_dc_<llaaaa>_….xlsx” = decontul lunar al comisionului, pe comenzi (Comision Net
//        fara TVA - suma cu TVA e factura de comision din aviz).
//  - Account statement „account_statement_details_<data>.xlsx” = extrasul de cont eMAG: documentele
//        compensate pe fiecare aviz (Clearing document = numarul avizului).

export type TipBorderouEmag = 'dp_cash' | 'dp_card' | 'dc' | 'extras_cont'
export const ETICHETA_BORDEROU_EMAG: Record<TipBorderouEmag, string> = {
  dp_cash: 'Desfășurător plată · cash (ramburs)',
  dp_card: 'Desfășurător plată · card',
  dc: 'Decont comision lunar',
  extras_cont: 'Extras de cont eMAG',
}

export interface BorderouEmag {
  tip: TipBorderouEmag
  id: string                       // DP ID / Sheet ID / data extrasului
  data: string | null              // data borderoului (pentru eCap)
  perioada: string | null          // ex. „16.08–31.08.2026” sau „august 2026”
  total: number                    // totalul documentului: suma tuturor liniilor (DP), comisionul cu TVA (DC), totalul compensat (extras)
  incasari?: number                // doar DP: partea care apare in aviz (cash: ramburs - rambursari; card: card - rambursari + eCredit)
  detalii: Record<string, number>  // pe tip de linie
  linii: number
  // doar la extras: totalul compensat pe fiecare aviz
  peAviz?: Record<string, number>
  platforma?: string | null        // eMAG RO / BG / HU (la extras scrie in fisier; la DP/DC reiese din avizul potrivit)
}

export function platformaDinTaskKey(taskKey: string) {
  const m = taskKey.match(/emag\.aviz_(ro|bg|hu|heyblu)_/)
  return m ? `eMAG ${m[1] === 'heyblu' ? 'RO' : m[1].toUpperCase()}` : null
}

const num = (v: Celula) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100
const zi = (iso: string) => iso.split('-').reverse().join('.')
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']

function tabel(randuri: Celula[][]) {
  const cap = (randuri[0] || []).map(c => String(c ?? '').trim())
  const ix = (k: string) => cap.indexOf(k)
  return { cap, ix, date: randuri.slice(1).filter(r => r && r.some(c => c != null && String(c).trim() !== '')) }
}

export async function citesteBorderouEmag(bytes: Uint8Array | ArrayBuffer, numeFisier = ''): Promise<BorderouEmag> {
  const { cap, ix, date } = tabel(await citesteFoaieXlsx(bytes))

  if (cap.includes('DP ID') && cap.includes('Fraction type')) {
    const detalii: Record<string, number> = {}
    for (const r of date) {
      const t = String(r[ix('Fraction type')] ?? '').trim()
      if (!t) continue
      detalii[t] = r2((detalii[t] || 0) + num(r[ix('Fraction value')]))
    }
    const tipuri = Object.keys(detalii)
    // CARD: CO Cashing, Refund CO, eCredit cashing (rate) · CASH: COD Cashing, Refund COD, Courier retain…
    const RE_CARD = /^CO Cashing$|^Refund CO$|eCredit/i
    const RE_CASH = /^COD Cashing$|^Refund COD$/i
    const card = tipuri.some(t => RE_CARD.test(t)) && !tipuri.some(t => /COD/i.test(t))
    // suma platita pentru vanzari (= randul din aviz): card = incasari card - rambursari card + eCredit
    // (+ Heyblu, platit separat); cash = incasari ramburs - rambursari ramburs. Retinerile curier din DP
    // cash nu intra aici - in aviz apar separat, ca „Retineri curier”.
    const incasari = r2(tipuri.filter(t => (card ? RE_CARD : RE_CASH).test(t)).reduce((s, t) => s + detalii[t], 0))
    // totalul borderoului = toate liniile lui (inclusiv retinerile / restituirile curier din DP cash)
    const total = r2(tipuri.reduce((s, t) => s + detalii[t], 0))
    const r0 = date[0] || []
    const data = String(r0[ix('Payout date')] ?? '').slice(0, 10) || null
    const ps = String(r0[ix('Reference period start')] ?? '').slice(0, 10), pe = String(r0[ix('Reference period end')] ?? '').slice(0, 10)
    return {
      tip: card ? 'dp_card' : 'dp_cash', id: String(r0[ix('DP ID')] ?? numeFisier.match(/_dp_(\d+)/)?.[1] ?? ''),
      data, perioada: ps && pe ? `${zi(ps).slice(0, 5)}–${zi(pe)}` : null, total, incasari, detalii, linii: date.length,
    }
  }

  if (cap.includes('Comision Net') && cap.includes('Valoare produse')) {
    // randul 2 e TOTAL-ul eMAG (fara luna) - doar randurile pe comenzi, cu luna completata
    const rows = date.filter(r => String(r[ix('Luna')] ?? '').trim() !== '' && !r.some(c => String(c ?? '').trim().toUpperCase() === 'TOTAL'))
    const sum = (k: string) => r2(rows.reduce((s, r) => s + num(r[ix(k)]), 0))
    const comisionNet = sum('Comision Net')
    const luna = String(rows[0]?.[ix('Luna')] ?? '').trim().toLowerCase()
    const m = luna.match(/([a-zăâîșț]+)\s+(\d{4})/)
    const li = m ? LUNI.indexOf(m[1]) : -1
    const data = li >= 0 ? new Date(Date.UTC(Number(m![2]), li + 1, 0)).toISOString().slice(0, 10) : null
    return {
      tip: 'dc', id: String(rows[0]?.[ix('Sheet ID')] ?? numeFisier.match(/_dc_(\d+)/)?.[1] ?? ''),
      data, perioada: luna || null, total: r2(comisionNet * 1.21),
      detalii: { 'Valoare produse': sum('Valoare produse'), 'Comision net (fără TVA)': comisionNet, 'Vouchere': sum('Valoare vouchere') },
      linii: rows.length,
    }
  }

  if (cap.includes('Clearing document') && cap.includes('Document amount')) {
    const detalii: Record<string, number> = {}
    const peAviz: Record<string, number> = {}
    let n = 0
    for (const r of date) {
      const tipDoc = String(r[ix('Document type')] ?? '').trim()
      if (!tipDoc) continue
      n++
      const v = num(r[ix('Document amount')])
      detalii[tipDoc] = r2((detalii[tipDoc] || 0) + v)
      const cl = String(r[ix('Clearing document')] ?? '').trim()
      if (cl && /compensare la payout/i.test(tipDoc)) peAviz[cl] = r2((peAviz[cl] || 0) + v)
    }
    const data = numeFisier.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null
    // „MKTP eMAG RO” -> eMAG RO; ID-ul extrasului = platforma: un extras nou al aceleiasi platforme il inlocuieste pe cel vechi
    const pl = String(date.find(r => r[ix('Marketplace Platform')])?.[ix('Marketplace Platform')] ?? '').match(/eMAG\s*(RO|BG|HU)/i)?.[1]?.toUpperCase()
    const platforma = pl ? `eMAG ${pl}` : null
    return {
      tip: 'extras_cont', id: platforma || 'eMAG', data, perioada: null,
      total: r2(Object.values(peAviz).reduce((s, v) => s + v, 0)), detalii, linii: n, peAviz, platforma,
    }
  }

  throw new Error('Nu am recunoscut fișierul ca borderou eMAG (desfășurător plată DP, decont comision DC sau extras de cont)')
}
