import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { lunaId, taskKey, completat } = body
  if (!lunaId || !taskKey || typeof completat !== 'boolean')
    return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('task_stari').upsert(
    { luna_id: lunaId, task_key: taskKey, completat, updated_at: new Date().toISOString() },
    { onConflict: 'luna_id,task_key' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
