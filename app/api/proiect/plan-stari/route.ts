import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { ACTIVITATI, OBLIGATII, STATUS_PLAN, type StatusPlan } from '@/lib/proiect-plan'
import { adaugaMemorie } from '@/lib/proiect-memorie'

export const dynamic = 'force-dynamic'
const lipsaTabel = (e: { code?: string }) => ['42P01', 'PGRST205'].includes(e.code || '')

// Starea activitatilor / obligatiilor din planul de afaceri (marcata manual in "Plan & AI proiect").
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('proiect_plan_stari').select('cheie,status,nota,data_realizare').eq('firma_id', firmaId)
  if (error) return lipsaTabel(error) ? NextResponse.json({ stari: [], lipsaMigrare: true }) : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stari: data || [] })
}

export async function POST(req: NextRequest) {
  const { firmaId, cheie, status, nota, dataRealizare } = await req.json().catch(() => ({}))
  if (!firmaId || !cheie || !(status in STATUS_PLAN)) return NextResponse.json({ error: 'Date incomplete' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: vechi } = await sb.from('proiect_plan_stari').select('status').eq('firma_id', firmaId).eq('cheie', String(cheie)).maybeSingle()
  const { error } = await sb.from('proiect_plan_stari').upsert({
    firma_id: firmaId, cheie: String(cheie), status: status as StatusPlan,
    nota: nota != null ? String(nota).slice(0, 2000) : null, data_realizare: dataRealizare || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'firma_id,cheie' })
  if (error) return NextResponse.json({ error: lipsaTabel(error) ? 'Tabelul proiect_plan_stari nu există încă — rulează migrarea SQL.' : error.code === '23514' ? 'Statusul nu e permis încă în baza de date — rulează SQL-ul pentru „Amânat”.' : error.message }, { status: 500 })
  // Schimbarea de stare intra in memoria proiectului (sursa pentru AI si pentru raportul lunar).
  if (vechi?.status !== status) {
    const act = ACTIVITATI.find(a => a.cheie === cheie), obl = OBLIGATII.find(o => o.cheie === cheie)
    const titlu = act ? `${act.cod} · ${act.titlu}` : obl?.titlu || String(cheie)
    const categorie = act ? 'Activitate și clienți' : obl?.categorie === 'Autorizații' ? 'Autorizații' : obl?.categorie === 'Personal' ? 'Personal' : obl?.categorie === 'Social (anual)' ? 'Social' : obl?.categorie === 'Financiar și tranșe' ? 'Financiar' : 'Altele'
    await adaugaMemorie(sb, firmaId, { categorie, text: `${titlu} — marcat „${STATUS_PLAN[status as StatusPlan]}”${nota ? `: ${String(nota).slice(0, 300)}` : ''}`, sursa: 'plan' })
  }
  return NextResponse.json({ ok: true })
}
