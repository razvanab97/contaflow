import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { ACHIZITIE_STATUSES as STATUSES } from '@/lib/achizitii'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ error: 'Status invalid' }, { status: 400 })
    patch.status = body.status
  }
  if (body.denumire !== undefined) patch.denumire = body.denumire
  if (body.valoare !== undefined) patch.valoare = body.valoare
  if (body.sursa !== undefined) patch.sursa = body.sursa
  if (body.scadenta !== undefined) patch.scadenta = body.scadenta
  if (body.nota !== undefined) patch.nota = body.nota

  const sb = getServiceSupabase()
  const { error } = await sb.from('proiect_achizitii').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = getServiceSupabase()

  const { data: docs } = await sb.from('documente').select('fisier_path').eq('achizitie_id', id)
  const { error } = await sb.from('proiect_achizitii').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (docs?.length) await sb.storage.from('documente').remove(docs.map(d => d.fisier_path))
  return NextResponse.json({ ok: true })
}
