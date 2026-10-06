import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { reconciliazaFacturiRestante } from '@/lib/facturi-restante'

export const maxDuration = 60

// Marcheaza ca platite facturile restante pentru care exista deja plata in Extras de cont (legatura
// directa, numarul facturii in descrierea platii, plata libera cu aceeasi suma + furnizor, sau duplicat
// al unei plati deja legate). Idempotent; o plata anulata manual nu se mai marcheaza singura.
export async function POST(req: NextRequest) {
  const { firmaId, dryRun } = await req.json().catch(() => ({}))
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  try {
    return NextResponse.json(await reconciliazaFacturiRestante(getServiceSupabase(), String(firmaId), { dryRun: dryRun === true }))
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
