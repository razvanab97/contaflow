import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { MODULE_DEFS } from '@/lib/firma-config'
import { applyObligatieState } from '@/lib/obligatii'

// Scadenta implicita a unei obligatii: ziua N din luna URMATOARE perioadei raportate. Atentie:
// luni_contabile.luna nu e perioada raportata, ci luna DE LUCRU - deja "luna urmatoare" perioadei
// (ex. randul cu luna="2026-09-01" inseamna "lucrat in Septembrie" pentru perioada 1-31 August -
// vezi lib/accounting-period.ts, accountingPeriod() face exact scaderea asta). Scadenta cade deci
// chiar in luna asta, nu inca o luna dupa ea. Calculata o singura data, la prima citire a lunii -
// dupa aceea utilizatorul o poate corecta din UI (vezi POST), iar valoarea corectata ramane
// (upsert nu o suprascrie la fiecare GET).
function scadentaImplicita(lunaISO: string, ziuaLunaUrmatoare: number): string {
  const [y, m] = lunaISO.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, ziuaLunaUrmatoare))
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const tasks = MODULE_DEFS['obligatii-recurente'].tasks

  const { data: existing, error } = await sb
    .from('obligatii_stari')
    .select('id,tip_key,scadenta,trimis')
    .eq('luna_id', lunaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byKey = new Map((existing || []).map(r => [r.tip_key, r]))
  const missing = tasks.filter(t => !byKey.has(t.key))

  // Prima vizualizare a acestei luni: seed cu scadenta implicita per tip, ca panoul sa arate
  // direct termene, nu campuri goale de completat manual in fiecare luna.
  if (missing.length) {
    const { data: lunaRow } = await sb.from('luni_contabile').select('luna').eq('id', lunaId).single()
    if (lunaRow?.luna) {
      const seed = missing.map(t => ({
        luna_id: lunaId,
        tip_key: t.key,
        scadenta: t.ziScadentaLunaUrmatoare != null ? scadentaImplicita(lunaRow.luna, t.ziScadentaLunaUrmatoare) : null,
        trimis: false,
      }))
      const { data: inserted, error: seedError } = await sb.from('obligatii_stari').upsert(seed, { onConflict: 'luna_id,tip_key' }).select('id,tip_key,scadenta,trimis')
      if (!seedError && inserted) for (const r of inserted) byKey.set(r.tip_key, r)
    }
  }

  const rows = tasks.map(t => ({
    id: byKey.get(t.key)?.id ?? null,
    tipKey: t.key,
    label: t.label,
    destinatar: t.destinatar || null,
    sursaInstructiuni: t.sursaInstructiuni || null,
    editabilLink: t.editabilLink || null,
    scadenta: byKey.get(t.key)?.scadenta ?? null,
    trimis: byKey.get(t.key)?.trimis ?? false,
  }))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { lunaId, tipKey, scadenta, trimis } = body
  if (!lunaId || !tipKey) return NextResponse.json({ error: 'lunaId/tipKey lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  try {
    await applyObligatieState(sb, lunaId, tipKey, { scadenta: scadenta ?? null, trimis: !!trimis })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Eroare salvare' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
