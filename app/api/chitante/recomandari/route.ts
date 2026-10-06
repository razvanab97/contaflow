import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { adaugaInFacturiChitanta, anuleazaAdaugareAutomata, autoAdaugaDinFisierLocal, calculeazaRecomandariChitanta } from '@/lib/recomandari-chitanta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Logica de recomandare si de mutare e in lib/recomandari-chitanta.ts (folosita si de sincronizarea
// folderului local).
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsă' }, { status: 400 })
  const rec = await calculeazaRecomandariChitanta(getServiceSupabase(), firmaId, lunaId)
  if (!rec) return NextResponse.json({ error: 'Luna nu există' }, { status: 404 })
  return NextResponse.json(rec)
}

// POST { docId, lunaId }             -> muta documentul din Inbox in Facturi + chitanta (clic pe „Adaugă aici”);
// POST { auto: true, firmaId, lunaId } -> adauga singure facturile sigur platite cash din fisierul local;
// POST { anuleaza: true, docId }      -> aduce inapoi in Inbox un document adaugat automat.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sb = getServiceSupabase()
  if (body.auto) {
    if (!body.firmaId || !body.lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    return NextResponse.json(await autoAdaugaDinFisierLocal(sb, String(body.firmaId), String(body.lunaId)))
  }
  if (body.anuleaza) {
    if (!body.docId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    const r = await anuleazaAdaugareAutomata(sb, String(body.docId))
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status })
  }
  if (!body.docId || !body.lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const r = await adaugaInFacturiChitanta(sb, String(body.docId), String(body.lunaId))
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status })
}
