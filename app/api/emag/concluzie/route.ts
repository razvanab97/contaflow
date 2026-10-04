import { NextRequest, NextResponse } from 'next/server'
import { getConcluzieEmag } from '@/lib/emag-concluzie'

export const maxDuration = 60

// Concluzia eMAG a lunii (vanzari din avize -> retineri -> incasat in extras -> facturi Dante
// separate -> curierat -> rezultat net). Prima deschidere citeste avizele cu AI (apoi din cache).
export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })
  try {
    return NextResponse.json({ concluzie: await getConcluzieEmag(lunaId) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
