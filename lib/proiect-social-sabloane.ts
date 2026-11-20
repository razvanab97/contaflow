// Șabloanele de documente ale zonelor sociale (pentru generatorul per beneficiar).
// Fișierele .docx stau în Supabase storage la `_sabloane/<folder>/<fisier>` (seed din templates/).
// Marcajele %%NR_INREG%% și %%DATA%% se completează automat la generare (nr. de înregistrare + data).

export interface SablonCamp { key: string; label: string }
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
      { key: 'AN', label: 'Anul' },
      { key: 'NR_VOLUNTARI', label: 'Nr. voluntari' },
      { key: 'COORDONATOR', label: 'Coordonator' },
    ],
  },
  {
    tip: 'contract_voluntariat', zona: 'ZS-2.2', label: 'Contract de voluntariat',
    fisier: 'ab-next/contract-voluntariat.docx', nivel: 'beneficiar',
    campuri: [
      { key: 'NUME', label: 'Nume și prenume' },
      { key: 'DATA_NASTERII', label: 'Data nașterii' },
      { key: 'DOMICILIU', label: 'Domiciliu' },
      { key: 'CNP', label: 'CNP' },
      { key: 'CONTACT', label: 'Telefon / e-mail' },
      { key: 'PERIOADA', label: 'Perioada' },
      { key: 'ORE_PROGRAM', label: 'Ore / program' },
      { key: 'LOCUL', label: 'Locul' },
      { key: 'COORDONATOR', label: 'Coordonator' },
      { key: 'DATA_INSTRUIRE', label: 'Data instruirii' },
      { key: 'INSTRUIT_DE', label: 'Instruit de' },
      { key: 'CONFIRMARE', label: 'Confirmare voluntar' },
    ],
  },
]

export const caleStorage = (s: SablonDef) => STORAGE_PREFIX + s.fisier
export const getSablon = (tip: string | null | undefined) => SABLOANE.find(s => s.tip === tip)
export const sabloanePentruZona = (zona: string) => SABLOANE.filter(s => s.zona === zona)
export const sabloaneBeneficiar = (zona: string) => sabloanePentruZona(zona).filter(s => s.nivel === 'beneficiar')
export const sabloaneActivitate = (zona: string) => sabloanePentruZona(zona).filter(s => s.nivel === 'activitate')

// Valorile implicite pentru câmpuri (coordonator, locul etc. — din planul AB NEXT).
export const VALORI_IMPLICITE: Record<string, string> = {
  COORDONATOR: 'Abunei Elena', INSTRUIT_DE: 'Abunei Elena', LOCUL: 'Spălătoria AB TEXTILE',
}
