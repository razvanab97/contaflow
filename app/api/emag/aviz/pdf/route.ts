import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'

async function embedDoc(merged: PDFDocument, bytes: Buffer, type: string, name: string) {
  try {
    if (type === 'application/pdf' || name?.toLowerCase().endsWith('.pdf')) {
      let source: PDFDocument
      try {
        source = await PDFDocument.load(bytes)
      } catch {
        source = await PDFDocument.load(bytes, { ignoreEncryption: true })
      }
      if (source.getPageCount() === 0) return
      const pages = await merged.copyPages(source, source.getPageIndices())
      pages.forEach(page => merged.addPage(page))
    } else if (type?.startsWith('image/')) {
      const image = type === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
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

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'Avizul lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: aviz } = await sb.from('documente').select('id,fisier_path,fisier_nume,fisier_tip').eq('id', documentId).single()
  if (!aviz) return NextResponse.json({ error: 'Avizul nu a fost găsit' }, { status: 404 })

  const { data: facturi } = await sb.from('emag_avize_facturi').select('factura_document_id').eq('document_id', documentId).not('factura_document_id', 'is', null)
  const facturaIds = (facturi || []).map(f => f.factura_document_id).filter(Boolean) as string[]
  const { data: facturaDocs } = facturaIds.length
    ? await sb.from('documente').select('id,fisier_path,fisier_nume,fisier_tip,created_at').in('id', facturaIds).order('created_at', { ascending: true })
    : { data: [] }

  const merged = await PDFDocument.create()
  const { data: avizFile } = await sb.storage.from('documente').download(aviz.fisier_path)
  if (avizFile) await embedDoc(merged, Buffer.from(await avizFile.arrayBuffer()), aviz.fisier_tip || 'application/pdf', aviz.fisier_nume)

  for (const doc of facturaDocs || []) {
    const { data: file } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!file) continue
    await embedDoc(merged, Buffer.from(await file.arrayBuffer()), doc.fisier_tip || 'application/pdf', doc.fisier_nume)
  }

  if (!merged.getPageCount())
    return NextResponse.json({ error: 'Documentul nu a putut fi generat' }, { status: 422 })

  const bytes = await merged.save()
  const fileName = String(aviz.fisier_nume || 'aviz').replace(/\.pdf$/i, '') + '_complet.pdf'
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
