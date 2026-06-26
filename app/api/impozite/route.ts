import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('impozite_stari')
    .select('tip_key,suma,scadenta,platit')
    .eq('luna_id', lunaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { lunaId, tipKey, suma, scadenta, platit } = body
  if (!lunaId || !tipKey) return NextResponse.json({ error: 'lunaId/tipKey lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('impozite_stari').upsert(
    { luna_id: lunaId, tip_key: tipKey, suma, scadenta, platit: !!platit, updated_at: new Date().toISOString() },
    { onConflict: 'luna_id,tip_key' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: taskErr } = await sb.from('task_stari').upsert(
    { luna_id: lunaId, task_key: tipKey, completat: !!platit, updated_at: new Date().toISOString() },
    { onConflict: 'luna_id,task_key' }
  )
  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
