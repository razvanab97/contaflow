import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error } = await sb
    .from('documente')
    .select('fisier_path,fisier_nume,fisier_tip,modul')
    .eq('id', id)
    .eq('modul', 'acte_contabile')
    .single()
  if (error || !doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const { data: file, error: downloadError } = await sb.storage.from('documente').download(doc.fisier_path)
  if (downloadError || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  const fileName = String(doc.fisier_nume || 'document').replace(/["\r\n]/g, '_')
  return new NextResponse(Buffer.from(await file.arrayBuffer()), {
    headers: {
      'Content-Type': doc.fisier_tip || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
