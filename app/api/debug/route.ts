import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET() {
  const sb = getServiceSupabase()
  
  const { data: luni } = await sb.from('luni_contabile').select('id, luna, firma_id')
  const { data: extrase } = await sb.from('extrase').select('id, valuta, luna_id, nr_tranzactii, procesat_ai')
  const { data: txCount } = await sb.from('tranzactii').select('id, extras_id').limit(200)
  
  // Count tranzactii per extras_id
  const txPerExtras: Record<string, number> = {}
  for (const t of txCount || []) {
    txPerExtras[t.extras_id] = (txPerExtras[t.extras_id] || 0) + 1
  }

  return NextResponse.json({
    luni,
    extrase: (extrase || []).map(e => ({ ...e, tx_in_db: txPerExtras[e.id] || 0 })),
    total_tranzactii_in_db: txCount?.length || 0
  })
}
