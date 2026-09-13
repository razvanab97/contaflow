import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getServiceSupabase } from '@/lib/supabase/server'
import { insertCustomMarker, revertCustomMarker } from '@/lib/docxRaportTemplate'
import { regenerateRaportLunar, SECTIUNE, SECTIUNE_SABLON } from '@/lib/proiectRaport'

interface SablonRow { id: string; fisier_nume: string; fisier_tip: string | null; fisier_path: string }

// Salveaza noul continut al sablonului (dupa marcare/dez-marcare unui camp de catre insertCustomMarker
// / revertCustomMarker) intr-un fisier nou de storage si sterge fisierul vechi.
async function saveSablon(sb: ReturnType<typeof getServiceSupabase>, sablon: SablonRow, firmaId: string, zip: JSZip) {
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const path = `${firmaId}/proiect-documente/${SECTIUNE_SABLON}/${Date.now()}_${sablon.fisier_nume}`

  const { error: upErr } = await sb.storage.from('documente').upload(path, buffer, { contentType: sablon.fisier_tip || undefined })
  if (upErr) throw new Error(upErr.message)

  const { error: sablonErr } = await sb.from('proiect_documente').update({
    fisier_path: path, fisier_marime: buffer.length, updated_at: new Date().toISOString(),
  }).eq('id', sablon.id)
  if (sablonErr) {
    await sb.storage.from('documente').remove([path])
    throw new Error(sablonErr.message)
  }
  await sb.storage.from('documente').remove([sablon.fisier_path])
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb.from('proiect_raport_campuri_custom').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campuri: data || [] })
}

// Marcheaza in sablon exact bucata de text selectata de utilizator direct din previzualizare
// (nu tot paragraful, doar portiunea selectata - restul textului din paragraf ramane neschimbat),
// apoi regenereaza imediat documentul vizibil ca schimbarea sa se vada pe loc.
export async function POST(req: NextRequest) {
  const { firmaId, selectedText, eticheta } = await req.json().catch(() => ({})) as { firmaId?: string; selectedText?: string; eticheta?: string }
  if (!firmaId || !selectedText?.trim() || !eticheta?.trim()) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: sablon } = await sb.from('proiect_documente').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE_SABLON).maybeSingle()
  if (!sablon) return NextResponse.json({ error: 'Configurează mai întâi formularul din documentul curent' }, { status: 400 })

  const { data: file, error: dlErr } = await sb.storage.from('documente').download(sablon.fisier_path)
  if (dlErr || !file) return NextResponse.json({ error: 'Șablonul nu a putut fi descărcat' }, { status: 500 })

  const cheie = `c${Date.now().toString(36)}`

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')!.async('string')

    const markedXml = insertCustomMarker(documentXml, selectedText, cheie)
    zip.file('word/document.xml', markedXml)
    await saveSablon(sb, sablon, firmaId, zip)

    const { data: campField, error: campErr } = await sb.from('proiect_raport_campuri_custom').insert({
      firma_id: firmaId, sectiune: SECTIUNE, cheie, eticheta: eticheta.trim(), valoare: selectedText.trim(),
    }).select().single()
    if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

    const doc = await regenerateRaportLunar(sb, firmaId)
    return NextResponse.json({ campField, doc })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}

// Actualizeaza valoarea unui camp personalizat si regenereaza documentul
export async function PATCH(req: NextRequest) {
  const { firmaId, id, valoare } = await req.json().catch(() => ({})) as { firmaId?: string; id?: string; valoare?: string }
  if (!firmaId || !id || valoare == null) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('proiect_raport_campuri_custom').update({ valoare }).eq('id', id).eq('firma_id', firmaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const doc = await regenerateRaportLunar(sb, firmaId)
    return NextResponse.json({ doc })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}

// Sterge un camp personalizat - portiunea lui din sablon redevine text static fix (valoarea
// curenta, inghetata), nu ramane un marcaj gol. "sau ramane standard unde nu trebuie sa editam."
export async function DELETE(req: NextRequest) {
  const { firmaId, id } = await req.json().catch(() => ({})) as { firmaId?: string; id?: string }
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: camp } = await sb.from('proiect_raport_campuri_custom').select('*').eq('id', id).eq('firma_id', firmaId).maybeSingle()
  if (!camp) return NextResponse.json({ error: 'Câmpul nu a fost găsit' }, { status: 404 })

  const { data: sablon } = await sb.from('proiect_documente').select('*').eq('firma_id', firmaId).eq('sectiune', SECTIUNE_SABLON).maybeSingle()
  if (!sablon) return NextResponse.json({ error: 'Șablonul nu a fost găsit' }, { status: 400 })

  const { data: file, error: dlErr } = await sb.storage.from('documente').download(sablon.fisier_path)
  if (dlErr || !file) return NextResponse.json({ error: 'Șablonul nu a putut fi descărcat' }, { status: 500 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')!.async('string')

    const revertedXml = revertCustomMarker(documentXml, camp.cheie, camp.valoare)
    zip.file('word/document.xml', revertedXml)
    await saveSablon(sb, sablon, firmaId, zip)

    const { error: delErr } = await sb.from('proiect_raport_campuri_custom').delete().eq('id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    const doc = await regenerateRaportLunar(sb, firmaId)
    return NextResponse.json({ doc })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
