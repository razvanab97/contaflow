import { NextRequest, NextResponse } from 'next/server'
import { getFirmeNavData, getRestanteCount } from '@/lib/queries'

// Date pentru shell-ul persistent (Sidebar+Header): lista de firme cu % pe luna cautata,
// plus numarul de facturi restante pentru firma activa. Un singur apel, facut client-side
// din ShellClient doar cand luna/firma efectiva difera de cea randata initial pe server.
export async function GET(req: NextRequest) {
  const luna = req.nextUrl.searchParams.get('luna')
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!luna || !/^\d{4}-\d{2}$/.test(luna))
    return NextResponse.json({ error: 'Luna invalida' }, { status: 400 })

  const [{ firmeNav }, restanteCount] = await Promise.all([
    getFirmeNavData(luna),
    firmaId ? getRestanteCount(firmaId) : Promise.resolve(0),
  ])

  return NextResponse.json({ firmeNav, restanteCount })
}
