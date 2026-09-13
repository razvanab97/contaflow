import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getServiceSupabase } from '@/lib/supabase/server'
import { detectCurrentFields, buildTemplate } from '@/lib/docxRaportTemplate'

const SECTIUNE = 'raport_lunar'
const SECTIUNE_SABLON = 'raport_lunar_sablon'

// Pas unic de configurare: ia documentul curent (raport_lunar), gaseste sectiunile care se schimba
// lunar (dupa text-ancora), le inlocuieste cu marcaje curate si salveaza rezultatul ca "sablon"
// separat (raport_lunar_sablon) - documentul vizibil/descarcabil de utilizator ramane neatins.
// Valorile curente detectate populeaza imediat formularul (proiect_raport_campuri).
export async function POST(req: NextRequest) {
  const { firmaId } = await req.json().catch(() => ({})) as { firmaId?: string }
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('proiect_documente').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Nu există niciun document încărcat încă' }, { status: 400 })
  if (!doc.fisier_tip?.includes('wordprocessingml') && !doc.fisier_path.toLowerCase().endsWith('.docx')) {
    return NextResponse.json({ error: 'Formularul funcționează doar cu documente .docx' }, { status: 400 })
  }

  const { data: file, error: dlError } = await sb.storage.from('documente').download(doc.fisier_path)
  if (dlError || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')!.async('string')

    const fields = detectCurrentFields(documentXml)
    const templateXml = buildTemplate(documentXml)

    zip.file('word/document.xml', templateXml)
    const templateBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const { data: existingSablon } = await sb.from('proiect_documente').select('fisier_path').eq('firma_id', firmaId).eq('sectiune', SECTIUNE_SABLON).maybeSingle()

    const path = `${firmaId}/proiect-documente/${SECTIUNE_SABLON}/${Date.now()}_${doc.fisier_nume}`
    const { error: upErr } = await sb.storage.from('documente').upload(path, templateBuffer, { contentType: doc.fisier_tip })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    await sb.from('proiect_documente').upsert({
      firma_id: firmaId, sectiune: SECTIUNE_SABLON, fisier_nume: doc.fisier_nume, fisier_path: path,
      fisier_tip: doc.fisier_tip, fisier_marime: templateBuffer.length, updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' })

    if (existingSablon?.fisier_path) await sb.storage.from('documente').remove([existingSablon.fisier_path])

    const { data: campuri, error: campuriErr } = await sb.from('proiect_raport_campuri').upsert({
      firma_id: firmaId, sectiune: SECTIUNE,
      perioada: fields.perioada.value,
      autorizatii: fields.autorizatii.values.join('\n'),
      obiective: fields.obiective.values.join('\n'),
      activitati: fields.activitati.values.join('\n'),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'firma_id,sectiune' }).select().single()
    if (campuriErr) return NextResponse.json({ error: campuriErr.message }, { status: 500 })

    return NextResponse.json({ campuri })
  } catch (e) {
    return NextResponse.json({ error: 'Configurarea a eșuat: ' + String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
