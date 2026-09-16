import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const CAMPURI = { client: 'rezolvat_client', comision: 'rezolvat_comision' } as const
const CAMPURI_NOTA = { client: 'nota_client', comision: 'nota_comision' } as const

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { id, tip, rezolvat, nota } = body as { id?:string; tip?:keyof typeof CAMPURI; rezolvat?:boolean; nota?:string|null }
  if (!id || !tip || !CAMPURI[tip] || typeof rezolvat !== 'boolean')
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })

  const update: Record<string, unknown> = { [CAMPURI[tip]]: rezolvat }
  if (nota !== undefined) update[CAMPURI_NOTA[tip]] = String(nota || '').trim() || null

  const sb = getServiceSupabase()
  const { error } = await sb.from('borderou_rezervari').update(update).eq('id', id)
  if (error) {
    // Coloana de notă poate lipsi daca migrarea (supabase_borderou_note.sql) inca n-a fost rulata -
    // nu lasam asta sa blocheze marcarea de baza (rezolvat), doar nota se pierde pana se aplica.
    if (error.code === '42703') {
      const { error: fallbackError } = await sb.from('borderou_rezervari').update({ [CAMPURI[tip]]: rezolvat }).eq('id', id)
      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 })
      return NextResponse.json({ ok: true, notaIgnorata: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
