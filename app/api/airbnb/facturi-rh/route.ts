import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaConfig } from '@/lib/firma-config'
import { accountingPeriod } from '@/lib/accounting-period'
import { listaFacturiRh } from '@/lib/oblio-rh'
import { potrivesteFacturiRh, faraRezervare, type RezervareRh } from '@/lib/cazare-rh-verificare'
import { importaFacturiRh, MODUL_FACTURI_RH } from '@/lib/facturi-rh-import'

export const dynamic = 'force-dynamic'

// „Airbnb · Rezervări” la firmele care factureaza cazarea in Oblio (AB Textile, seria RH): rezervarile din CSV-ul
// lunii, fiecare cu factura RH gasita in Oblio, plus facturile RH din luna contabila fara rezervare in borderou.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
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
