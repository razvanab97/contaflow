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

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error } = await sb
    .from('documente')
    .select('id,fisier_path,tranzactie_id,modul')
    .eq('id', id)
    .single()
  if (error || !doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const path = String(doc.fisier_path || '')
  if (!path.includes('/facturi-chitanta/') && !path.includes('/facturi-restante/'))
    return NextResponse.json({ error: 'Acest document nu poate fi șters din această secțiune' }, { status: 403 })

  const { error: unlinkError } = await sb.from('tranzactii').update({ document_id: null }).eq('document_id', id)
  if (unlinkError) return NextResponse.json({ error: unlinkError.message }, { status: 500 })

  const { error: deleteError } = await sb.from('documente').delete().eq('id', id)
  if (deleteError) {
    if (doc.tranzactie_id) await sb.from('tranzactii').update({ document_id: id }).eq('id', doc.tranzactie_id)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  const { error: storageError } = await sb.storage.from('documente').remove([path])
  return NextResponse.json({ ok: true, warning: storageError?.message || null })
}
