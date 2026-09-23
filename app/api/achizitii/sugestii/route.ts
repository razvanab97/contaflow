import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('achizitii_sugestii')
    .select('id,achizitie_id,actiune,denumire,valoare,sursa,status_propus,incredere,sursa_subiect,sursa_data,sursa_rezumat')
    .eq('firma_id', firmaId)
    .eq('status', 'noua')
    .order('sursa_data', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
