// Tipuri si functii pure pentru Mail contabil - fara dependinte de server, importabile si din
// componentele client (logica cu AI si baza de date e in lib/mail-contabil.ts).

export const CATEGORII = {
  tranzactie_neidentificata: 'Tranzacție neidentificată',
  diferenta_facturare: 'Diferență de refacturat',
  factura_client_lipsa: 'Factură client lipsă',
  storno_factura: 'Factură de stornat',
  client_neincasat: 'Client neîncasat',
  restituire_bani: 'Restituire bani',
  furnizor_neachitat: 'Furnizor neachitat',
  document_lipsa: 'Document lipsă',
  general: 'Cerere generală',
} as const
export type Categorie = keyof typeof CATEGORII

export type StatusPunct = 'nou' | 'rezolvat' | 'partial' | 'nerezolvat' | 'neclar'

export interface Dovada {
  sursa: 'tranzactie' | 'document' | 'factura_5stardesk' | 'rezervare' | 'factura_asteptata'
  titlu: string
  detalii: string
  suma: number | null
  data: string | null
  luna: string | null
  potrivire: string
  documentUrl?: string | null
  href?: string | null
}

export interface Punct {
  id: string
  categorie: Categorie
  titlu: string
  persoana: string | null
  suma: number | null
  sumaDiferenta: number | null
  data: string | null
  platforma: string | null
  cerere: string
  citat: string
  status: StatusPunct
  dovezi: Dovada[]
  constatare: string | null
  recomandare: string | null
  pasi: string[]
  raspuns: string | null
  rezolvatManual: boolean
  nota: string | null
  analizatAt: string | null
}

export interface MailContabil {
  id: string
  firma_id: string
  luna_id: string | null
  subiect: string | null
  data_mail: string | null
  text_mail: string | null
  imagini: string[]
  rezumat: string | null
  puncte: Punct[]
  created_at: string
}

// Raspunsul catre contabil, compus din propozitiile fiecarei situatii (fara un apel AI separat).
export function draftRaspuns(m: Pick<MailContabil, 'puncte'>) {
  const linii = m.puncte.filter(p => p.raspuns || p.nota).map(p => `- ${p.persoana || p.titlu}: ${p.nota?.trim() || p.raspuns}`)
  return `Bună ziua,\n\nRevenim cu situațiile din mailul dumneavoastră:\n\n${linii.join('\n')}\n\nVă mulțumim,\nO zi frumoasă!`
}
