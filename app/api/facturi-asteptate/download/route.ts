import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function safeHeaders(fileName: string, contentType: string, inline: boolean) {
  const safeName = fileName.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\x20-\x7E]/g, '_')
  return {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const inline = req.nextUrl.searchParams.get('preview') === '1'
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('facturi_asteptate').select('fisier_path,fisier_nume,fisier_tip').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const { data: file, error } = await sb.storage.from('documente').download(doc.fisier_path)
  if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: safeHeaders(doc.fisier_nume, doc.fisier_tip || file.type, inline) })
}
