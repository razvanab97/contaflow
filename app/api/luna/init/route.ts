import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
export async function POST(req: NextRequest) {
  const { firmaId, luna } = await req.json()
  const sb = getServiceSupabase()
  const { data, error } = await sb.rpc('init_luna_noua', { p_firma_id: firmaId, p_luna: luna })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lunaId: data })
}
