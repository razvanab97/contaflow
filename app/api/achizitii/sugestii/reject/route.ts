import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { sugestieId } = await req.json().catch(() => ({}))
  if (!sugestieId) return NextResponse.json({ error: 'sugestieId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('achizitii_sugestii').update({ status: 'respinsa', updated_at: new Date().toISOString() }).eq('id', sugestieId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
