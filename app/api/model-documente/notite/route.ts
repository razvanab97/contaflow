import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const SECTIUNI = ['raport_lunar', 'stat_plata_angajati', 'acte_contabile']

export async function PUT(req: NextRequest) {
  const { firmaId, sectiune, continut } = await req.json()
  if (!firmaId || !sectiune) return NextResponse.json({ error: 'lipsă firmaId/sectiune' }, { status: 400 })
  if (!SECTIUNI.includes(sectiune)) return NextResponse.json({ error: 'secțiune invalidă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('model_documente_notite')
    .upsert({ firma_id: firmaId, sectiune, continut, updated_at: new Date().toISOString() }, { onConflict: 'firma_id,sectiune' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
