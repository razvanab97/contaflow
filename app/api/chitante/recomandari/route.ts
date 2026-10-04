import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { accountingPeriod } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

// "Facturi + chitanta": facturile din fisierele importate (Inbox Facturi - folder local, Gmail,
// e-Factura) care par platite CASH, ca sa nu mai fie cautate manual:
//  - au chitanta incarcata (tip chitanta / "chitanta" in nume), separat sau pe acelasi document;
//  - furnizorul a mai fost platit cash (are facturi in Facturi + chitanta in alte luni, ex. VMD);
//  - nicio plata din extrasele firmei nu are aceeasi suma (+/- 45 de zile) -> "posibil cash".
// Doar documente inca neasociate unei plati bancare, din perioada contabila a lunii.

function ascii(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't').toLowerCase()
}
function furnizorCurat(f: string | null) {
  const p = (f || '').split('|')[0].trim()
  return /^(DP_DATA:|Ata(ș|s)ament |Sursa:|Categorie:|\{)/i.test(p) ? '' : p
}
// Cheia furnizorului: primele cuvinte semnificative ("VMD INVESTMENT SRL" -> "vmd investment").
function cheieFurnizor(f: string | null) {
  return ascii(furnizorCurat(f)).replace(/\b(s\.?c\.?|s\.?r\.?l\.?|s\.?a\.?|srl|sa|pfa|ii)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join(' ')
}
function sursa(f: string | null) {
  const l = (f || '').split('|').find(p => p.trim().toLowerCase().startsWith('sursa:'))?.toLowerCase() || ''
  return l.includes('folder local') || l.includes('fisiere locale') || l.includes('fișiere locale') ? 'Folder local' : l.includes('gmail') ? 'Gmail' : l.includes('oblio') ? 'e-Factură' : 'Inbox'
}
const RE_CHITANTA = /chitant|numerar|\bcash\b|bon fiscal/
const FARA_CASH = /dante|emag|airbnb|booking|anthropic|openai|google|apple|microsoft|meta platforms|facebook|stripe|paypal/

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: luna } = await sb.from('luni_contabile').select('luna').eq('id', lunaId).single()
  if (!luna) return NextResponse.json({ error: 'Luna nu există' }, { status: 404 })
  const p = accountingPeriod(String(luna.luna).slice(0, 7))
  const de = `${p.month}-01`, pana = `${p.month}-${String(p.endDay).padStart(2, '0')}`

  const [{ data: inbox }, { data: istoricCash }, { data: plati }] = await Promise.all([
    sb.from('documente').select('id,fisier_nume,furnizor,numar_document,suma,valuta,data_document,tip_document,created_at')
      .eq('firma_id', firmaId).like('fisier_path', '%/inbox-facturi/%').is('tranzactie_id', null).limit(2000),
    sb.from('documente').select('furnizor').eq('firma_id', firmaId).like('fisier_path', '%/facturi-chitanta/%').limit(2000),
    sb.from('tranzactii').select('suma,data_tranzactie').eq('firma_id', firmaId).eq('tip', 'debit').limit(5000),
  ])
  const furnizoriCash = new Set((istoricCash || []).map(d => cheieFurnizor(d.furnizor)).filter(Boolean))
  const inPerioada = (inbox || []).filter(d => !d.data_document || (d.data_document >= de && d.data_document <= pana))
  const areChitanta = (d: { tip_document: string | null; fisier_nume: string | null; furnizor: string | null }) =>
    d.tip_document === 'chitanta' || RE_CHITANTA.test(ascii(`${d.fisier_nume || ''} ${furnizorCurat(d.furnizor)}`))
  // Furnizorii care au o chitanta incarcata in perioada -> factura lor e "pereche" cu ea.
  const cuChitanta = new Set(inPerioada.filter(areChitanta).map(d => cheieFurnizor(d.furnizor)).filter(Boolean))
  const platitBanca = (suma: number | null, data: string | null) => suma != null && (plati || []).some(t =>
    Math.abs(Math.abs(Number(t.suma)) - Math.abs(suma)) < 0.02 &&
    (!data || Math.abs(Date.parse(t.data_tranzactie) - Date.parse(data)) <= 45 * 86_400_000))

  const rezultat = inPerioada.map(d => {
    const k = cheieFurnizor(d.furnizor)
    const motive: string[] = []
    if (areChitanta(d)) motive.push(d.tip_document === 'chitanta' ? 'chitanță încărcată' : 'chitanță pe document')
    else if (k && cuChitanta.has(k)) motive.push('are chitanță pereche')
    if (k && furnizoriCash.has(k)) motive.push('furnizor plătit cash și în alte luni')
    const faraBanca = !platitBanca(d.suma != null ? Number(d.suma) : null, d.data_document)
    if (faraBanca && d.suma != null) motive.push('nicio plată cu această sumă în extras')
    return {
      id: d.id, fisierNume: d.fisier_nume, furnizor: furnizorCurat(d.furnizor), numar: d.numar_document || null,
      suma: d.suma != null ? Number(d.suma) : null, valuta: d.valuta || 'RON', data: d.data_document,
      tip: d.tip_document, sursa: sursa(d.furnizor), motive,
      sigur: motive.some(m => m !== 'nicio plată cu această sumă în extras'),
      // o plata bancara cu aceeasi suma exista -> aproape sigur NU e cash, nu o recomandam deloc
      exclusa: !faraBanca && !areChitanta(d),
    }
  }).filter(r => !r.exclusa && r.motive.length)
    // "posibil cash" doar pentru facturi in lei, cu suma pozitiva, de la furnizori care nu se deconteaza
    // altfel (eMAG/Dante - retinute din aviz, platformele de cazare, abonamente online in valuta).
    .filter(r => r.sigur || (r.valuta === 'RON' && (r.suma ?? 0) > 0 && !FARA_CASH.test(ascii(r.furnizor))))
    .sort((a, b) => Number(b.sigur) - Number(a.sigur) || String(a.furnizor).localeCompare(String(b.furnizor)) || String(a.data || '').localeCompare(String(b.data || '')))

  return NextResponse.json({
    perioada: { de, pana },
    recomandate: rezultat.filter(r => r.sigur).map(({ exclusa, ...r }) => r),
    posibile: rezultat.filter(r => !r.sigur).map(({ exclusa, ...r }) => r),
  })
}

// Muta documentul din Inbox Facturi in "Facturi + chitanta" al lunii (fisierul se muta in storage,
// ca sa apara in modul si la export in sectiunea corecta).
export async function POST(req: NextRequest) {
  const { docId, lunaId } = await req.json().catch(() => ({}))
  if (!docId || !lunaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: d } = await sb.from('documente').select('id,firma_id,fisier_path,fisier_nume,tranzactie_id').eq('id', docId).single()
  if (!d) return NextResponse.json({ error: 'Documentul nu există' }, { status: 404 })
  if (!String(d.fisier_path).includes('/inbox-facturi/')) return NextResponse.json({ error: 'Documentul nu mai este în Inbox Facturi' }, { status: 409 })
  if (d.tranzactie_id) return NextResponse.json({ error: 'Documentul e deja asociat unei plăți din extras' }, { status: 409 })
  const nume = String(d.fisier_path).split('/').pop()
  const nou = `${d.firma_id}/${lunaId}/facturi-chitanta/${Date.now()}_${nume}`
  const { error: mvErr } = await sb.storage.from('documente').move(d.fisier_path, nou)
  if (mvErr) return NextResponse.json({ error: `Fișierul nu a putut fi mutat: ${mvErr.message}` }, { status: 500 })
  const { error } = await sb.from('documente').update({ fisier_path: nou, luna_id: lunaId, modul: 'acte_contabile' }).eq('id', d.id)
  if (error) {
    await sb.storage.from('documente').move(nou, d.fisier_path)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
