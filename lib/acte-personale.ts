import type { getServiceSupabase } from '@/lib/supabase/server'

// Actele personale (buletin etc.) afisate pe Dashboard langa firme: fisierul + datele citite din el.
// Fara tabel: un index JSON in storage (acte-personale/index.json) si fisierele in acte-personale/.

type Sb = ReturnType<typeof getServiceSupabase>
export const INDEX_PATH = 'acte-personale/index.json'

export interface ActPersonal {
  id: string
  tip: string                 // ex. "Carte de identitate"
  nume: string | null
  prenume: string | null
  cnp: string | null
  serie: string | null
  numar: string | null
  data_nasterii: string | null // AAAA-LL-ZZ
  sex: string | null
  cetatenie: string | null
  loc_nastere: string | null
  domiciliu: string | null
  emis_de: string | null
  valabil_de: string | null    // AAAA-LL-ZZ
  valabil_pana: string | null  // AAAA-LL-ZZ
  fisier_path: string
  fisier_nume: string
  fisier_tip: string
  created_at: string
}

export const CAMPURI: (keyof ActPersonal)[] = ['tip', 'nume', 'prenume', 'cnp', 'serie', 'numar', 'data_nasterii', 'sex', 'cetatenie', 'loc_nastere', 'domiciliu', 'emis_de', 'valabil_de', 'valabil_pana']

export async function citesteActe(sb: Sb): Promise<ActPersonal[]> {
  const { data } = await sb.storage.from('documente').download(INDEX_PATH)
  if (!data) return []
  try { const j = JSON.parse(await data.text()); return Array.isArray(j) ? j : [] } catch { return [] }
}

export async function scrieActe(sb: Sb, acte: ActPersonal[]) {
  const { error } = await sb.storage.from('documente').upload(INDEX_PATH, Buffer.from(JSON.stringify(acte, null, 2)), { contentType: 'application/json', upsert: true })
  if (error) throw new Error(error.message)
}

// Data nasterii din CNP (cifra 1: secol + sex; 2-7: AALLZZ), ca rezerva daca AI nu o citeste
export function dataDinCnp(cnp: string | null): string | null {
  const m = String(cnp || '').match(/^([1-8])(\d{2})(\d{2})(\d{2})\d{6}$/)
  if (!m) return null
  const secol = { '1': 1900, '2': 1900, '3': 1800, '4': 1800, '5': 2000, '6': 2000, '7': 1900, '8': 1900 }[m[1]]!
  return `${secol + Number(m[2])}-${m[3]}-${m[4]}`
}
