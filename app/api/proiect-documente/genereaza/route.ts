import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { regenerateRaportLunar, SECTIUNE } from '@/lib/proiectRaport'

// Genereaza documentul curent din sablon + valorile din formular (fixe + personalizate), si il
// pune in locul documentului vizibil - acelasi mecanism de inlocuire ca la upload manual.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { firmaId?: string; perioada?: string; autorizatii?: string; obiective?: string; activitati?: string }
  const { firmaId, perioada, autorizatii, obiective, activitati } = body
  if (!firmaId || !perioada?.trim()) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  try {
    const fixed = { perioada: perioada.trim(), autorizatii: autorizatii || '', obiective: obiective || '', activitati: activitati || '' }
    const newDoc = await regenerateRaportLunar(sb, firmaId, fixed)

    await sb.from('proiect_raport_campuri').upsert({
      firma_id: firmaId, sectiune: SECTIUNE, ...fixed, updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' })

    return NextResponse.json({ doc: newDoc })
  } catch (e) {
    return NextResponse.json({ error: 'Generarea a eșuat: ' + String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
