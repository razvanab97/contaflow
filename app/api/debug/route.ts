import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET() {
  const sb = getServiceSupabase()
  const { data: firme } = await sb.from('firme').select('id, slug, nume, culoare')
  const { data: luni } = await sb.from('luni_contabile').select('id, luna, firma_id')
  const { data: extrase } = await sb.from('extrase').select('id, valuta, luna_id, nr_tranzactii')
  const { data: tx_sample } = await sb.from('tranzactii').select('id, extras_id, data_tranzactie, descriere_curatata, tip, suma, valuta').limit(3)
  return NextResponse.json({ firme, luni, extrase, tx_sample })
}
