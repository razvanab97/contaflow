import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const CAMPURI = { client: 'rezolvat_client', comision: 'rezolvat_comision' } as const

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { id, tip, rezolvat } = body as { id?:string; tip?:keyof typeof CAMPURI; rezolvat?:boolean }
  if (!id || !tip || !CAMPURI[tip] || typeof rezolvat !== 'boolean')
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('borderou_rezervari').update({ [CAMPURI[tip]]: rezolvat }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
