import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('proprietar_locatii')
    .select('id,eticheta,proprietar_id,proprietari(nume,serie_ci,numar_ci)')
    .eq('firma_id', firmaId)
    .order('eticheta', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locatii: data || [] })
}

export async function POST(req: NextRequest) {
  const { firmaId, proprietarId, eticheta } = await req.json().catch(() => ({}))
  const cleanFirmaId = String(firmaId || '')
  const cleanProprietarId = String(proprietarId || '')
  const cleanEticheta = String(eticheta || '').trim()
  if (!cleanFirmaId || !cleanProprietarId || !cleanEticheta)
    return NextResponse.json({ error: 'firmaId, proprietarId și eticheta sunt obligatorii' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('proprietar_locatii')
    .upsert({ firma_id: cleanFirmaId, proprietar_id: cleanProprietarId, eticheta: cleanEticheta }, { onConflict: 'firma_id,eticheta' })
    .select('id,eticheta,proprietar_id,proprietari(nume,serie_ci,numar_ci)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locatie: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { error } = await sb.from('proprietar_locatii').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
