import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  try {
    const { itemId, lunaId, completat } = await req.json()
    if (!itemId || !lunaId || typeof completat !== 'boolean')
      return NextResponse.json({ error: 'Date lipsă sau invalide' }, { status: 400 })

    const sb = getServiceSupabase()
    const { error } = await sb.from('checklist_items').update({ completat }).eq('id', itemId).eq('luna_id', lunaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: items, error: itemsError } = await sb.from('checklist_items').select('completat').eq('luna_id', lunaId)
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    const total = items?.length || 0
    const done = (items || []).filter(item => item.completat).length
    const progresPct = total ? Math.round((done / total) * 100) : 0
    const { error: monthError } = await sb.from('luni_contabile').update({ progres_pct: progresPct }).eq('id', lunaId)
    if (monthError) return NextResponse.json({ error: monthError.message }, { status: 500 })

    return NextResponse.json({ itemId, completat, done, total, progresPct })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
