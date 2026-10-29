// Ordinele de plata (OP): o zona unica de incarcare (pagina /op-uri), de unde fiecare OP se asociaza
// automat platii din extras (tranzactia de debit) a firmei platitoare. Aici sunt regulile pure (fara DB):
// ce plati trebuie sa aiba OP, numarul OP-ului dintr-o tranzactie si scorul de potrivire OP <-> tranzactie.

export interface TxOp { id?: string; firma_id?: string; data_tranzactie?: string; suma: number | string; descriere?: string | null; descriere_curatata?: string | null; referinta?: string | null; categorie?: string | null; tip?: string | null }
export interface OpCitit { numar_op: string | null; data: string | null; suma: number | null; valuta?: string | null; platitor?: string | null; iban_platitor?: string | null; beneficiar?: string | null; iban_beneficiar?: string | null; explicatie?: string | null }

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g
export const ibanCurat = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toUpperCase()

// Plati cu cardul, comisioane, abonamente bancare: nu au OP.
const FARA_OP = /\bE?POS\b|plata la pos|comision|^taxa|nota contabila|abonament|pachet|nelimitat|notificari|schimb valutar|dobanda|retragere|\bATM\b|recuperare restante|PayU|MPY\b/i
// Transferuri initiate din banca (ordine de plata): formatul BT "explicatie;NR_OP;beneficiar;IBAN;BIC", plati la trezorerie,
// plati instant / SEPA, creditari intre conturi.
const CU_OP = /Plata OP|\/ROC\/|;\s*\d{1,6}\s*;[^;]*;\s*\/?[A-Z]{2}\d{2}[A-Z0-9]{10,}|^Creditare|^Plata (Instant|SEPA|instant)|^Transfer\b/i

// Numarul OP-ului din tranzactie: "…;71;MUULOX S.R.L.;RO48…", referinta scurta numerica ("81") sau "CAM - iunie;257".
export function numarOpTx(tx: TxOp): string | null {
  const d = String(tx.descriere || '')
  const m = d.match(/;\s*(\d{1,6})\s*;[^;]*;\s*\/?[A-Z]{2}\d{2}[A-Z0-9]{10,}/)
  if (m) return String(Number(m[1]))
  const r = String(tx.referinta || '').trim()
  if (/^\d{1,6}$/.test(r)) return String(Number(r))
  const rm = r.match(/;\s*(\d{1,6})\s*$/)
  return rm ? String(Number(rm[1])) : null
}

export function necesitaOp(tx: TxOp): boolean {
  if (tx.tip && tx.tip !== 'debit') return false
  const d = String(tx.descriere || '')
  // formatul complet "…;NR;beneficiar;IBAN" sau /ROC/ = sigur transfer; altfel comisioanele/cardul au prioritate
  // ("Comision plata OP" e comisionul, nu plata)
  if (/;\s*\d{1,6}\s*;[^;]*;\s*\/?[A-Z]{2}\d{2}[A-Z0-9]{10,}|\/ROC\//.test(d)) return true
  if (!d.trim() || FARA_OP.test(d) || /^000NVPO/i.test(String(tx.referinta || ''))) return false
  return CU_OP.test(d) || !!numarOpTx(tx)
}

const cuvinte = (s: unknown) => new Set(norm(s).replace(/\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|sa|srl|sp\.? z o\.?o\.?|sp\.?k)\b/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length >= 3))
function potrivireNume(a: unknown, b: unknown) {
  const x = cuvinte(a), y = cuvinte(b)
  if (!x.size || !y.size) return 0
  let comune = 0; x.forEach(w => { if (y.has(w)) comune++ })
  return comune / Math.min(x.size, y.size)
}
const zile = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

// Scorul potrivirii unui OP cu o tranzactie de debit (0 = nu se potriveste). Suma trebuie sa fie aceeasi,
// data platii in extras la cel mult 3 zile inainte / 7 zile dupa data OP-ului; restul (numar OP, IBAN-ul si
// numele beneficiarului) cresc increderea. Motivele se arata in pagina.
export function scorPotrivire(op: OpCitit, tx: TxOp): { scor: number; motive: string[] } {
  if (op.suma == null || Math.abs(Math.abs(Number(tx.suma)) - Math.abs(op.suma)) > 0.01) return { scor: 0, motive: [] }
  const motive = ['aceeași sumă']
  let scor = 30
  if (op.data && tx.data_tranzactie) {
    const dz = zile(tx.data_tranzactie, op.data)
    if (dz < -3 || dz > 7) return { scor: 0, motive: [] }
    scor += dz === 0 ? 15 : Math.abs(dz) <= 2 ? 10 : 4
    motive.push(dz === 0 ? 'aceeași dată' : `${Math.abs(dz)} ${Math.abs(dz) === 1 ? 'zi' : 'zile'} diferență`)
  }
  const nrTx = numarOpTx(tx), nrOp = op.numar_op ? String(Number(String(op.numar_op).replace(/\D/g, '')) || op.numar_op) : null
  if (nrTx && nrOp && nrTx === nrOp) { scor += 40; motive.push(`OP nr. ${nrOp}`) }
  else if (nrTx && nrOp) scor -= 15
  const txText = `${tx.descriere || ''} ${tx.descriere_curatata || ''}`
  const iban = ibanCurat(op.iban_beneficiar)
  if (iban && (txText.replace(/\s+/g, '').toUpperCase().match(IBAN) ?? [] as string[]).includes(iban)) { scor += 35; motive.push('IBAN beneficiar') }
  const nume = potrivireNume(op.beneficiar, txText)
  if (nume >= 0.5) { scor += Math.round(20 * nume); motive.push('nume beneficiar') }
  return { scor, motive }
}

// Cea mai buna tranzactie pentru un OP. Se accepta doar daca e clara: scor >= 55 (suma + data + inca un indiciu)
// sau unica tranzactie cu aceeasi suma in fereastra de date (scor >= 40), si fara un al doilea candidat la egalitate.
export function alegeTranzactia<T extends TxOp>(op: OpCitit, txs: T[]): { tx: T; scor: number; motive: string[] } | { tx: null; motiv: string; candidati: number } {
  const scored = txs.map(tx => ({ tx, ...scorPotrivire(op, tx) })).filter(x => x.scor > 0).sort((a, b) => b.scor - a.scor)
  if (!scored.length) return { tx: null, motiv: 'nicio plată din extras cu aceeași sumă în jurul datei OP-ului', candidati: 0 }
  const [best, second] = scored
  if (second && second.scor >= best.scor - 5) return { tx: null, motiv: `${scored.length} plăți posibile, la fel de probabile — alege manual`, candidati: scored.length }
  if (best.scor >= 55 || (scored.length === 1 && best.scor >= 40)) return best
  return { tx: null, motiv: 'potrivire nesigură (doar suma)', candidati: scored.length }
}

// Firma platitoare: dupa IBAN-ul platitorului (conturile firmei din extrase), apoi dupa nume / CUI.
export function firmaPlatitoare<F extends { id: string; nume: string; cui?: string | null; ibanuri: string[] }>(op: OpCitit, firme: F[]): F | null {
  const iban = ibanCurat(op.iban_platitor)
  if (iban) { const f = firme.find(x => x.ibanuri.includes(iban)); if (f) return f }
  const cu = firme.map(f => ({ f, s: potrivireNume(op.platitor, f.nume) })).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s)
  if (cu.length && (cu.length === 1 || cu[0].s > cu[1].s)) return cu[0].f
  const cui = String(op.platitor || '').match(/\b\d{6,10}\b/)?.[0]
  return cui ? firme.find(f => f.cui && String(f.cui).replace(/\D/g, '') === cui) || null : null
}
