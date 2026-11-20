// Șabloanele de documente ale zonelor sociale (pentru generatorul per beneficiar).
// Fișierele .docx stau în Supabase storage la `_sabloane/<folder>/<fisier>` (seed din templates/).
// Marcajele %%NR_INREG%% și %%DATA%% se completează automat la generare (nr. de înregistrare + data).

export interface SablonCamp { key: string; label: string; comun?: boolean } // comun = date de activitate (se setează o dată, pentru toate documentele)
export interface SablonDef {
  tip: string                      // tip_document al documentului generat
  zona: string                     // zona căreia îi aparține (ex. ZS-2.2)
  label: string
  fisier: string                   // cale în storage, sub _sabloane/
  nivel: 'activitate' | 'beneficiar'
  campuri: SablonCamp[]            // câmpuri editabile (fără NR_INREG/DATA, care-s automate)
}

const STORAGE_PREFIX = '_sabloane/'

export const SABLOANE: SablonDef[] = [
  {
    tip: 'decizie_organizare', zona: 'ZS-2.2', label: 'Decizie de organizare',
    fisier: 'ab-next/decizie-organizare.docx', nivel: 'activitate',
    campuri: [
      { key: 'AN', label: 'Anul', comun: true },
      { key: 'NR_VOLUNTARI', label: 'Nr. voluntari', comun: true },
      { key: 'COORDONATOR', label: 'Coordonator', comun: true },
    ],
  },
  {
    tip: 'contract_voluntariat', zona: 'ZS-2.2', label: 'Contract de voluntariat',
    fisier: 'ab-next/contract-voluntariat.docx', nivel: 'beneficiar',
    campuri: [
      // date personale (per beneficiar — din buletin)
      { key: 'NUME', label: 'Nume și prenume' },
      { key: 'DATA_NASTERII', label: 'Data nașterii' },
      { key: 'DOMICILIU', label: 'Domiciliu' },
      { key: 'CNP', label: 'CNP' },
      { key: 'CONTACT', label: 'Telefon / e-mail' },
      // date comune (de activitate — se setează o dată)
      { key: 'PERIOADA', label: 'Perioada', comun: true },
      { key: 'ORE_PROGRAM', label: 'Ore / program', comun: true },
      { key: 'LOCUL', label: 'Locul', comun: true },
      { key: 'COORDONATOR', label: 'Coordonator', comun: true },
      { key: 'DATA_INSTRUIRE', label: 'Data instruirii', comun: true },
      { key: 'INSTRUIT_DE', label: 'Instruit de', comun: true },
    ],
  },
]

// Câmpurile „comune" (de activitate) unice pe o zonă — se setează o dată, intră în toate documentele.
export function campuriComune(zona: string): SablonCamp[] {
  const seen = new Set<string>(); const out: SablonCamp[] = []
  for (const s of sabloanePentruZona(zona)) for (const c of s.campuri) if (c.comun && !seen.has(c.key)) { seen.add(c.key); out.push(c) }
  return out
}
// Câmpurile personale ale beneficiarului (non-comune din șabloanele per beneficiar).
export function campuriBeneficiar(zona: string): SablonCamp[] {
  const seen = new Set<string>(); const out: SablonCamp[] = []
  for (const s of sabloaneBeneficiar(zona)) for (const c of s.campuri) if (!c.comun && !seen.has(c.key)) { seen.add(c.key); out.push(c) }
  return out
}

export const caleStorage = (s: SablonDef) => STORAGE_PREFIX + s.fisier
export const getSablon = (tip: string | null | undefined) => SABLOANE.find(s => s.tip === tip)
export const sabloanePentruZona = (zona: string) => SABLOANE.filter(s => s.zona === zona)
export const sabloaneBeneficiar = (zona: string) => sabloanePentruZona(zona).filter(s => s.nivel === 'beneficiar')
export const sabloaneActivitate = (zona: string) => sabloanePentruZona(zona).filter(s => s.nivel === 'activitate')

// Valorile implicite pentru câmpuri (coordonator, locul etc. — din planul AB NEXT).
export const VALORI_IMPLICITE: Record<string, string> = {
  COORDONATOR: 'Abunei Elena', INSTRUIT_DE: 'Abunei Elena', LOCUL: 'Spălătoria AB TEXTILE',
}
