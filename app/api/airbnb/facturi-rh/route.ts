import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaConfig } from '@/lib/firma-config'
import { accountingPeriod } from '@/lib/accounting-period'
import { listaFacturiRh } from '@/lib/oblio-rh'
import { potrivesteFacturiRh, faraRezervare, type RezervareRh } from '@/lib/cazare-rh-verificare'
import { importaFacturiRh, MODUL_FACTURI_RH } from '@/lib/facturi-rh-import'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'

// Toate facturile RH ale lunii (PDF-urile salvate) intr-un singur ZIP, in ordinea numerelor.
async function zipFacturiRh(firmaId: string, lunaId: string) {
  const sb = getServiceSupabase()
  const [{ data: firma }, { data: luna }, { data: docs, error }] = await Promise.all([
    sb.from('firme').select('nume').eq('id', firmaId).maybeSingle(),
    sb.from('luni_contabile').select('luna').eq('id', lunaId).eq('firma_id', firmaId).maybeSingle(),
    sb.from('documente').select('fisier_path,fisier_nume,numar_document').eq('firma_id', firmaId).eq('luna_id', lunaId).eq('modul', MODUL_FACTURI_RH).not('fisier_path', 'is', null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!docs?.length) return NextResponse.json({ error: 'Nu există facturi RH de descărcat în această lună' }, { status: 404 })
  const nr = (s?: string | null) => Number(String(s || '').match(/(\d+)/)?.[1] || 0)
  const ordonate = [...docs].sort((a, b) => nr(a.numar_document) - nr(b.numar_document))
  const zip = new JSZip()
  const folosit = new Set<string>()
  let adaugate = 0
  for (const d of ordonate) {
    if (!d.fisier_path) continue
    const { data: b } = await sb.storage.from('documente').download(d.fisier_path)
    if (!b) continue
    let nume = d.fisier_nume || `${d.numar_document || 'factura'}.pdf`
    if (folosit.has(nume)) nume = nume.replace(/\.pdf$/i, '') + ` (${adaugate + 1}).pdf` // nume duplicate -> unic in arhiva
    folosit.add(nume)
    zip.file(nume, await b.arrayBuffer())
    adaugate++
  }
  if (!adaugate) return NextResponse.json({ error: 'Fișierele facturilor nu s-au putut descărca' }, { status: 500 })
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  const lunaTxt = luna?.luna ? String(luna.luna).slice(0, 7) : lunaId
  const fisier = `${(firma?.nume || 'Facturi').replace(/\s+S\.?R\.?L\.?$/i, '')} - Facturi RH - ${lunaTxt}.zip`
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${fisier.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fisier)}` } })
}

// „Airbnb · Rezervări” la firmele care factureaza cazarea in Oblio (AB Textile, seria RH): rezervarile din CSV-ul
// lunii, fiecare cu factura RH gasita in Oblio, plus facturile RH din luna contabila fara rezervare in borderou.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  // Descarcă toate facturile RH ale lunii, intr-un ZIP (nu trece prin verificarea Oblio).
  if (req.nextUrl.searchParams.get('zip') === '1') return zipFacturiRh(firmaId, lunaId)
  const sb = getServiceSupabase()
  const [{ data: firma }, { data: luna }, { data: rez, error }] = await Promise.all([
    sb.from('firme').select('slug').eq('id', firmaId).maybeSingle(),
    sb.from('luni_contabile').select('luna').eq('id', lunaId).eq('firma_id', firmaId).maybeSingle(),
    sb.from('airbnb_facturi_asteptate').select('id,cod_confirmare,oaspete,suma,taxa_servicii,castiguri_brute,data_start,data_sfarsit')
      .eq('firma_id', firmaId).eq('luna_id', lunaId).order('data_sfarsit', { ascending: true }),
  ])
  if (!firma || !getFirmaConfig(firma.slug)?.facturiCazareOblio) return NextResponse.json({ error: 'Firma nu facturează cazarea în Oblio' }, { status: 400 })
  if (!luna) return NextResponse.json({ error: 'Luna nu a fost găsită' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const p = accountingPeriod(String(luna.luna).slice(0, 7))
  const de = `${p.month}-01`, pana = `${p.month}-${String(p.endDay).padStart(2, '0')}`
  let facturi
  try { facturi = await listaFacturiRh() } catch (e) {
    return NextResponse.json({ error: `Facturile RH nu s-au putut citi din Oblio: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }
  const randuri = potrivesteFacturiRh((rez || []) as RezervareRh[], facturi)
  // PDF-urile facturilor RH salvate in luna (facturi de vanzare), dupa codul rezervarii scris pe ele
  const { data: pdf } = await sb.from('documente').select('id,numar_document,cod_rezervare_airbnb,suma').eq('firma_id', firmaId).eq('luna_id', lunaId).eq('modul', MODUL_FACTURI_RH)
  const pdfuri = Object.fromEntries((pdf || []).filter(d => d.cod_rezervare_airbnb).map(d => [d.cod_rezervare_airbnb, { id: d.id, numar: d.numar_document, suma: d.suma }]))
  return NextResponse.json({ perioada: { de, pana }, randuri, pdfuri, pdfTotal: pdf?.length || 0, faraRezervare: faraRezervare(randuri, facturi, de, pana), anulate: facturi.filter(f => f.anulata && f.data >= de && f.data <= pana).length })
}

// Incarcarea PDF-urilor cu facturile RH (exportul Oblio, una sau mai multe facturi intr-un PDF): fiecare
// factura se salveaza separat, ca factura de vanzare, legata de rezervarea Airbnb scrisa pe ea.
export const maxDuration = 60
export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null)
  const firmaId = String(fd?.get('firmaId') || ''), lunaId = String(fd?.get('lunaId') || '')
  const fisiere = (fd?.getAll('file') || []).filter((f): f is File => f instanceof File)
  if (!firmaId || !lunaId || !fisiere.length) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const [{ data: firma }, { data: luna }] = await Promise.all([
    sb.from('firme').select('slug,nume').eq('id', firmaId).maybeSingle(),
    sb.from('luni_contabile').select('id').eq('id', lunaId).eq('firma_id', firmaId).maybeSingle(),
  ])
  if (!firma || !getFirmaConfig(firma.slug)?.facturiCazareOblio) return NextResponse.json({ error: 'Firma nu facturează cazarea în Oblio' }, { status: 400 })
  if (!luna) return NextResponse.json({ error: 'Luna nu a fost găsită' }, { status: 404 })
  const salvate = [], erori: string[] = []
  for (const f of fisiere) {
    if (f.type !== 'application/pdf' || f.size > 20 * 1024 * 1024) { erori.push(`${f.name}: acceptăm PDF de maximum 20 MB`); continue }
    try {
      const r = await importaFacturiRh(sb, { id: firmaId, prefix: firma.nume.replace(/\s+S\.?R\.?L\.?$/i, '') }, lunaId, new Uint8Array(await f.arrayBuffer()))
      if (!r.length) erori.push(`${f.name}: nu conține facturi RH`)
      salvate.push(...r)
    } catch (e) { erori.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return NextResponse.json({ salvate, erori })
}
