import { NextRequest, NextResponse } from 'next/server'
import { generateNotePdfBytes } from '@/lib/notePdf'

export async function POST(req: NextRequest) {
  const { lunaId, firmaNume, lunaLabel } = await req.json()
  if (!lunaId) return NextResponse.json({ error: 'Luna contabilă lipsește' }, { status: 400 })

  const bytes = await generateNotePdfBytes(lunaId, firmaNume, lunaLabel)
  if (!bytes) return NextResponse.json({ error: 'Nu există tranzacții cu note' }, { status: 404 })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="note_tranzactii.pdf"`,
    },
  })
}
