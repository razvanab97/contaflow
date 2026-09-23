import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('proiect_achizitii')
    .select('id,denumire,valoare,sursa,status,scadenta,nota,created_at')
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { firmaId, lunaId, denumire, valoare, sursa } = body
  if (!firmaId || !denumire) return NextResponse.json({ error: 'firmaId/denumire lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb.from('proiect_achizitii').insert({
    firma_id: firmaId,
    luna_id: lunaId || null,
    denumire,
    valoare: valoare ?? null,
    sursa: sursa || null,
  }).select('id,denumire,valoare,sursa,status,scadenta,nota,created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
