import { NextRequest, NextResponse } from 'next/server'
import { getConcluzieTrendyol } from '@/lib/trendyol-concluzie'

export const maxDuration = 60

// Concluzia Trendyol a lunii (vanzari din borderouri -> comision -> transport separat -> taxe -> virat
// -> incasat in extras -> diferenta de curs -> rezultat net). Fara AI: borderourile sunt .xlsx.
export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })
  try {
    return NextResponse.json({ concluzie: await getConcluzieTrendyol(lunaId) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
