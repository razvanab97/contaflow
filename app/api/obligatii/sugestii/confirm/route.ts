import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { applyObligatieState } from '@/lib/obligatii'

export async function POST(req: NextRequest) {
  const { sugestieId } = await req.json().catch(() => ({}))
  if (!sugestieId) return NextResponse.json({ error: 'sugestieId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: sugestie, error } = await sb
    .from('obligatii_sugestii')
    .select('id,luna_id,tip_key,tip_sugestie,valoare_data,status')
    .eq('id', sugestieId)
    .single()
  if (error || !sugestie) return NextResponse.json({ error: 'Sugestia nu a fost găsită' }, { status: 404 })
  if (sugestie.status !== 'noua') return NextResponse.json({ error: 'Sugestia a fost deja procesată' }, { status: 409 })

  try {
    if (sugestie.tip_sugestie === 'trimis') {
      await applyObligatieState(sb, sugestie.luna_id, sugestie.tip_key, { trimis: true })
    } else {
      await applyObligatieState(sb, sugestie.luna_id, sugestie.tip_key, { scadenta: sugestie.valoare_data })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Eroare aplicare sugestie' }, { status: 500 })
  }

  await sb.from('obligatii_sugestii').update({ status: 'confirmata', updated_at: new Date().toISOString() }).eq('id', sugestieId)

  // Alte mailuri pot confirma acelasi fapt (aceeasi obligatie, aceeasi luna, acelasi fel de
  // sugestie) - odata aplicata starea, restul devin redundante, nu mai cer confirmare separata.
  await sb.from('obligatii_sugestii')
    .update({ status: 'confirmata', updated_at: new Date().toISOString() })
    .eq('luna_id', sugestie.luna_id)
    .eq('tip_key', sugestie.tip_key)
    .eq('tip_sugestie', sugestie.tip_sugestie)
    .eq('status', 'noua')

  return NextResponse.json({ ok: true })
}
