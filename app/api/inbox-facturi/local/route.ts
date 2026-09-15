import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('inbox_local_files')
    .select('id,fisier_nume,fisier_tip,fisier_marime,status,error_message,created_at')
    .eq('firma_id', firmaId)
    .eq('luna_id', lunaId)
    .in('status', ['pending', 'eroare'])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data || [] })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: row, error: findError } = await sb
    .from('inbox_local_files')
    .select('id,fisier_path,status')
    .eq('id', id)
    .single()
  if (findError || !row) return NextResponse.json({ error: 'Fișierul nu a fost găsit' }, { status: 404 })
  if (!['pending', 'eroare'].includes(row.status)) return NextResponse.json({ error: 'Fișierul a fost deja sincronizat' }, { status: 400 })

  await sb.storage.from('documente').remove([row.fisier_path])
  const { error } = await sb.from('inbox_local_files').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
