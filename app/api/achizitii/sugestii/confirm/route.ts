import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { createAchizitie, updateAchizitieStatus } from '@/lib/achizitii'

export async function POST(req: NextRequest) {
  const { sugestieId, overrides } = await req.json().catch(() => ({}))
  if (!sugestieId) return NextResponse.json({ error: 'sugestieId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: sugestie, error } = await sb
    .from('achizitii_sugestii')
    .select('id,firma_id,luna_id,achizitie_id,actiune,denumire,valoare,sursa,status_propus,status')
    .eq('id', sugestieId)
    .single()
  if (error || !sugestie) return NextResponse.json({ error: 'Sugestia nu a fost găsită' }, { status: 404 })
  if (sugestie.status !== 'noua') return NextResponse.json({ error: 'Sugestia a fost deja procesată' }, { status: 409 })

  try {
    if (sugestie.actiune === 'actualizare_status' && sugestie.achizitie_id && sugestie.status_propus) {
      await updateAchizitieStatus(sb, sugestie.achizitie_id, sugestie.status_propus)
    } else {
      const denumire = overrides?.denumire || sugestie.denumire
      if (!denumire) return NextResponse.json({ error: 'Sugestia nu are o denumire clară — respinge și adaugă manual achiziția' }, { status: 400 })
      await createAchizitie(sb, {
        firmaId: sugestie.firma_id,
        lunaId: sugestie.luna_id,
        denumire,
        valoare: overrides?.valoare ?? sugestie.valoare,
        sursa: overrides?.sursa ?? sugestie.sursa,
      })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Eroare aplicare sugestie' }, { status: 500 })
  }

  await sb.from('achizitii_sugestii').update({ status: 'confirmata', updated_at: new Date().toISOString() }).eq('id', sugestieId)
  return NextResponse.json({ ok: true })
}
