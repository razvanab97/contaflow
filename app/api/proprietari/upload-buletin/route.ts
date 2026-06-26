import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File
  const proprietarId = fd.get('proprietarId') as string
  const firmaId = fd.get('firmaId') as string
  if (!file || !proprietarId || !firmaId) return NextResponse.json({ error: 'lipsă file/proprietarId/firmaId' }, { status: 400 })

  const sb = getServiceSupabase()
  const path = `${firmaId}/date-personale/buletin_${proprietarId}_${Date.now()}_${file.name}`

  const { error: upErr } = await sb.storage.from('documente').upload(path, file, {
    contentType: file.type, upsert: true,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { error } = await sb
    .from('proprietari')
    .update({ buletin_path: path, buletin_nume: file.name })
    .eq('id', proprietarId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, path, nume: file.name })
}
