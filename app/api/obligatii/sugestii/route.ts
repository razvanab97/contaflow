import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('obligatii_sugestii')
    .select('id,tip_key,tip_sugestie,valoare_data,incredere,sursa_email_id,sursa_subiect,sursa_data,sursa_rezumat')
    .eq('luna_id', lunaId)
    .eq('status', 'noua')
    .order('sursa_data', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
