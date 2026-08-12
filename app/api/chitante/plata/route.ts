import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const { id, platit } = await req.json()
  if (!id || typeof platit !== 'boolean')
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('documente').select('id,fisier_path').eq('id', id).single()
  if (!doc || !String(doc.fisier_path).includes('/facturi-restante/'))
    return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const { error } = await sb.from('documente')
    .update({ platit, data_platii: platit ? new Date().toISOString().slice(0, 10) : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
