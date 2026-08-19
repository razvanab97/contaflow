import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const sb = getServiceSupabase()
    const downloadId = req.nextUrl.searchParams.get('download')

    if (downloadId) {
      const inline = req.nextUrl.searchParams.get('preview') === '1'
      const { data: doc } = await sb.from('documente')
        .select('fisier_path,fisier_nume,fisier_tip').eq('id', downloadId).eq('modul', 'general').single()
      if (!doc?.fisier_path) return NextResponse.json({ error: 'Document negăsit' }, { status: 404 })
      const { data: file, error } = await sb.storage.from('documente').download(doc.fisier_path)
      if (error || !file) return NextResponse.json({ error: 'Eroare descărcare' }, { status: 500 })
      const fileName = String(doc.fisier_nume || 'document').replace(/["\r\n]/g, '_')
      return new NextResponse(Buffer.from(await file.arrayBuffer()), {
        headers: { 'Content-Type': doc.fisier_tip || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName}"` },
      })
    }

    const { data, error } = await sb.from('documente')
      .select('id,fisier_nume,fisier_tip,fisier_marime,created_at')
      .eq('modul', 'general')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ docs: data || [] })
  } catch (e: any) {
    console.error('GET /api/documente-generale:', e)
    return NextResponse.json({ error: e?.message || 'Eroare server' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File
  if (!file) return NextResponse.json({ error: 'lipsă fișier' }, { status: 400 })

  const sb = getServiceSupabase()
  const path = `general/${Date.now()}_${file.name}`

  const { error: upErr } = await sb.storage.from('documente').upload(path, file, {
    contentType: file.type, upsert: true,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error } = await sb.from('documente').insert({
    modul: 'general', tip_document: 'general',
    fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, fisier_marime: file.size,
  }).select('id,fisier_nume,fisier_tip,fisier_marime,created_at').single()
  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, doc: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'lipsă id' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error: fetchError } = await sb.from('documente')
    .select('fisier_path').eq('id', id).eq('modul', 'general').single()
  if (fetchError || !doc) return NextResponse.json({ error: 'Document negăsit' }, { status: 404 })

  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sb.storage.from('documente').remove([doc.fisier_path])
  return NextResponse.json({ ok: true })
}
