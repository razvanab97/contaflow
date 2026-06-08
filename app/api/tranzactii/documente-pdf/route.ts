import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { PDFDocument } from 'pdf-lib'

export async function POST(req: NextRequest) {
  try {
    const { lunaId, firmaNume, luna } = await req.json()
    if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })

    const sb = getServiceSupabase()
    const { data: docs, error } = await sb
      .from('documente')
      .select('id,fisier_path,fisier_nume,fisier_tip,created_at')
      .eq('luna_id', lunaId)
      .eq('modul', 'extras')
      .eq('in_zip', true)
      .not('tranzactie_id', 'is', null)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!docs?.length) return NextResponse.json({ error: 'Nu există documente asociate tranzacțiilor' }, { status: 400 })

    const merged = await PDFDocument.create()
    let addedPages = 0

    for (const doc of docs) {
      const { data: file } = await sb.storage.from('documente').download(doc.fisier_path)
      if (!file) continue
      const bytes = Buffer.from(await file.arrayBuffer())

      try {
        if (doc.fisier_tip === 'application/pdf' || doc.fisier_nume?.toLowerCase().endsWith('.pdf')) {
          const pdf = await PDFDocument.load(bytes)
          const pages = await merged.copyPages(pdf, pdf.getPageIndices())
          pages.forEach(page => merged.addPage(page))
          addedPages += pages.length
        } else if (doc.fisier_tip === 'image/png' || doc.fisier_tip === 'image/jpeg') {
          const image = doc.fisier_tip === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes)
          const page = merged.addPage()
          const { width, height } = image.scale(1)
          const scale = Math.min(page.getWidth() / width, page.getHeight() / height, 1)
          page.drawImage(image, {
            x: (page.getWidth() - width * scale) / 2,
            y: (page.getHeight() - height * scale) / 2,
            width: width * scale,
            height: height * scale,
          })
          addedPages++
        }
      } catch {}
    }

    if (addedPages === 0)
      return NextResponse.json({ error: 'Documentele salvate nu au putut fi convertite în PDF' }, { status: 422 })

    const bytes = await merged.save()
    const safeName = `${firmaNume || 'firma'}_${luna || 'luna'}_documente_tranzactii`.replace(/[^a-zA-Z0-9_-]/g, '_')
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
