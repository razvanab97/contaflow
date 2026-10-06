import { NextRequest, NextResponse } from 'next/server'
import { potriviriBonuriDeConfirmat } from '@/lib/tranzactii-potrivire'

export const dynamic = 'force-dynamic'

// Bonurile in asteptare cu plata gasita in Extras de cont - propuse spre confirmare (nu se leaga nimic aici).
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  try {
    return NextResponse.json({ potriviri: await potriviriBonuriDeConfirmat(firmaId) })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
