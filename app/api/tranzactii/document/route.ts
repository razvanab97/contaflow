import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get('id')
  const inline = req.nextUrl.searchParams.get('preview') === '1'
  if (!documentId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error } = await sb
    .from('documente')
    .select('fisier_path,fisier_nume,fisier_tip')
    .eq('id', documentId)
    .eq('modul', 'extras')
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const { data: file, error: downloadError } = await sb.storage.from('documente').download(doc.fisier_path)
  if (downloadError || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  const fileName = String(doc.fisier_nume || 'document').replace(/["\r\n]/g, '_')
  const safeName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_')
  return new NextResponse(Buffer.from(await file.arrayBuffer()), {
    headers: {
      'Content-Type': doc.fisier_tip || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
