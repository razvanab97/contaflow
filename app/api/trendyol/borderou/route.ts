import { NextRequest, NextResponse } from 'next/server'
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
    const dataPlata = b.linii.map(l => l.dataPlata).filter(Boolean).sort().pop() || null
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

// Descarcare: GET ?download=<id> -> fisierul .xlsx original
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('download')
  if (!id) return NextResponse.json({ error: 'Borderoul lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
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
