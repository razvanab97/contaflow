import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { BUGET_INTEGRAL } from '@/lib/proiect-buget-date'

export const dynamic = 'force-dynamic'

// Registrul platilor PROIECT AB Textile: fiecare plata e legata de o linie din bugetul AA3 si se scade din ea.
const lipsaTabel = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205'].includes(e.code || '')
const COLOANE = 'id,linie_cod,data,suma,sursa,descriere,beneficiar,fisier_path,fisier_nume,created_at'

function valideaza(b: Record<string, unknown>) {
  const linie = BUGET_INTEGRAL.find(l => l.cod === String(b.linie_cod || ''))
  if (!linie) return { error: 'Alege linia de buget.' }
  const suma = Number(String(b.suma ?? '').replace(',', '.'))
  if (!Number.isFinite(suma) || suma <= 0) return { error: 'Suma trebuie să fie mai mare decât zero.' }
  const data = String(b.data || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: 'Data plății lipsește.' }
  const sursa = b.sursa === 'subventie' || b.sursa === 'cofinantare' ? b.sursa : null
  return { row: { linie_cod: linie.cod, suma: Math.round(suma * 100) / 100, data, sursa, descriere: String(b.descriere || '').trim().slice(0, 500) || null, beneficiar: String(b.beneficiar || '').trim().slice(0, 200) || null } }
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('proiect_plati').select(COLOANE).eq('firma_id', firmaId).order('data', { ascending: false })
  if (error) return lipsaTabel(error) ? NextResponse.json({ plati: [], lipsaMigrare: true }) : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plati: data || [] })
}

// O plata sau mai multe odata (ex. propunerile confirmate din OP-uri).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { firmaId?: string; plati?: Record<string, unknown>[] } & Record<string, unknown>
  if (!body.firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  const lista = Array.isArray(body.plati) ? body.plati : [body]
  const rows = []
  for (const [i, p] of lista.entries()) {
    const v = valideaza(p)
    if ('error' in v) return NextResponse.json({ error: lista.length > 1 ? `Plata ${i + 1}: ${v.error}` : v.error }, { status: 400 })
    rows.push({ ...v.row, firma_id: body.firmaId, fisier_path: typeof p.fisier_path === 'string' ? p.fisier_path : null, fisier_nume: typeof p.fisier_nume === 'string' ? p.fisier_nume.slice(0, 200) : null })
  }
  const { data, error } = await getServiceSupabase().from('proiect_plati').insert(rows).select(COLOANE)
  if (error) return NextResponse.json({ error: lipsaTabel(error) ? 'Rulează întâi migrarea SQL pentru tabelul proiect_plati.' : error.message }, { status: 500 })
  return NextResponse.json({ plati: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  if (!body.firmaId || !body.id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const v = valideaza(body)
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('proiect_plati').update(v.row).eq('firma_id', String(body.firmaId)).eq('id', String(body.id)).select(COLOANE).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plata: data })
}

export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), id = req.nextUrl.searchParams.get('id')
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: p } = await sb.from('proiect_plati').select('fisier_path').eq('firma_id', firmaId).eq('id', id).maybeSingle()
  const { error } = await sb.from('proiect_plati').delete().eq('firma_id', firmaId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // OP-ul ramane in storage doar daca il mai foloseste alta plata (un OP poate acoperi mai multe linii).
  if (p?.fisier_path) {
    const { count } = await sb.from('proiect_plati').select('id', { count: 'exact', head: true }).eq('fisier_path', p.fisier_path)
    if (!count) await sb.storage.from('documente').remove([p.fisier_path])
  }
  return NextResponse.json({ ok: true })
}
