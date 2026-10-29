import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { mutaDispozitie } from '@/lib/dispozitie-plata'

export const dynamic = 'force-dynamic'

// Lunile firmei (pentru alegerea lunii tinta) si mutarea unei dispozitii de plata pe alta luna (lib/dispozitie-plata.ts).
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'Firma lipsește' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('luni_contabile').select('id,luna').eq('firma_id', firmaId).order('luna', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ luni: (data || []).map(l => ({ id: l.id, luna: String(l.luna).slice(0, 7) })) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, string>
    const r = await mutaDispozitie(getServiceSupabase(), body)
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
