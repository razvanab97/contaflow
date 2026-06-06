import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
export async function POST(req: NextRequest) {
  const { id, note } = await req.json()
  const sb = getServiceSupabase()
  const { error } = await sb.from('tranzactii').update({ note }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
