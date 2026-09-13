import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getServiceSupabase } from '@/lib/supabase/server'
import { generateFromTemplate } from '@/lib/docxRaportTemplate'

const SECTIUNE = 'raport_lunar'
const SECTIUNE_SABLON = 'raport_lunar_sablon'

const toLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean)

// Genereaza documentul curent din sablon + valorile din formular, si il pune in locul
// documentului vizibil (raport_lunar) - acelasi mecanism de inlocuire ca la upload manual.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { firmaId?: string; perioada?: string; autorizatii?: string; obiective?: string; activitati?: string }
  const { firmaId, perioada, autorizatii, obiective, activitati } = body
  if (!firmaId || !perioada?.trim()) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: sablon } = await sb.from('proiect_documente').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE_SABLON).maybeSingle()
  if (!sablon) return NextResponse.json({ error: 'Formularul nu e configurat încă' }, { status: 400 })

  const { data: sablonFile, error: dlErr } = await sb.storage.from('documente').download(sablon.fisier_path)
  if (dlErr || !sablonFile) return NextResponse.json({ error: 'Șablonul nu a putut fi descărcat' }, { status: 500 })

  try {
    const buffer = Buffer.from(await sablonFile.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    const templateXml = await zip.file('word/document.xml')!.async('string')

    const finalXml = generateFromTemplate(templateXml, {
      perioada: perioada.trim(),
      autorizatii: toLines(autorizatii || ''),
      obiective: toLines(obiective || ''),
      activitati: toLines(activitati || ''),
    })

    zip.file('word/document.xml', finalXml)
    const finalBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const { data: existing } = await sb.from('proiect_documente').select('fisier_path,fisier_nume,fisier_tip').eq('firma_id', firmaId).eq('sectiune', SECTIUNE).maybeSingle()
    const fisierNume = existing?.fisier_nume || sablon.fisier_nume
    const fisierTip = existing?.fisier_tip || sablon.fisier_tip
    const path = `${firmaId}/proiect-documente/${SECTIUNE}/${Date.now()}_${fisierNume}`

    const { error: upErr } = await sb.storage.from('documente').upload(path, finalBuffer, { contentType: fisierTip })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const { data: newDoc, error } = await sb.from('proiect_documente').upsert({
      firma_id: firmaId, sectiune: SECTIUNE, fisier_nume: fisierNume, fisier_path: path,
      fisier_tip: fisierTip, fisier_marime: finalBuffer.length, updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' }).select('id,fisier_nume,fisier_tip,fisier_marime,updated_at').single()

    if (error) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (existing?.fisier_path) await sb.storage.from('documente').remove([existing.fisier_path])

    await sb.from('proiect_raport_campuri').upsert({
      firma_id: firmaId, sectiune: SECTIUNE, perioada: perioada.trim(),
      autorizatii: autorizatii || '', obiective: obiective || '', activitati: activitati || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' })

    return NextResponse.json({ doc: newDoc })
  } catch (e) {
    return NextResponse.json({ error: 'Generarea a eșuat: ' + String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
