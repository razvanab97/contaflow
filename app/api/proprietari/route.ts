import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('proprietari')
    .select('id,nume,serie_ci,numar_ci,buletin_path,buletin_nume,ordine')
    .eq('firma_id', firmaId)
    .order('ordine')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const { firmaId, nume, serie_ci, numar_ci } = await req.json()
  if (!firmaId || !nume) return NextResponse.json({ error: 'firmaId/nume lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { count } = await sb.from('proprietari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)

  const { data, error } = await sb
    .from('proprietari')
    .insert({ firma_id: firmaId, nume, serie_ci, numar_ci, ordine: count || 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, nume, serie_ci, numar_ci } = await req.json()
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('proprietari').update({ nume, serie_ci, numar_ci }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('proprietari').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
