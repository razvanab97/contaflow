import { getServiceSupabase } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof getServiceSupabase>

export const ACHIZITIE_STATUSES = new Set(['oferta', 'nota_semnata', 'plata_initiata', 'dovada_trimisa', 'finalizat'])

// Extras din POST /api/achizitii ca sa poata fi apelat si de la confirmarea unei sugestii AI
// (o achizitie noua, propusa dintr-un mail) fara duplicare.
export async function createAchizitie(sb: Supabase, params: { firmaId: string; lunaId?: string | null; denumire: string; valoare?: number | null; sursa?: string | null }) {
  const { data, error } = await sb.from('proiect_achizitii').insert({
    firma_id: params.firmaId,
    luna_id: params.lunaId || null,
    denumire: params.denumire,
    valoare: params.valoare ?? null,
    sursa: params.sursa || null,
  }).select('id,denumire,valoare,sursa,status,scadenta,nota,created_at').single()
  if (error) throw new Error(error.message)
  return data
}

// Extras din PATCH /api/achizitii/[id] ca sa poata fi apelat si de la confirmarea unei sugestii
// AI (actualizare de etapa pentru o achizitie deja existenta) fara duplicare.
export async function updateAchizitieStatus(sb: Supabase, achizitieId: string, status: string) {
  if (!ACHIZITIE_STATUSES.has(status)) throw new Error('Status invalid')
  const { error } = await sb.from('proiect_achizitii').update({ status, updated_at: new Date().toISOString() }).eq('id', achizitieId)
  if (error) throw new Error(error.message)
}
