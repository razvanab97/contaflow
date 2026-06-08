import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'

function safeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'documente'
}

export async function POST(req: NextRequest) {
  const { lunaId, title, scope, itemIds = [] } = await req.json()
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  let query = sb.from('documente').select('fisier_path,fisier_nume,fisier_tip,created_at').eq('luna_id', lunaId).eq('in_zip', true)
  if (scope?.section) query = query.like('fisier_path', `%/${scope.section}/%`)
  if (scope?.module && itemIds.length) query = query.in('checklist_item_id', itemIds)
  const { data: docs, error } = scope?.extras ? { data: [], error: null } : await query.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: statements } = (!scope || scope.extras)
    ? await sb.from('extrase').select('pdf_path,pdf_nume').eq('luna_id', lunaId)
    : { data: [] }
  if (!docs?.length && !statements?.length) return NextResponse.json({ error: 'Nu există documente PDF sau imagini în această categorie' }, { status: 404 })

  const merged = await PDFDocument.create()
  for (const statement of statements || []) {
    if (!statement.pdf_path) continue
    const { data } = await sb.storage.from('extrase-pdf').download(statement.pdf_path)
    if (!data) continue
    try {
      const source = await PDFDocument.load(Buffer.from(await data.arrayBuffer()))
      const pages = await merged.copyPages(source, source.getPageIndices())
      pages.forEach(page => merged.addPage(page))
    } catch {}
  }
  for (const doc of docs) {
    const { data } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!data) continue
    const bytes = Buffer.from(await data.arrayBuffer())
    try {
      if (doc.fisier_tip === 'application/pdf' || doc.fisier_nume?.toLowerCase().endsWith('.pdf')) {
        const source = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(source, source.getPageIndices())
        pages.forEach(page => merged.addPage(page))
      } else if (doc.fisier_tip?.startsWith('image/')) {
        const image = doc.fisier_tip === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
        const page = merged.addPage()
        const scale = Math.min(page.getWidth() / image.width, page.getHeight() / image.height, 1)
        page.drawImage(image, {
          x: (page.getWidth() - image.width * scale) / 2,
          y: (page.getHeight() - image.height * scale) / 2,
          width: image.width * scale,
          height: image.height * scale,
        })
      }
    } catch {}
  }
  if (!merged.getPageCount()) return NextResponse.json({ error: 'Documentele categoriei nu au putut fi convertite în PDF' }, { status: 422 })
  const bytes = await merged.save()
  const fileName = `${safeName(title || 'documente_generale')}.pdf`
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` },
  })
}
