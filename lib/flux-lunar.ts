import { cursuriBnr } from '@/lib/curs-bnr'
import { regulaAutomata } from '@/lib/tranzactii-reguli'

export interface TxFlux { data_tranzactie: string | null; tip: string | null; suma: number | string | null; valuta: string | null; descriere?: string | null; descriere_curatata?: string | null }

export interface FluxMoneda { incasari: number; plati: number; net: number; schimbIn: number; schimbOut: number; numar: number; cursMediu: number | null }
export interface FluxLunar {
  peMoneda: Record<string, FluxMoneda>          // miscarile reale din fiecare cont (ca in extras)
  consolidat: { incasari: number; plati: number; net: number; schimbExclus: number } // echivalent lei, fara schimburi valutare
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
  const peMoneda: Record<string, FluxMoneda & { _lei: number; _val: number }> = {}
  const cons = { incasari: 0, plati: 0, schimbExclus: 0 }
  let faraCurs = 0
  for (const t of valide) {
    const v = (t.valuta || 'RON').toUpperCase()
    const suma = Math.abs(Number(t.suma))
    const m = (peMoneda[v] ||= { incasari: 0, plati: 0, net: 0, schimbIn: 0, schimbOut: 0, numar: 0, cursMediu: null, _lei: 0, _val: 0 })
    const schimb = regulaAutomata(t) === 'schimb_valutar'
    m.numar++
    if (t.tip === 'credit') { m.incasari += suma; if (schimb) m.schimbIn += suma } else { m.plati += suma; if (schimb) m.schimbOut += suma }
    const k = v === 'RON' ? 1 : curs ? curs(String(t.data_tranzactie), v) : null
    if (k == null) { faraCurs++; continue }
    if (v !== 'RON') { m._lei += suma * k; m._val += suma }
    if (schimb) { cons.schimbExclus += suma * k; continue }
    if (t.tip === 'credit') cons.incasari += suma * k
    else cons.plati += suma * k
  }
  const out: Record<string, FluxMoneda> = {}
  for (const [v, m] of Object.entries(peMoneda)) {
    out[v] = { incasari: r2(m.incasari), plati: r2(m.plati), net: r2(m.incasari - m.plati), schimbIn: r2(m.schimbIn), schimbOut: r2(m.schimbOut), numar: m.numar, cursMediu: m._val ? Math.round((m._lei / m._val) * 10000) / 10000 : null }
  }
  return {
    peMoneda: out,
    consolidat: { incasari: r2(cons.incasari), plati: r2(cons.plati), net: r2(cons.incasari - cons.plati), schimbExclus: r2(cons.schimbExclus) },
    faraCurs, cursIndisponibil,
  }
}
