import { NextRequest, NextResponse } from 'next/server'
import { generateBonuriPdfBytes } from '@/lib/bonuriPdf'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const firmaNume = req.nextUrl.searchParams.get('firmaNume') || 'Firma'
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const bytes = await generateBonuriPdfBytes(firmaId, firmaNume)
  if (!bytes) return NextResponse.json({ error: 'Nu există bonuri de descărcat' }, { status: 404 })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bonuri_${firmaNume.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf"`,
    },
  })
}
