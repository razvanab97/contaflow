import { regulaAutomata } from '@/lib/tranzactii-reguli'

// "Achizitii produse" = banii platiti furnizorilor de la care firma cumpara marfa. O categorie PESTE
// tranzactiile existente (nu schimba nicio alta categorie / formula): se calculeaza din plati (debit)
// dupa furnizor, iar corectia manuala (tranzactii.achizitie_produse) are mereu prioritate.
//
// Numele din extras difera de numele comerciale - lista a fost verificata pe tranzactiile reale:
//  - "Maxy" apare in banca ca ISO TRADE Sp. z o.o. (facturile atasate platilor sunt de la Maxy);
//  - "Verk" = VERK GROUP SIKORSKI SP.K.;  "i-Want" = i-Want Sp. z o.o. (PL);  "Importio" = IMPORTIO Sp. z o.o.;
//  - "Jumbo" = JUMBO EC.R SRL (plata cu cardul: "EPOS ... JUMBO", "Plata POS JUMBO", "VISA JUMBO IASI").
// Nu se presupune nimic despre un furnizor necunoscut: ce nu e pe lista se marcheaza manual.

export const FIRME_ACHIZITII_PRODUSE = ['ab-homes-invest']
export const areAchizitiiProduse = (firmaSlug: string) => FIRME_ACHIZITII_PRODUSE.includes(firmaSlug)

export const FURNIZORI_PRODUSE: { nume: string; rx: RegExp }[] = [
  { nume: 'Jumbo', rx: /\bjumbo\b/ },
  { nume: 'Maxy', rx: /\biso\s*trade\b|\bmaxy\b/ },
  { nume: 'Verk', rx: /\bverk\b|\bwerk\b/ },
  { nume: 'i-Want', rx: /\bi-?want\b/ },
  { nume: 'Importio', rx: /\bimportio\b/ },
]

export interface TxAchizitie {
  tip?: string | null
  descriere?: string | null
  descriere_curatata?: string | null
  achizitie_produse?: boolean | null
}
export interface ClasificareAchizitie { furnizor: string; sursa: 'auto' | 'manual' }

function norm(t: TxAchizitie) {
  return `${t.descriere_curatata || ''} ${t.descriere || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Furnizorul dupa regula automata (doar plati; comisioanele, schimburile valutare, impozitele si
// chiriile au deja regulile lor si nu pot fi achizitii de produse).
export function furnizorProdusAuto(t: TxAchizitie): string | null {
  if (t.tip !== 'debit') return null
  if (regulaAutomata(t)) return null
  const s = norm(t)
  return FURNIZORI_PRODUSE.find(f => f.rx.test(s))?.nume ?? null
}

// Numele contrapartii, doar pentru platile marcate manual care nu sunt pe lista de furnizori:
// plata cu cardul ("EPOS ... TID:x COMERCIANT ...") sau transfer ("ref;nr;BENEFICIAR;IBAN;...").
export function numeContraparte(t: Pick<TxAchizitie, 'descriere' | 'descriere_curatata'>): string {
  const d = String(t.descriere || t.descriere_curatata || '').replace(/\s+/g, ' ').trim()
  const epos = d.match(/^EPOS \d\d\/\d\d\/\d{4}\s+\S+\s+TID:\S+\s+(.+?)(?:\s+\+?\d{6,}|\s+valoare|\s+\d{8}\s)/i)
  if (epos) return epos[1].trim().slice(0, 40)
  const parti = d.split(';').map(x => x.trim()).filter(Boolean)
  const iIban = parti.findIndex(x => /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(x))
  if (iIban > 0) return parti[iIban - 1].slice(0, 40)
  return d.replace(/^(plata|plată)\s+(la\s+)?(pos|instant|op|sepa)\b\W*/i, '').slice(0, 40)
}

// Clasificarea finala: corectia manuala bate regula automata.
export function claseazaAchizitie(t: TxAchizitie): ClasificareAchizitie | null {
  if (t.tip !== 'debit') return null
  if (t.achizitie_produse === false) return null
  // un schimb valutar intre conturile proprii nu e niciodata o achizitie (si ar dubla banii)
  if (regulaAutomata(t) === 'schimb_valutar') return null
  const auto = furnizorProdusAuto(t)
  if (t.achizitie_produse === true) return { furnizor: auto || numeContraparte(t) || 'Alți furnizori', sursa: 'manual' }
  return auto ? { furnizor: auto, sursa: 'auto' } : null
}
