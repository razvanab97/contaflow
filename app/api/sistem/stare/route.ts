import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getStareFirma } from '@/lib/sistem-lucru'
import { accountingFullLabel, etichetaLunaCompleta } from '@/lib/accounting-period'
import { esteLunaCalendaristica } from '@/lib/firma-config'

export const dynamic = 'force-dynamic'

// Starea lunii unei firme (aceeasi ca in "Sistem de lucru") - pentru pachetul catre contabil.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const [{ data: firma }, { data: luna }] = await Promise.all([
    sb.from('firme').select('id,slug,nume').eq('id', firmaId).single(),
    sb.from('luni_contabile').select('luna').eq('id', lunaId).single(),
  ])
  if (!firma || !luna) return NextResponse.json({ error: 'Firma sau luna nu există' }, { status: 404 })
  const key = String(luna.luna).slice(0, 7)
  const stare = await getStareFirma(sb, firma, key)
  return NextResponse.json({ stare, lunaKey: key, lunaLabel: etichetaLunaCompleta(key, esteLunaCalendaristica(firma.slug)), perioada: accountingFullLabel(key) })
}
