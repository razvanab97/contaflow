import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { lunaId, modulSlug, dezactivat } = body
  if (!lunaId || !modulSlug || typeof dezactivat !== 'boolean')
    return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('module_stari').upsert(
    { luna_id: lunaId, modul_slug: modulSlug, dezactivat, updated_at: new Date().toISOString() },
    { onConflict: 'luna_id,modul_slug' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
