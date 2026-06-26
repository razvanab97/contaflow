import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

export async function POST(req: NextRequest) {
  const { itemId, titlu } = await req.json()
  const r = await fetch(`${SB}/rest/v1/documente?checklist_item_id=eq.${itemId}&select=*&order=created_at`, { headers: H })
  const docs = r.ok ? await r.json() : []
  if (!docs.length) return NextResponse.json({ error: 'no docs' }, { status: 400 })

  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()

  for (const doc of docs) {
    const dlRes = await fetch(`${SB}/storage/v1/object/documente/${doc.fisier_path}`, { headers: H })
    if (!dlRes.ok) continue
    const buf = Buffer.from(await dlRes.arrayBuffer())
    if (doc.fisier_tip === 'application/pdf' || doc.fisier_nume?.endsWith('.pdf')) {
      try { const pdf = await PDFDocument.load(buf); const pages = await merged.copyPages(pdf, pdf.getPageIndices()); pages.forEach(p => merged.addPage(p)) } catch {}
    } else if (doc.fisier_tip?.startsWith('image/')) {
      try {
        const pg = merged.addPage()
        const img = doc.fisier_tip === 'image/png' ? await merged.embedPng(buf) : await merged.embedJpg(buf)
        const { width: w, height: h } = img.scale(1)
        const pw = pg.getWidth(), ph = pg.getHeight(), s = Math.min(pw/w, ph/h, 1)
        pg.drawImage(img, { x:(pw-w*s)/2, y:(ph-h*s)/2, width:w*s, height:h*s })
      } catch {}
    }
  }

  const bytes = await merged.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${(titlu||'doc').replace(/[^a-zA-Z0-9]/g,'_')}.pdf"` }
  })
}
