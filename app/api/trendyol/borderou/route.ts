import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getServiceSupabase } from '@/lib/supabase/server'
import { citesteBorderouTrendyol, ordinPlataDinNume } from '@/lib/trendyol-borderou'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const lei = (n: number) => n.toFixed(2).replace('.', ',')

// Borderouri Trendyol (PaymentOrderDetail_<ordin>_<vanzator>.xlsx): unul pe ordin de plata. Numarul
// ordinului vine din numele fisierului (Trendyol nu il pune in continut) si leaga borderoul de incasarea
// din extras. Acelasi ordin incarcat din nou inlocuieste borderoul vechi.
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const files = fd.getAll('files') as File[]
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  if (!files.length || !firmaId || !lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: firma } = await sb.from('firme').select('nume').eq('id', firmaId).single()
  const numeFirma = String(firma?.nume || '').replace(/\s+S\.?R\.?L\.?$/i, '')

  const rezultate: { fisier: string; ok: boolean; text: string; ordin?: string }[] = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const ordin = ordinPlataDinNume(file.name)
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) { rezultate.push({ fisier: file.name, ok: false, text: 'nu e un fișier .xlsx' }); continue }
    if (!ordin) { rezultate.push({ fisier: file.name, ok: false, text: 'numele trebuie să fie cel original de la Trendyol: PaymentOrderDetail_<nr. ordin>_….xlsx' }); continue }
    let b
    try { b = await citesteBorderouTrendyol(bytes, file.name) } catch (e) { rezultate.push({ fisier: file.name, ok: false, text: e instanceof Error ? e.message : String(e) }); continue }
    const dataPlata = (await dataIncasare(sb, lunaId, ordin)) || b.linii.map(l => l.dataPlata).filter(Boolean).sort().pop() || null
    const path = `${firmaId}/${lunaId}/trendyol-borderou/PaymentOrderDetail_${ordin}_${Date.now()}.xlsx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, bytes, { contentType: XLSX_MIME })
    if (upErr) { rezultate.push({ fisier: file.name, ok: false, text: upErr.message }); continue }
    const fisierNume = `${numeFirma} - Borderou Trendyol ${ordin}${dataPlata ? ` - ${dataPlata.split('-').reverse().join('.')}` : ''} - ${lei(b.totalVanzator)} ${b.valuta}.xlsx`
    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: lunaId, modul: 'trendyol', tip_document: 'borderou',
      furnizor: 'Trendyol B.V.', numar_document: ordin, data_document: dataPlata, suma: b.totalVanzator, valuta: b.valuta,
      fisier_path: path, fisier_nume: fisierNume, fisier_tip: XLSX_MIME, fisier_marime: bytes.length, in_zip: true,
    }).select('id').single()
    if (error || !doc) { await sb.storage.from('documente').remove([path]); rezultate.push({ fisier: file.name, ok: false, text: error?.message || 'Eroare salvare' }); continue }
    // acelasi ordin incarcat inainte -> inlocuit
    const { data: vechi } = await sb.from('documente').select('id,fisier_path').eq('luna_id', lunaId).eq('modul', 'trendyol')
      .eq('tip_document', 'borderou').eq('numar_document', ordin).neq('id', doc.id)
    if (vechi?.length) {
      await sb.from('documente').delete().in('id', vechi.map(v => v.id))
      await sb.storage.from('documente').remove(vechi.map(v => v.fisier_path).filter(Boolean))
    }
    rezultate.push({ fisier: file.name, ok: true, ordin, text: `borderou ${ordin} · ${b.linii.length} linii · ${lei(b.totalVanzator)} ${b.valuta}${vechi?.length ? ' (înlocuit)' : ''}` })
  }
  return NextResponse.json({ rezultate })
}

// Data borderoului (pentru eCap) = ziua in care Trendyol a platit, din extrasul lunii: incasarea are in
// descriere numarul ordinului de plata („Incasare SEPA 1141353 - 76968338 - TRENDYOL ...”).
async function dataIncasare(sb: ReturnType<typeof getServiceSupabase>, lunaId: string, ordin: string) {
  const { data: extrase } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  const ids = (extrase || []).map(e => e.id)
  if (!ids.length) return null
  const { data: tx } = await sb.from('tranzactii').select('data_tranzactie').in('extras_id', ids).eq('tip', 'credit')
    .ilike('descriere', `%${ordin}%TRENDYOL%`).order('data_tranzactie').limit(1)
  return tx?.[0]?.data_tranzactie || null
}

// GET ?lunaId=… -> lista borderourilor lunii · ?download=<id> -> un .xlsx · ?zip=<lunaId> -> toate, intr-un .zip
export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const lunaLista = req.nextUrl.searchParams.get('lunaId')
  if (lunaLista) {
    const { data: docs } = await sb.from('documente').select('id,numar_document,data_document,suma,valuta,fisier_nume')
      .eq('luna_id', lunaLista).eq('modul', 'trendyol').eq('tip_document', 'borderou').order('data_document')
    // borderou incarcat inainte de extras: data se corecteaza singura cand plata apare in extras
    const data = await Promise.all((docs || []).map(async d => {
      const dinExtras = d.numar_document ? await dataIncasare(sb, lunaLista, d.numar_document) : null
      if (dinExtras && dinExtras !== d.data_document) {
        const fisier_nume = d.data_document ? d.fisier_nume.replace(d.data_document.split('-').reverse().join('.'), dinExtras.split('-').reverse().join('.')) : d.fisier_nume
        await sb.from('documente').update({ data_document: dinExtras, fisier_nume }).eq('id', d.id)
        return { ...d, data_document: dinExtras, fisier_nume }
      }
      return d
    }))
    data.sort((a, b) => String(a.data_document).localeCompare(String(b.data_document)))
    return NextResponse.json({ borderouri: (data || []).map(d => ({ id: d.id, ordin: d.numar_document, data: d.data_document, suma: d.suma == null ? null : Number(d.suma), valuta: d.valuta, fisier: d.fisier_nume })) })
  }
  const lunaZip = req.nextUrl.searchParams.get('zip')
  if (lunaZip) {
    const { data: docs } = await sb.from('documente').select('fisier_path,fisier_nume')
      .eq('luna_id', lunaZip).eq('modul', 'trendyol').eq('tip_document', 'borderou').order('data_document')
    if (!docs?.length) return NextResponse.json({ error: 'Niciun borderou încărcat' }, { status: 404 })
    const zip = new JSZip()
    for (const d of docs) {
      const { data: f } = await sb.storage.from('documente').download(d.fisier_path)
      if (f) zip.file(d.fisier_nume, new Uint8Array(await f.arrayBuffer()))
    }
    const buf = await zip.generateAsync({ type: 'uint8array' })
    return new NextResponse(buf as unknown as BodyInit, { headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('Borderouri Trendyol.zip')}`,
    } })
  }
  const id = req.nextUrl.searchParams.get('download')
  if (!id) return NextResponse.json({ error: 'Borderoul lipsește' }, { status: 400 })
  const { data: d } = await sb.from('documente').select('fisier_path,fisier_nume').eq('id', id).eq('modul', 'trendyol').eq('tip_document', 'borderou').single()
  if (!d) return NextResponse.json({ error: 'Borderoul nu a fost găsit' }, { status: 404 })
  const { data: file } = await sb.storage.from('documente').download(d.fisier_path)
  if (!file) return NextResponse.json({ error: 'Fișierul lipsește din stocare' }, { status: 404 })
  return new NextResponse(file, { headers: {
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.fisier_nume)}`,
  } })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Borderoul lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: d } = await sb.from('documente').select('id,fisier_path').eq('id', id).eq('modul', 'trendyol').eq('tip_document', 'borderou').single()
  if (!d) return NextResponse.json({ error: 'Borderoul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from('documente').remove([d.fisier_path])
  return NextResponse.json({ ok: true })
}
