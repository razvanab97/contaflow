import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ items: [] })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('airbnb_facturi_asteptate')
    .select(`
      id,
      cod_confirmare,
      oaspete,
      anunt,
      data_rezervarii,
      data_start,
      data_sfarsit,
      data_tranzactie,
      moneda,
      suma,
      taxa_servicii,
      castiguri_brute,
      status,
      factura_document_id,
      documente:factura_document_id(fisier_nume)
    `)
    .eq('firma_id', firmaId)
    .eq('luna_id', lunaId)
    .order('data_tranzactie', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
