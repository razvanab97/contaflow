import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import type { ClasificareEmail } from '@/lib/proiect-mail'

// Faza 2 a planului: cand am pornit sincronizarea (Faza 1), fiecare mail clasificat si-a pastrat
// raspunsul brut al AI-ului in proiect_mail_processed.raspuns_ai, chiar si partea de achizitie pe
// care Faza 1 inca nu o folosea. Acest backfill re-citeste acele raspunsuri deja calculate si
// creeaza achizitii_sugestii - fara sa mai bata Gmail sau sa mai cheme AI-ul o data in plus.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const firmaId = String(body.firmaId || '')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: source, error: sourceError } = await sb
    .from('inbox_surse_email')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('provider', 'gmail')
    .limit(1)
    .single()
  if (sourceError || !source) return NextResponse.json({ error: 'Contul Gmail pentru acest proiect nu e conectat' }, { status: 404 })

  const { data: procesate, error: procError } = await sb
    .from('proiect_mail_processed')
    .select('message_id,raspuns_ai')
    .eq('source_id', source.id)
    .in('clasificare', ['achizitie', 'ambele'])
  if (procError) return NextResponse.json({ error: procError.message }, { status: 500 })

  const { data: achizitiiRows } = await sb.from('proiect_achizitii').select('id').eq('firma_id', firmaId)
  const achizitiiIds = new Set((achizitiiRows || []).map(a => a.id))

  let create = 0
  for (const row of procesate || []) {
    const ai = row.raspuns_ai as ClasificareEmail | null
    const achizitie = ai?.achizitie
    if (!achizitie || (achizitie.actiune === 'neclar' && !achizitie.denumire)) continue

    const { error: insertError } = await sb.from('achizitii_sugestii').upsert({
      firma_id: firmaId,
      luna_id: null,
      achizitie_id: achizitie.achizitieIdPotrivit && achizitiiIds.has(achizitie.achizitieIdPotrivit) ? achizitie.achizitieIdPotrivit : null,
      actiune: achizitie.actiune,
      denumire: achizitie.denumire,
      valoare: achizitie.valoare,
      sursa: achizitie.sursa,
      status_propus: achizitie.statusPropus,
      incredere: achizitie.incredere,
      sursa_email_id: row.message_id,
      sursa_subiect: null,
      sursa_data: null,
      sursa_rezumat: achizitie.motiv,
    }, { onConflict: 'sursa_email_id', ignoreDuplicates: true })
    if (!insertError) create += 1
  }

  return NextResponse.json({ verificate: procesate?.length || 0, sugestiiNoi: create })
}
