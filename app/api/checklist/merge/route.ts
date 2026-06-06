import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
export async function POST(req: NextRequest) {
  const { itemId, titlu } = await req.json()
  const sb = getServiceSupabase()
  const { data: docs } = await sb.from('documente').select('*').eq('checklist_item_id', itemId).order('created_at')
  if (!docs?.length) return NextResponse.json({ error: 'no docs' }, { status: 400 })
  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()
  for (const doc of docs) {
    const { data: blob } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!blob) continue
    const buf = Buffer.from(await blob.arrayBuffer())
    if (doc.fisier_tip==='application/pdf'||doc.fisier_nume?.endsWith('.pdf')) {
      try { const pdf=await PDFDocument.load(buf); const pages=await merged.copyPages(pdf,pdf.getPageIndices()); pages.forEach(p=>merged.addPage(p)) } catch {}
    } else if (doc.fisier_tip?.startsWith('image/')) {
      try {
        const pg=merged.addPage(); const img=doc.fisier_tip==='image/png'?await merged.embedPng(buf):await merged.embedJpg(buf)
        const {width:w,height:h}=img.scale(1); const pw=pg.getWidth(),ph=pg.getHeight(); const s=Math.min(pw/w,ph/h,1)
        pg.drawImage(img,{x:(pw-w*s)/2,y:(ph-h*s)/2,width:w*s,height:h*s})
      } catch {}
    }
  }
  const bytes = await merged.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type':'application/pdf', 'Content-Disposition':`attachment; filename="${(titlu||'doc').replace(/[^a-zA-Z0-9]/g,'_')}.pdf"` }
  })
}
