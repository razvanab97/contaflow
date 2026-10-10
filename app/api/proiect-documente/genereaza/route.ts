import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { regenerateRaportLunar, SECTIUNE } from '@/lib/proiectRaport'
import { parseReportSections, REPORT_SECTIONS_KEY } from '@/lib/documentWorkspace/reportSections'

// Genereaza documentul curent din sablon + valorile din formular (fixe + personalizate), si il
// pune in locul documentului vizibil - acelasi mecanism de inlocuire ca la upload manual.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { firmaId?: string; perioada?: string; autorizatii?: string; obiective?: string; activitati?: string; sections?: unknown }
  const { firmaId, perioada, autorizatii, obiective, activitati } = body
  if (!firmaId || !perioada?.trim()) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  let sections
  try { if (body.sections !== undefined) sections = parseReportSections(body.sections) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Secțiuni invalide.' }, { status: 400 }) }

  const sb = getServiceSupabase()
  try {
    const fixed = { perioada: perioada.trim(), autorizatii: autorizatii || '', obiective: obiective || '', activitati: activitati || '' }
    if (sections !== undefined) {
      const { error } = await sb.from('proiect_raport_campuri_custom').upsert({
        firma_id: firmaId, sectiune: SECTIUNE, cheie: REPORT_SECTIONS_KEY,
        eticheta: 'Secțiuni suplimentare', valoare: JSON.stringify(sections),
      }, { onConflict: 'firma_id,sectiune,cheie' })
      if (error) throw new Error(error.message)
    }
    const newDoc = await regenerateRaportLunar(sb, firmaId, fixed)

    const { error: fieldsError } = await sb.from('proiect_raport_campuri').upsert({
      firma_id: firmaId, sectiune: SECTIUNE, ...fixed, updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' })
    if (fieldsError) throw new Error(fieldsError.message)

    return NextResponse.json({ doc: newDoc })
  } catch (e) {
    return NextResponse.json({ error: 'Generarea a eșuat: ' + String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
