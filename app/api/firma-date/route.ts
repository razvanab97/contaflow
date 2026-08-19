import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('firme')
    .select('id,nume,cui,nr_reg_com,adresa,judet,tara,certificat_path,certificat_nume')
    .eq('id', firmaId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Firma nu a fost găsită' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { firmaId, cui, nr_reg_com, adresa, judet, tara, certificat_nume } = await req.json()
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb
    .from('firme')
    .update({ cui, nr_reg_com, adresa, judet, tara, certificat_nume })
    .eq('id', firmaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
