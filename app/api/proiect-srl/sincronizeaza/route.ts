import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { sincronizeazaProiectSrl, SLUG_PROIECT, SLUG_SRL } from '@/lib/proiect-srl-sync'
import { sameOrigin, WorkflowError } from '@/lib/proiect-workflow-store'

// Completeaza automat, pe luna data, ce au in comun PROIECT AB Textile si AB Textile SRL (vezi lib/proiect-srl-sync.ts).
// Primeste id-ul lunii oricareia dintre cele doua; pentru alte firme nu face nimic.
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req)
    const { lunaId } = await req.json().catch(() => ({}))
    if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })
    const sb = getServiceSupabase()
    const { data: luna } = await sb.from('luni_contabile').select('luna,firma_id').eq('id', lunaId).maybeSingle()
    if (!luna) return NextResponse.json({ error: 'Luna nu există' }, { status: 404 })
    const { data: firma } = await sb.from('firme').select('slug').eq('id', luna.firma_id).maybeSingle()
    if (!firma || (firma.slug !== SLUG_PROIECT && firma.slug !== SLUG_SRL)) return NextResponse.json({ copiate: [], platite: [], sarite: [] })
    return NextResponse.json(await sincronizeazaProiectSrl(sb, String(luna.luna).slice(0, 7)), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sincronizarea a eșuat' }, { status: e instanceof WorkflowError ? e.status : 500 })
  }
}
