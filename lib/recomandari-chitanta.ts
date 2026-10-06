import { getServiceSupabase } from '@/lib/supabase/server'
import { accountingPeriod } from '@/lib/accounting-period'

// "Facturi + chitanta": facturile din fisierele importate (Inbox Facturi - folder local, Gmail,
// e-Factura) care par platite CASH, ca sa nu mai fie cautate manual:
//  - au chitanta incarcata (tip chitanta / "chitanta" in nume), separat sau pe acelasi document;
//  - furnizorul a mai fost platit cash (are facturi in Facturi + chitanta in alte luni, ex. VMD);
//  - nicio plata din extrasele firmei nu are aceeasi suma (+/- 45 de zile) -> "posibil cash".
// Doar documente inca neasociate unei plati bancare, din perioada contabila a lunii.
// Cele "sigure" din FISIERUL LOCAL se adauga singure in Facturi + chitanta, pe fiecare firma in parte
// (autoAdaugaDinFisierLocal), cu mentiunea originii in documente.asociere_detalii ca sa poata fi anulate.

type Sb = ReturnType<typeof getServiceSupabase>

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

export interface Recomandare {
  id: string; fisierNume: string; furnizor: string; numar: string | null; suma: number | null; valuta: string
  data: string | null; tip: string | null; sursa: string; motive: string[]; sigur: boolean
}

export async function calculeazaRecomandariChitanta(sb: Sb, firmaId: string, lunaId: string): Promise<{ perioada: { de: string; pana: string }; recomandate: Recomandare[]; posibile: Recomandare[] } | null> {
  const { data: luna } = await sb.from('luni_contabile').select('luna').eq('id', lunaId).single()
  if (!luna) return null
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

  return {
    perioada: { de, pana },
    recomandate: rezultat.filter(r => r.sigur).map(({ exclusa, ...r }) => r),
    posibile: rezultat.filter(r => !r.sigur).map(({ exclusa, ...r }) => r),
  }
}

export const PREFIX_AUTO_CASH = 'Adăugată automat în Facturi + chitanță din fișierul local'

// Muta documentul din Inbox Facturi in "Facturi + chitanta" al lunii (fisierul se muta in storage,
// ca sa apara in modul si la export in sectiunea corecta). Cu { automat } retine de unde a fost mutat.
export async function adaugaInFacturiChitanta(sb: Sb, docId: string, lunaId: string, opts: { automat?: boolean } = {}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: d } = await sb.from('documente').select('id,firma_id,fisier_path,fisier_nume,tranzactie_id,luna_id').eq('id', docId).single()
  if (!d) return { ok: false, status: 404, error: 'Documentul nu există' }
  if (!String(d.fisier_path).includes('/inbox-facturi/')) return { ok: false, status: 409, error: 'Documentul nu mai este în Inbox Facturi' }
  if (d.tranzactie_id) return { ok: false, status: 409, error: 'Documentul e deja asociat unei plăți din extras' }
  const nume = String(d.fisier_path).split('/').pop()
  const nou = `${d.firma_id}/${lunaId}/facturi-chitanta/${Date.now()}_${nume}`
  const { error: mvErr } = await sb.storage.from('documente').move(d.fisier_path, nou)
  if (mvErr) return { ok: false, status: 500, error: `Fișierul nu a putut fi mutat: ${mvErr.message}` }
  const { error } = await sb.from('documente').update({
    fisier_path: nou, luna_id: lunaId, modul: 'acte_contabile',
    ...(opts.automat ? { asociere_detalii: `${PREFIX_AUTO_CASH} · inbox:${d.fisier_path} · luna:${d.luna_id || ''}` } : {}),
  }).eq('id', d.id)
  if (error) {
    await sb.storage.from('documente').move(nou, d.fisier_path)
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true }
}

// Anuleaza o adaugare automata: documentul revine in Inbox Facturi (fisierul si luna de dinainte).
export async function anuleazaAdaugareAutomata(sb: Sb, docId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: d } = await sb.from('documente').select('id,fisier_path,asociere_detalii').eq('id', docId).single()
  const m = String(d?.asociere_detalii || '').match(/^Adăugată automat[^·]*· inbox:(.+?) · luna:(.*)$/)
  if (!d || !m) return { ok: false, status: 404, error: 'Documentul nu a fost adăugat automat' }
  const [, inboxPath, lunaVeche] = m
  const { error: mvErr } = await sb.storage.from('documente').move(d.fisier_path, inboxPath)
  if (mvErr) return { ok: false, status: 500, error: `Fișierul nu a putut fi mutat înapoi: ${mvErr.message}` }
  const { error } = await sb.from('documente').update({ fisier_path: inboxPath, modul: 'inbox_facturi', asociere_detalii: null, ...(lunaVeche ? { luna_id: lunaVeche } : {}) }).eq('id', d.id)
  if (error) { await sb.storage.from('documente').move(inboxPath, d.fisier_path); return { ok: false, status: 500, error: error.message } }
  return { ok: true }
}

// Cauta mereu in documentele venite din fisierul local ale FIRMEI (nu din Gmail/e-Factura) facturile
// sigur platite cash (cu chitanta / furnizor platit cash si in alte luni) si le adauga singure in
// Facturi + chitanta a lunii. Cele doar "posibil cash" raman recomandari cu clic.
export async function autoAdaugaDinFisierLocal(sb: Sb, firmaId: string, lunaId: string): Promise<{ adaugate: Recomandare[]; erori: string[] }> {
  const rec = await calculeazaRecomandariChitanta(sb, firmaId, lunaId)
  const adaugate: Recomandare[] = [], erori: string[] = []
  if (!rec) return { adaugate, erori }
  for (const r of rec.recomandate.filter(x => x.sursa === 'Folder local')) {
    const res = await adaugaInFacturiChitanta(sb, r.id, lunaId, { automat: true })
    if (res.ok) adaugate.push(r)
    else erori.push(`${r.furnizor || r.fisierNume}: ${res.error}`)
  }
  return { adaugate, erori }
}
