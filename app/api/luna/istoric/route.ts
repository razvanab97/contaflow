import { NextRequest, NextResponse } from 'next/server'
import { getIstoricLunar } from '@/lib/istoric'

// Tendinta pe ultimele luni (incasari/plati RON + progres task-uri) pentru sparkline-uri.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const firmaSlug = req.nextUrl.searchParams.get('firmaSlug')
  const luna = req.nextUrl.searchParams.get('luna')
  if (!firmaId || !firmaSlug || !luna || !/^\d{4}-\d{2}$/.test(luna))
    return NextResponse.json({ error: 'Parametri lipsă' }, { status: 400 })
  try {
    return NextResponse.json({ istoric: await getIstoricLunar(firmaId, firmaSlug, luna) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
