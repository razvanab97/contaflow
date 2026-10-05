import { cursuriBnr } from '@/lib/curs-bnr'
import { regulaAutomata } from '@/lib/tranzactii-reguli'

export interface TxFlux { data_tranzactie: string | null; tip: string | null; suma: number | string | null; valuta: string | null; descriere?: string | null; descriere_curatata?: string | null }

// Imprumuturile firmei de la asociat: intrari = imprumut primit (incasare cu "imprumut"), iesiri =
// restituire imprumut + avans trezorerie (plati cu aceste mentiuni). Platile catre Trezorerie pentru
// taxe ("Trezorerie Harlau", "Trezorerie Mun Iasi TVA") NU intra - regula cere explicit "avans trezorerie".
export type TipImprumut = 'primit' | 'restituire' | 'avans_trezorerie'
export function tipImprumut(t: { tip?: string | null; descriere?: string | null; descriere_curatata?: string | null }): TipImprumut | null {
  const s = `${t.descriere_curatata || ''} ${t.descriere || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (t.tip === 'debit') {
    if (/restituire\s*imprumut/.test(s)) return 'restituire'
    if (/avans\s*(de\s*)?trezorerie/.test(s)) return 'avans_trezorerie'
    return null
  }
  if (t.tip === 'credit' && /imprumut/.test(s) && !/restituire/.test(s)) return 'primit'
  return null
}
export interface Imprumut { primit: number; restituire: number; avansTrezorerie: number; net: number; numar: number }

// Incasarile reale ale lunii (in lei, curs BNR): fara imprumuturi de la asociat si fara schimburi valutare
// intre conturile proprii - pe surse: eMAG (inclusiv Heyblu, eMAG BG/HU, Dante), Trendyol, alte incasari.
export interface IncasariReale { emag: number; trendyol: number; alte: number; total: number; alteLista: { data: string; suma: number; platitor: string }[] }
const RE_EMAG = /emag|dante international|heyblu/i
const RE_TRENDYOL = /trendyol/i
function platitorDin(d: string) {
  // extrasele BT: „...;NUME PLATITOR;IBAN;BIC;” - numele e campul dinaintea IBAN-ului
  const parti = d.split(';').map(x => x.trim()).filter(Boolean)
  const iIban = parti.findIndex(x => /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(x))
  return (iIban > 0 ? parti[iIban - 1] : parti[0] || '').slice(0, 60)
}

export interface FluxMoneda { incasari: number; plati: number; net: number; schimbIn: number; schimbOut: number; numar: number; cursMediu: number | null; imprumut: Imprumut }
export interface FluxLunar {
  peMoneda: Record<string, FluxMoneda>          // miscarile reale din fiecare cont (ca in extras)
  consolidat: { incasari: number; plati: number; net: number; schimbExclus: number; imprumut: Imprumut; incasariReale: IncasariReale } // echivalent lei, fara schimburi valutare
  faraCurs: number                               // tranzactii in valuta pentru care nu s-a gasit curs
  cursIndisponibil: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

// Fluxul bancar al unei luni din TOATE conturile (RON, EUR, ...):
//  - pe fiecare moneda, sumele exact ca in extras (inclusiv schimburile valutare - se reconciliaza cu banca);
//  - consolidat in lei, fiecare tranzactie in valuta convertita la cursul BNR din ziua ei. Schimburile
//    valutare intre conturile proprii sunt EXCLUSE din consolidat: aceiasi bani ar aparea o data ca plata
//    in EUR si o data ca incasare in RON, umfland ambele totaluri.
export async function calculeazaFlux(txs: TxFlux[]): Promise<FluxLunar> {
  const valide = txs.filter(t => t.data_tranzactie && (t.tip === 'credit' || t.tip === 'debit') && Number.isFinite(Number(t.suma)))
  let curs: ((d: string, v: string) => number | null) | null = null
  let cursIndisponibil = false
  if (valide.some(t => (t.valuta || 'RON').toUpperCase() !== 'RON')) {
    try { curs = await cursuriBnr(valide.map(t => String(t.data_tranzactie))) } catch { cursIndisponibil = true }
  }
  const gol = (): Imprumut => ({ primit: 0, restituire: 0, avansTrezorerie: 0, net: 0, numar: 0 })
  const adauga = (i: Imprumut, tip: TipImprumut, suma: number) => {
    i.numar++
    if (tip === 'primit') i.primit += suma
    else if (tip === 'restituire') i.restituire += suma
    else i.avansTrezorerie += suma
  }
  const peMoneda: Record<string, FluxMoneda & { _lei: number; _val: number }> = {}
  const cons = { incasari: 0, plati: 0, schimbExclus: 0, imprumut: gol() }
  const reale = { emag: 0, trendyol: 0, alte: 0, alteLista: [] as IncasariReale['alteLista'] }
  let faraCurs = 0
  for (const t of valide) {
    const v = (t.valuta || 'RON').toUpperCase()
    const suma = Math.abs(Number(t.suma))
    const m = (peMoneda[v] ||= { incasari: 0, plati: 0, net: 0, schimbIn: 0, schimbOut: 0, numar: 0, cursMediu: null, imprumut: gol(), _lei: 0, _val: 0 })
    const schimb = regulaAutomata(t) === 'schimb_valutar'
    const imp = schimb ? null : tipImprumut(t)
    if (imp) adauga(m.imprumut, imp, suma)
    m.numar++
    if (t.tip === 'credit') { m.incasari += suma; if (schimb) m.schimbIn += suma } else { m.plati += suma; if (schimb) m.schimbOut += suma }
    const k = v === 'RON' ? 1 : curs ? curs(String(t.data_tranzactie), v) : null
    if (k == null) { faraCurs++; continue }
    if (v !== 'RON') { m._lei += suma * k; m._val += suma }
    if (schimb) { cons.schimbExclus += suma * k; continue }
    if (imp) adauga(cons.imprumut, imp, suma * k)
    if (t.tip === 'credit') {
      cons.incasari += suma * k
      if (!imp) {
        const d = `${t.descriere_curatata || ''} ${t.descriere || ''}`
        if (RE_EMAG.test(d)) reale.emag += suma * k
        else if (RE_TRENDYOL.test(d)) reale.trendyol += suma * k
        else { reale.alte += suma * k; reale.alteLista.push({ data: String(t.data_tranzactie), suma: r2(suma * k), platitor: platitorDin(t.descriere || t.descriere_curatata || '') }) }
      }
    }
    else cons.plati += suma * k
  }
  const finImp = (i: Imprumut): Imprumut => ({ primit: r2(i.primit), restituire: r2(i.restituire), avansTrezorerie: r2(i.avansTrezorerie), net: r2(i.primit - i.restituire - i.avansTrezorerie), numar: i.numar })
  const out: Record<string, FluxMoneda> = {}
  for (const [v, m] of Object.entries(peMoneda)) {
    out[v] = { incasari: r2(m.incasari), plati: r2(m.plati), net: r2(m.incasari - m.plati), schimbIn: r2(m.schimbIn), schimbOut: r2(m.schimbOut), numar: m.numar, cursMediu: m._val ? Math.round((m._lei / m._val) * 10000) / 10000 : null, imprumut: finImp(m.imprumut) }
  }
  return {
    peMoneda: out,
    consolidat: {
      incasari: r2(cons.incasari), plati: r2(cons.plati), net: r2(cons.incasari - cons.plati), schimbExclus: r2(cons.schimbExclus), imprumut: finImp(cons.imprumut),
      incasariReale: { emag: r2(reale.emag), trendyol: r2(reale.trendyol), alte: r2(reale.alte), total: r2(reale.emag + reale.trendyol + reale.alte), alteLista: reale.alteLista },
    },
    faraCurs, cursIndisponibil,
  }
}
