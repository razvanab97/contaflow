import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const [{ data: campuri }, { data: sablon }] = await Promise.all([
    sb.from('proiect_raport_campuri').select('*').eq('firma_id', firmaId).eq('sectiune', 'raport_lunar').maybeSingle(),
    sb.from('proiect_documente').select('id,updated_at').eq('firma_id', firmaId).eq('sectiune', 'raport_lunar_sablon').maybeSingle(),
  ])

  return NextResponse.json({ campuri: campuri || null, sablonConfigurat: !!sablon })
}
