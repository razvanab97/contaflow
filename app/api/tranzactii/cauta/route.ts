import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Cautare de tranzactii pentru o firma, folosita din Inbox Facturi cand un document nu s-a
// putut asocia automat (suma diferita de suma tranzactiei, ex. o plata partiala) - permite
// gasirea manuala a tranzactiei corecte, indiferent de luna, dupa descriere sau suma.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  if (q.length < 2) return NextResponse.json({ tranzactii: [] })

  const sb = getServiceSupabase()
  const sumaCautata = Number(q.replace(',', '.'))
  const query = sb.from('tranzactii')
    .select('id,data_tranzactie,descriere,descriere_curatata,suma,valuta,document_id')
    .eq('firma_id', firmaId)
    .order('data_tranzactie', { ascending: false })
    .limit(15)

  const { data, error } = !Number.isNaN(sumaCautata) && sumaCautata > 0
    ? await query.gte('suma', sumaCautata - 0.5).lte('suma', sumaCautata + 0.5)
    : await query.or(`descriere.ilike.%${q}%,descriere_curatata.ilike.%${q}%`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tranzactii: data || [] })
}
