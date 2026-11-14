import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaConfig } from '@/lib/firma-config'
import { accountingPeriod } from '@/lib/accounting-period'
import { listaFacturiRh } from '@/lib/oblio-rh'
import { potrivesteFacturiRh, faraRezervare, type RezervareRh } from '@/lib/cazare-rh-verificare'

export const dynamic = 'force-dynamic'

// „Airbnb · Borderou” la firmele care factureaza cazarea in Oblio (AB Textile, seria RH): rezervarile din CSV-ul
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
  return NextResponse.json({ perioada: { de, pana }, randuri, faraRezervare: faraRezervare(randuri, facturi, de, pana), anulate: facturi.filter(f => f.anulata && f.data >= de && f.data <= pana).length })
}
