import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Redenumire generică a titlului/numărului unui document din tabelul `documente` — folosită de
// toate listele de fișiere din aplicație, ca să poți corecta manual când AI-ul greșește tipul/numele.
export async function PATCH(req: NextRequest) {
  const { id, fisier_nume, numar_document } = await req.json()
  if (!id) return NextResponse.json({ error: 'id lipsă' }, { status: 400 })

  const patch: Record<string, string> = {}
  if (typeof fisier_nume === 'string' && fisier_nume.trim()) patch.fisier_nume = fisier_nume.trim()
  if (typeof numar_document === 'string' && numar_document.trim()) patch.numar_document = numar_document.trim()
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Niciun câmp de actualizat' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('documente').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
