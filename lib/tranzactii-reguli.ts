// Reguli pentru tranzactiile care NU au nevoie de document justificativ si motivele de ignorare.
//
// REGULI CLARE - sarite automat (la import / la deschiderea Extrasului de cont), cu motivul lor;
// oricare se poate reactiva cu un click:
//   1. comisioane si taxe bancare (pachet de cont, SMS, rapoarte)                -> 'comision'
//   2. schimburi valutare                                                       -> 'schimb_valutar'
//   3. incasari de la Booking, Airbnb, eMAG (justificate de borderou / aviz)     -> 'incasare_platforma'
//   4. chirie platita unei persoane fizice ("... chirie ..." fara SRL/SA/PFA)    -> 'chirie' (fara document)
//   5. impozite si taxe catre Trezorerie / ANAF / DGRFP / "impozit"             -> 'impozit'
// Platile intre firmele proprii NU se sar: se fac pe baza de factura, care trebuie atasata.
//
// Reguli pentru documente (in lib/inbox-facturi.ts si lib/tranzactii-potrivire.ts):
//   - factura in valuta ramane salvata in moneda ei (ex. 18 EUR); echivalentul in lei se calculeaza la
//     cursul BNR din ziua facturii si se potriveste cu plata in lei daca: suma platita e intre -2% si
//     +6% fata de echivalentul BNR (marja bancii la plata cu cardul), furnizorul apare in descrierea
//     platii si plata e la cel mult 7-10 zile de factura;
//   - factura fara firma noastra pe ea (ex. utilitati pe numele chiriasului) merge la firma care are in
//     extras plata catre acel furnizor, cu aceeasi suma si data apropiata - doar daca e o singura firma;
//   - o factura de mai multe pagini cu acelasi numar ramane UN document (nu se imparte pe pagini);
//   - doua tranzactii identice in acelasi extras raman amandoua: sunt plati reale, nu dubluri de import.
//
// Orice altceva ramane decizia utilizatorului. Cand e ignorata manual, tranzactia primeste un motiv;
// o CHELTUIALA ignorata fara motiv justificat e semnalata ca risc (lipseste documentul).

export type MotivIgnorare =
  | 'comision' | 'schimb_valutar' | 'incasare_platforma'
  | 'transfer_propriu' | 'asociat' | 'impozit' | 'chirie' | 'salariu' | 'bon_fizic' | 'document_fizic' | 'altul'

export const MOTIVE_IGNORARE: { key: MotivIgnorare; label: string; scurt: string }[] = [
  { key: 'comision', label: 'Comision bancar', scurt: 'Comision' },
  { key: 'schimb_valutar', label: 'Schimb valutar', scurt: 'Schimb valutar' },
  { key: 'incasare_platforma', label: 'Încasare platformă (Booking/Airbnb/eMAG)', scurt: 'Încasare platformă' },
  { key: 'transfer_propriu', label: 'Transfer între conturi / firme proprii', scurt: 'Transfer propriu' },
  { key: 'asociat', label: 'Asociat (împrumut, avans, restituire)', scurt: 'Asociat' },
  { key: 'impozit', label: 'Plată impozite / taxe (în Plată impozite)', scurt: 'Impozit' },
  { key: 'chirie', label: 'Chirie către persoană fizică', scurt: 'Chirie' },
  { key: 'salariu', label: 'Salariu / contribuții (în stat de plată)', scurt: 'Salariu' },
  { key: 'bon_fizic', label: 'Bon fizic (păstrat pe hârtie)', scurt: 'Bon fizic' },
  { key: 'document_fizic', label: 'Factură / chitanță fizică (pe hârtie)', scurt: 'Document fizic' },
  { key: 'altul', label: 'Altul — fără document', scurt: 'Altul' },
]
export const MOTIV_LABEL: Record<string, string> = Object.fromEntries(MOTIVE_IGNORARE.map(m => [m.key, m.scurt]))

// Motive care justifica o cheltuila fara factura. "altul" sau lipsa motivului => de verificat.
const MOTIVE_JUSTIFICATE = new Set<string>(['comision', 'schimb_valutar', 'incasare_platforma', 'transfer_propriu', 'asociat', 'impozit', 'chirie', 'salariu', 'bon_fizic', 'document_fizic'])
// „Bon fizic” / „document fizic”: exista documentul, dar pe hartie (nu e fisier in aplicatie) - se alege manual pe tranzactie.
export const MOTIVE_FIZICE = new Set<string>(['bon_fizic', 'document_fizic'])

// Explicatia afisata pe o tranzactie sarita automat - de ce nu are nevoie de document.
export const EXPLICATIE_REGULA: Record<string, string> = {
  comision: 'Comisioanele și taxele băncii nu au nevoie de document - apar în extras.',
  schimb_valutar: 'Schimbul valutar între conturile proprii nu are nevoie de document.',
  incasare_platforma: 'Încasările Booking/Airbnb/eMAG sunt justificate de borderou / avizul de plată.',
  chirie: 'Chiria plătită unei persoane fizice nu are factură - se sare fără document.',
  impozit: 'Plățile către Trezorerie / ANAF sunt justificate de declarații (vezi Plată impozite).',
}

export interface TxPentruReguli { descriere?: string | null; descriere_curatata?: string | null; tip?: string | null; categorie?: string | null }

function text(t: TxPentruReguli) {
  return `${t.descriere_curatata || ''} ${t.descriere || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    // textul complet al unei plati cu cardul contine "comision tranzactie 0.00 RON" - e o mentiune a
    // bancii pe plata, nu un comision; fara asta orice plata la POS ar fi sarita ca "comision"
    .replace(/comision (tranzactie|trz)\s*[\d.,]+\s*[a-z]{0,3}/g, ' ')
}

// Include si taxele bancare recurente (pachet de cont, rapoarte, alerte SMS) - tot costuri ale bancii.
const RE_COMISION = /\bcomision\b|\bcomisioane\b|\bcommission\b|taxa (de )?administrare|taxa rapoarte|abonament (cont|pachet|bt)|pachet pj|cost(uri)? (pachet|cont)\b|notificari prin sms|\bbt alert\b/
const RE_SCHIMB = /schimb valutar|\bexchange\b|conversie valutar|\bfx\b.*(ron|eur|usd)/
const RE_PLATFORME = /booking\.?com|\bairbnb\b|\bemag\b|dante international/
const RE_CHIRIE = /\bchirie\b|\bchirii\b|\bchiria\b/
// Chiria catre o firma (SRL, SA, PFA, asociatie) vine cu factura - regula 4 e doar pentru persoane fizice.
const RE_PERSOANA_JURIDICA = /\bs\.?r\.?l\b|\bs\.?a\b|\bpfa\b|\bi\.?i\b|\bltd\b|\bgmbh\b|asociatia|\bsc\b/
// "Avans trezorerie" = avans de numerar catre asociat, nu impozit (vezi motivSugerat -> 'asociat')
const RE_IMPOZIT = /(?<!avans )trezorerie|\banaf\b|d\.?g\.?r\.?f\.?p|\bimpozit/

// Regula STANDARD (sarire automata) - vezi lista din capul fisierului. Intoarce motivul sau null.
export function regulaAutomata(t: TxPentruReguli): MotivIgnorare | null {
  const s = text(t)
  if (!s.trim()) return null
  if (t.tip !== 'credit' && RE_COMISION.test(s)) return 'comision'
  if (RE_SCHIMB.test(s)) return 'schimb_valutar'
  if (t.tip === 'credit' && RE_PLATFORME.test(s)) return 'incasare_platforma'
  // chiria inaintea impozitului: "Plata Instant X chirie impozit" e plata chiriei, nu a unui impozit
  if (t.tip !== 'credit' && RE_CHIRIE.test(s) && !RE_PERSOANA_JURIDICA.test(s)) return 'chirie'
  if (t.tip !== 'credit' && RE_IMPOZIT.test(s)) return 'impozit'
  return null
}

// Motivul propus cand utilizatorul ignora manual (pre-selectat, se poate schimba). Mai larg decat
// regula automata - aici doar sugeram, nu decidem singuri.
export function motivSugerat(t: TxPentruReguli, numeFirmeProprii: string[] = []): MotivIgnorare | null {
  const auto = regulaAutomata(t)
  if (auto) return auto
  const s = text(t)
  if (/\bcas\b|\bcass\b|\btva\b/.test(s)) return 'impozit'
  if (/imprumut|avans trezorerie|restituire|aport|\bdividend/.test(s)) return 'asociat'
  if (t.categorie === 'angajat' || /salariu|\bsalar|stat de plata/.test(s)) return 'salariu'
  if (t.categorie === 'transfer') return 'transfer_propriu'
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
