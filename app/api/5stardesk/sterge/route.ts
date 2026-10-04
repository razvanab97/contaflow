import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Sterge un rand din verificarea 5StarDesk: o rezervare citita din borderou (ex. anulata, dublura,
// citita gresit) sau o factura 5StarDesk citita (ex. stornata, a altei firme). Documentele incarcate
// raman neatinse - se sterge doar randul extras din ele; dispare si din lista de discrepante.
export async function DELETE(req: NextRequest) {
  const tip = req.nextUrl.searchParams.get('tip')
  const id = req.nextUrl.searchParams.get('id')
  if (!id || (tip !== 'rezervare' && tip !== 'factura')) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const sb = getServiceSupabase()
  const tabel = tip === 'rezervare' ? 'borderou_rezervari' : 'stardesk_facturi'
  const { data: rand } = await sb.from(tabel).select('id,luna_id').eq('id', id).single()
  if (!rand) return NextResponse.json({ error: 'Rândul nu mai există' }, { status: 404 })
  const { error } = await sb.from(tabel).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // cheile din lista de discrepante sunt "<sectiune>:<id>"
  await sb.from('discrepante_lista').delete().eq('luna_id', rand.luna_id).like('cheie', `%:${id}`)
  return NextResponse.json({ ok: true })
}
