import { NextRequest, NextResponse } from 'next/server'
import { getFirmeNavData, getRestanteCount, getModuleCompletion } from '@/lib/queries'

// Date pentru shell-ul persistent (Sidebar+Header): lista de firme cu % pe luna cautata,
// numarul de facturi restante si modulele complet bifate pentru firma activa. Un singur
// apel, facut client-side din ShellClient doar cand luna/firma efectiva difera de cea
// randata initial pe server.
export async function GET(req: NextRequest) {
  const luna = req.nextUrl.searchParams.get('luna')
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const firmaSlug = req.nextUrl.searchParams.get('firmaSlug')
  if (!luna || !/^\d{4}-\d{2}$/.test(luna))
    return NextResponse.json({ error: 'Luna invalida' }, { status: 400 })

  const { firmeNav, luniMap } = await getFirmeNavData(luna)
  const lunaId = firmaId ? luniMap[`${firmaId}_${luna}`]?.id : undefined

  const [restanteCount, moduleComplete] = await Promise.all([
    firmaId ? getRestanteCount(firmaId) : Promise.resolve(0),
    firmaSlug && lunaId ? getModuleCompletion(firmaSlug, lunaId) : Promise.resolve({}),
  ])

  return NextResponse.json({ firmeNav, restanteCount, moduleComplete })
}
