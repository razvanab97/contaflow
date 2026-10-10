import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Documentele tuturor achizitiilor firmei, grupate pe achizitie - pentru verificarea dosarelor
// (ce exista / ce lipseste, vezi lib/achizitii-procedura.ts dosarAchizitie).
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('documente')
    .select('achizitie_id,fisier_nume,tip_document,fisier_tip').eq('firma_id', firmaId).not('achizitie_id', 'is', null).limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const out: Record<string, { fisier_nume: string; tip_document: string | null; fisier_tip: string | null }[]> = {}
  for (const d of data || []) (out[d.achizitie_id] ||= []).push({ fisier_nume: d.fisier_nume, tip_document: d.tip_document, fisier_tip: d.fisier_tip })
  return NextResponse.json(out)
}
