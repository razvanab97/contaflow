// Reguli pentru tranzactiile care NU au nevoie de document justificativ si motivele de ignorare.
//
// Standardul stabilit (sarite automat la import / la deschiderea Extrasului de cont):
//   - comisioane bancare
//   - schimburi valutare
//   - incasari de la Booking, Airbnb si eMAG (justificate de borderou / avizul de plata)
// Orice altceva ramane decizia utilizatorului. Cand e ignorata manual, tranzactia primeste un motiv;
// o CHELTUIALA ignorata fara motiv justificat e semnalata ca risc (lipseste documentul).

export type MotivIgnorare =
  | 'comision' | 'schimb_valutar' | 'incasare_platforma'
  | 'transfer_propriu' | 'asociat' | 'impozit' | 'salariu' | 'altul'

export const MOTIVE_IGNORARE: { key: MotivIgnorare; label: string; scurt: string }[] = [
  { key: 'comision', label: 'Comision bancar', scurt: 'Comision' },
  { key: 'schimb_valutar', label: 'Schimb valutar', scurt: 'Schimb valutar' },
  { key: 'incasare_platforma', label: 'Încasare platformă (Booking/Airbnb/eMAG)', scurt: 'Încasare platformă' },
  { key: 'transfer_propriu', label: 'Transfer între conturi / firme proprii', scurt: 'Transfer propriu' },
  { key: 'asociat', label: 'Asociat (împrumut, avans, restituire)', scurt: 'Asociat' },
  { key: 'impozit', label: 'Plată impozite / taxe (în Plată impozite)', scurt: 'Impozit' },
  { key: 'salariu', label: 'Salariu / contribuții (în stat de plată)', scurt: 'Salariu' },
  { key: 'altul', label: 'Altul — fără document', scurt: 'Altul' },
]
export const MOTIV_LABEL: Record<string, string> = Object.fromEntries(MOTIVE_IGNORARE.map(m => [m.key, m.scurt]))

// Motive care justifica o cheltuila fara factura. "altul" sau lipsa motivului => de verificat.
const MOTIVE_JUSTIFICATE = new Set<string>(['comision', 'schimb_valutar', 'incasare_platforma', 'transfer_propriu', 'asociat', 'impozit', 'salariu'])

export interface TxPentruReguli { descriere?: string | null; descriere_curatata?: string | null; tip?: string | null; categorie?: string | null }

function text(t: TxPentruReguli) {
  return `${t.descriere_curatata || ''} ${t.descriere || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Include si taxele bancare recurente (pachet de cont, rapoarte, alerte SMS) - tot costuri ale bancii.
const RE_COMISION = /\bcomision\b|\bcomisioane\b|\bcommission\b|taxa (de )?administrare|taxa rapoarte|abonament (cont|pachet|bt)|pachet pj|cost(uri)? (pachet|cont)\b|notificari prin sms|\bbt alert\b/
const RE_SCHIMB = /schimb valutar|\bexchange\b|conversie valutar|\bfx\b.*(ron|eur|usd)/
const RE_PLATFORME = /booking\.?com|\bairbnb\b|\bemag\b|dante international/

// Regula STANDARD (sarire automata). Intoarce motivul sau null.
export function regulaAutomata(t: TxPentruReguli): MotivIgnorare | null {
  const s = text(t)
  if (!s.trim()) return null
  if (t.tip !== 'credit' && RE_COMISION.test(s)) return 'comision'
  if (RE_SCHIMB.test(s)) return 'schimb_valutar'
  if (t.tip === 'credit' && RE_PLATFORME.test(s)) return 'incasare_platforma'
  return null
}

// Motivul propus cand utilizatorul ignora manual (pre-selectat, se poate schimba). Mai larg decat
// regula automata - aici doar sugeram, nu decidem singuri.
export function motivSugerat(t: TxPentruReguli, numeFirmeProprii: string[] = []): MotivIgnorare | null {
  const auto = regulaAutomata(t)
  if (auto) return auto
  const s = text(t)
  if (/trezorerie|\banaf\b|d\.?g\.?r\.?f\.?p|\bimpozit|\bcas\b|\bcass\b|\btva\b/.test(s)) return 'impozit'
  if (/imprumut|avans trezorerie|restituire|aport|\bdividend/.test(s)) return 'asociat'
  if (t.categorie === 'angajat' || /salariu|\bsalar|stat de plata/.test(s)) return 'salariu'
  if (t.categorie === 'transfer') return 'transfer_propriu'
  for (const n of numeFirmeProprii) {
    const k = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(s\.?r\.?l\.?|srl)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').trim()
    if (k.length >= 4 && s.replace(/[^a-z0-9 ]/g, ' ').includes(k)) return 'transfer_propriu'
  }
  return null
}

type TxIgnorata = TxPentruReguli & { note?: string | null; document_id?: string | null; motiv_ignorare?: string | null }

// Motivul efectiv al unei tranzactii ignorate: cel salvat, iar pentru tranzactiile ignorate inainte
// de existenta motivelor (sau fara migrare), cel dedus din reguli.
export function motivEfectiv(t: TxIgnorata, numeFirmeProprii: string[] = []): string | null {
  if (t.note !== 'na') return null
  return t.motiv_ignorare || motivSugerat(t, numeFirmeProprii)
}

// O cheltuiala (debit) ignorata fara motiv justificat = lipseste probabil documentul.
export function ignorareDeVerificat(t: TxIgnorata, numeFirmeProprii: string[] = []) {
  if (t.note !== 'na' || t.document_id || t.tip !== 'debit') return false
  const m = motivEfectiv(t, numeFirmeProprii)
  return !m || !MOTIVE_JUSTIFICATE.has(m)
}
