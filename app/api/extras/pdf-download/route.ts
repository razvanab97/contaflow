import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const extrasId = req.nextUrl.searchParams.get('extrasId')
  if (!extrasId) return NextResponse.json({ error: 'extrasId lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: extras } = await sb.from('extrase').select('pdf_path,pdf_nume').eq('id', extrasId).single()
  if (!extras?.pdf_path) return NextResponse.json({ error: 'PDF-ul nu a fost salvat' }, { status: 404 })

  const { data, error } = await sb.storage.from('extrase-pdf').download(extras.pdf_path)
  if (error || !data) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  const buf = Buffer.from(await data.arrayBuffer())
  const fileName = extras.pdf_nume || 'extras.pdf'

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
