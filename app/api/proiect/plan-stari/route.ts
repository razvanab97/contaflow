import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { STATUS_PLAN, type StatusPlan } from '@/lib/proiect-plan'

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
  const { error } = await getServiceSupabase().from('proiect_plan_stari').upsert({
    firma_id: firmaId, cheie: String(cheie), status: status as StatusPlan,
    nota: nota != null ? String(nota).slice(0, 2000) : null, data_realizare: dataRealizare || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'firma_id,cheie' })
  if (error) return NextResponse.json({ error: lipsaTabel(error) ? 'Tabelul proiect_plan_stari nu există încă — rulează migrarea SQL.' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
