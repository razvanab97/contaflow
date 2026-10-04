import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

function sectionFromPath(path: string): string {
  const p = String(path || '')
  if (p.includes('/dispozitii-plata/')) return 'Dispoziție de plată'
  if (p.includes('/facturi-chitanta/')) return 'Facturi + chitanță'
  if (p.includes('/facturi-restante/')) return 'Facturi restante'
  if (p.includes('/inbox-facturi/')) return 'Inbox Facturi'
  if (p.includes('/booking-facturi/')) return 'Booking · Facturi'
  if (p.includes('/booking-borderou/')) return 'Booking · Borderou'
  if (p.includes('/airbnb-facturi/')) return 'Airbnb · Facturi'
  if (p.includes('/airbnb-borderou/')) return 'Airbnb · Borderou'
  if (p.includes('/5stardesk/')) return '5StarDesk'
  if (p.includes('/trendyol/')) return 'Trendyol'
  if (p.includes('/emag-calcul/') || p.includes('/emag-avize/') || p.includes('/emag-facturi/')) return 'eMAG Facturi'
  if (p.includes('/acte-contabile/')) return 'Acte contabile'
  if (p.includes('/angajati/')) return 'Documente angajați'
  if (p.includes('/tx/') || p.includes('/extras/')) return 'Extras de cont'
  return 'Altele'
}

const MODEL_DOC_LABELS: Record<string, string> = {
  raport_lunar: 'Model documente · Raport lunar',
  stat_plata_angajati: 'Model documente · Stat plată angajați',
  reges_angajati: 'Model documente · Registru angajați (REGES)',
  acte_contabile: 'Model documente · Acte contabile',
}

// Data introdusa de utilizator (DD.MM.YYYY sau YYYY-MM-DD) -> format ISO pentru comparatie in baza de date
function ascii(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ȘșŞş]/g, 's').replace(/[ȚțŢţ]/g, 't').toLowerCase()
}

function parseDateQuery(q: string): string | null {
  const iso = q.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return q
  const ro = q.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ro) return `${ro[3]}-${ro[2].padStart(2, '0')}-${ro[1].padStart(2, '0')}`
  return null
}

// Furnizorul documentelor importate prin Inbox Facturi are metadata interna adaugata dupa primul
// "|" (sursa, firma detectata, motiv AI, hash - vezi lib/inbox-facturi.ts) - fara curatare, rezultatul
// cautarii ar afisa tot blocul acela in loc de doar numele furnizorului.
function furnizorCurat(raw: string | null | undefined): string | null {
  if (!raw) return null
  const curat = String(raw).split('|')[0]?.trim()
  if (!curat || /^(DP_DATA:|Ata(ș|s)ament )/.test(curat)) return null
  return curat
}

interface Rezultat {
  id: string; fisierNume: string; furnizor: string | null; numarDocument: string | null
  suma: number | null; locatie: string | null; utilitate: string | null; dataDocument: string | null
  sectiune: string; luna: string | null; downloadUrl: string
  firmaId: string | null
  tip: 'document' | 'model' | 'factura' | 'bon' | 'tranzactie' | 'rezervare' | 'factura_client' | 'comision' | 'mail'
  valuta?: string | null
  // Pentru rezultatele fara fisier (rezervari, mailuri): modulul lunii unde se deschid.
  modul?: string | null
}

const zz = (d: string | null | undefined) => d ? String(d).slice(0, 10).split('-').reverse().join('.') : ''
const sejur = (a?: string | null, b?: string | null) => a || b ? `sejur ${zz(a).slice(0, 5)}–${zz(b)}` : ''
const lei = (v: unknown) => v == null ? '' : `${Number(v).toFixed(2).replace('.', ',')} RON`

async function getJson(url: string): Promise<any[] | null> {
  try {
    const r = await fetch(url, { headers: H, cache: 'no-store' })
    return r.ok ? await r.json() : null
  } catch { return null }
}

// Cautare unificata. Fara firmaId (sau firmaId=all) cauta in TOATE firmele - folosita de paleta
// de comenzi ⌘K din shell; cu firmaId ramane limitata la firma respectiva (compatibil cu vechiul
// apel). Toate sursele (documente, modele, facturi de asociat, bonuri, tranzactii bancare) se
// interogheaza in paralel, nu una dupa alta.
export async function GET(req: NextRequest) {
  const firmaParam = req.nextUrl.searchParams.get('firmaId')
  const firmaId = firmaParam && firmaParam !== 'all' ? firmaParam : null
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json([])
  const ff = firmaId ? `firma_id=eq.${encodeURIComponent(firmaId)}&` : ''

  const escaped = q.replace(/[%,()*]/g, '')
  const numeric = Number(q.replace(',', '.'))
  // Numerele lungi (8+ cifre) sunt coduri (rezervare Booking, numar factura), nu sume.
  const hasNumeric = Number.isFinite(numeric) && q.trim() !== '' && q.replace(/\D/g, '').length < 8
  // Cautarea dupa suma e mai utila aproximativa decat exacta: un numar intreg tastat (ex. "300")
  // inseamna de obicei "imi amintesc aproximativ suma" - gaseste orice suma intre 300.00 si 300.99.
  // Un numar cu zecimale tastat (ex. "300.01") inseamna "stiu suma exact" - cautare aproape exacta.
  const numericIsInteger = hasNumeric && /^\d+$/.test(q)
  const sumaMin = hasNumeric ? (numericIsInteger ? numeric : numeric - 0.01) : null
  const sumaMax = hasNumeric ? (numericIsInteger ? numeric + 0.999 : numeric + 0.01) : null
  const sumaCondition = hasNumeric ? `and(suma.gte.${sumaMin},suma.lte.${sumaMax})` : null

  const dateQuery = parseDateQuery(q)

  // Numele fisierelor sunt generate automat si contin deseori numere lungi fara legatura (timestamp,
  // POS, hash) - pentru cautare numerica pura nu cautam in numele fisierului, doar in suma/numar document.
  const includeFisierNume = !hasNumeric
  const qLower = q.toLowerCase()
  // Fara diacritice: in baza numele pot avea diacritice ("Bortoş"), in cautare nu ("bortos") sau invers.
  // In SQL literele care pot purta diacritice devin "_" (orice caracter), iar fiecare rezultat se
  // reverifica apoi in cod pe textul normalizat - ca sa nu ramana potriviri false.
  const qNorm = ascii(q)
  const pat = !hasNumeric && q.length >= 4 && /[a-z]/i.test(q) ? ascii(escaped).replace(/[aist]/g, '_') : escaped
  const are = (...v: unknown[]) => v.some(x => x != null && ascii(String(x)).includes(qNorm))
  const inInterval = (v: unknown) => sumaMin != null && sumaMax != null && v != null && Number(v) >= sumaMin && Number(v) <= sumaMax

  // 1. Documente principale. "furnizor" poate contine metadata interna (Inbox Facturi: dupa primul "|";
  // Dispozitii: bloc JSON) - filtrul SQL e larg, apoi fiecare rezultat e reverificat pe campurile curate.
  const orParts = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${pat}*`] : []),
    `furnizor.ilike.*${pat}*`,
    `numar_document.ilike.*${pat}*`,
    `locatie.ilike.*${pat}*`,
    `utilitate.ilike.*${pat}*`,
    `cod_rezervare_airbnb.ilike.*${pat}*`,
    `cod_unitate_booking.ilike.*${pat}*`,
  ]
  if (sumaCondition) orParts.push(sumaCondition)
  if (dateQuery) orParts.push(`data_document.eq.${dateQuery}`)
  const docUrl = `${SB}/documente?${ff}or=(${orParts.join(',')})` +
    `&fisier_path=not.like.*%2Fconfig%2F*&fisier_path=not.like.*%2Fdispozitii-plata%2Fresetari%2F*` +
    `&select=id,firma_id,fisier_nume,furnizor,numar_document,suma,locatie,utilitate,data_document,fisier_path,luna_id,created_at,cod_rezervare_airbnb,cod_unitate_booking,tranzactie_id` +
    `&order=created_at.desc&limit=${firmaId ? 80 : 120}`

  const modelUrl = `${SB}/model_documente?${ff}fisier_nume=ilike.*${pat}*` +
    `&select=id,firma_id,fisier_nume,sectiune,created_at&order=created_at.desc&limit=20`

  const facturaOr = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${pat}*`] : []),
    `furnizor.ilike.*${pat}*`,
    `numar_document.ilike.*${pat}*`,
  ]
  if (sumaCondition) facturaOr.push(sumaCondition)
  if (dateQuery) facturaOr.push(`data_factura.eq.${dateQuery}`)
  const facturaUrl = `${SB}/facturi_asteptate?${ff}or=(${facturaOr.join(',')})` +
    `&select=id,firma_id,fisier_nume,furnizor,numar_document,suma,data_factura,status,created_at,tranzactie_id&order=created_at.desc&limit=20`

  const bonOr = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${pat}*`] : []),
    `comerciant.ilike.*${pat}*`,
    `cui_client.ilike.*${pat}*`,
  ]
  if (sumaCondition) bonOr.push(sumaCondition)
  if (dateQuery) bonOr.push(`data_bon.eq.${dateQuery}`)
  const bonUrl = `${SB}/bonuri?${ff}or=(${bonOr.join(',')})` +
    `&select=id,firma_id,fisier_nume,comerciant,cui_client,suma,data_bon,status,created_at,tranzactie_id&order=created_at.desc&limit=20`

  const SEL_TX = 'id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,suma,valuta,tip,document_id,note,referinta'
  // 5. Tranzactii bancare - dupa descriere, suma (aceeasi logica aproximativa) sau data.
  const txOr = [
    ...(hasNumeric ? [] : [`descriere.ilike.*${pat}*`, `descriere_curatata.ilike.*${pat}*`, `note.ilike.*${pat}*`]),
    `referinta.ilike.*${escaped}*`,
  ]
  if (sumaCondition) txOr.push(sumaCondition)
  if (dateQuery) txOr.push(`data_tranzactie.eq.${dateQuery}`)
  const txUrl = txOr.length ? `${SB}/tranzactii?${ff}or=(${txOr.join(',')})` +
    `&select=${SEL_TX}` +
    `&order=data_tranzactie.desc&limit=40` : null

  // 6. Rezervari si tot ce tine de ele: borderouri, CSV-ul Airbnb (cu perioada sejurului), facturile
  // client 5StarDesk, facturile de comision, mailurile contabilului - dupa cod, nume sau suma.
  const sumaOr = sumaCondition ? [sumaCondition] : []
  const textOr = (...campuri: string[]) => hasNumeric ? [] : campuri.map(c => `${c}.ilike.*${pat}*`)
  // Codurile de rezervare si numerele de factura se cauta mereu ca text (ex. "1529" -> ABRH 1529).
  // Un numar scurt (ex. "1529") e o suma sau finalul unui numar de factura - nu o bucata de cod.
  const codOr = (...campuri: string[]) => hasNumeric
    ? campuri.filter(c => c.startsWith('numar')).map(c => `${c}.ilike.*${escaped}`)
    : campuri.map(c => `${c}.ilike.*${pat}*`)
  const orUrl = (tabel: string, parti: string[], select: string, limit = 30) => parti.length
    ? getJson(`${SB}/${tabel}?${ff}or=(${parti.join(',')})&select=${select}&limit=${limit}`) : Promise.resolve([] as any[])
  const SEL_REZ = 'id,firma_id,luna_id,platforma,cod_rezervare,nume_oaspete,suma'
  const SEL_CSV = 'id,firma_id,luna_id,cod_confirmare,oaspete,data_start,data_sfarsit,suma,taxa_servicii,factura_document_id,status'
  const SEL_COM = 'id,firma_id,luna_id,document_id,platforma,numar_factura,cod_rezervare,suma'

  const [docsRaw, modelDocsRaw, facturiRaw, bonuriRaw, txsRaw, rez1Raw, csv1Raw, s51Raw, com1Raw, mailuriRaw] = await Promise.all([
    getJson(docUrl), getJson(modelUrl), getJson(facturaUrl), getJson(bonUrl), txUrl ? getJson(txUrl) : Promise.resolve([]),
    orUrl('borderou_rezervari', [...codOr('cod_rezervare'), ...textOr('nume_oaspete'), ...sumaOr], SEL_REZ),
    orUrl('airbnb_facturi_asteptate', [...codOr('cod_confirmare'), ...textOr('oaspete'), ...(sumaCondition ? [sumaCondition, sumaCondition.replace(/suma/g, 'taxa_servicii')] : [])], SEL_CSV),
    orUrl('stardesk_facturi', [...codOr('numar_factura', 'id_rezervare'), ...textOr('nume_client'), ...sumaOr], '*'),
    orUrl('comision_facturi', [...codOr('cod_rezervare', 'numar_factura'), ...sumaOr], SEL_COM),
    orUrl('mail_contabil', textOr('subiect', 'rezumat', 'text_mail'), 'id,firma_id,luna_id,subiect,data_mail,created_at', 10),
  ])
  if (docsRaw === null && modelDocsRaw === null && facturiRaw === null && bonuriRaw === null)
    return NextResponse.json({ error: 'Căutarea nu a putut accesa baza de date' }, { status: 502 })

  // Reverificare pe text normalizat (fara diacritice) - elimina potrivirile false ale tiparului SQL larg.
  const filtru = (l: any[] | null, f: (x: any) => boolean) => (l || []).filter(f)
  const modelDocs = filtru(modelDocsRaw, d => are(d.fisier_nume))
  const facturi = filtru(facturiRaw, f => are(f.furnizor, f.numar_document) || (includeFisierNume && are(f.fisier_nume)) || inInterval(f.suma) || (!!dateQuery && f.data_factura === dateQuery))
  const bonuri = filtru(bonuriRaw, b => are(b.comerciant, b.cui_client) || (includeFisierNume && are(b.fisier_nume)) || inInterval(b.suma) || (!!dateQuery && b.data_bon === dateQuery))
  const txs = filtru(txsRaw, t => are(t.descriere, t.descriere_curatata, t.note, t.referinta) || inInterval(t.suma) || (!!dateQuery && t.data_tranzactie === dateQuery))
  const rez1 = filtru(rez1Raw, r => are(r.cod_rezervare, r.nume_oaspete) || inInterval(r.suma))
  const csv1 = filtru(csv1Raw, r => are(r.cod_confirmare, r.oaspete) || inInterval(r.suma) || inInterval(r.taxa_servicii))
  const s51 = filtru(s51Raw, r => are(r.numar_factura, r.id_rezervare, r.nume_client) || inInterval(r.suma))
  const com1 = filtru(com1Raw, r => are(r.cod_rezervare, r.numar_factura) || inInterval(r.suma))
  const mailuri = mailuriRaw || []

  // Al doilea pas: tot ce e legat de codurile de rezervare gasite (ex. cautare dupa nume -> rezervarea
  // -> factura client, factura de comision, sejurul si documentele cu acelasi cod).
  const codNorm = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const coduri = [...new Set([
    ...rez1.map((r: any) => r.cod_rezervare), ...csv1.map((r: any) => r.cod_confirmare),
    ...s51.map((r: any) => r.id_rezervare), ...com1.map((r: any) => r.cod_rezervare),
    ...(docsRaw || []).filter((d: any) => are(d.cod_rezervare_airbnb)).map((d: any) => d.cod_rezervare_airbnb),
  ].map(codNorm).filter(c => c.length >= 6))].slice(0, 40)
  const inCod = `in.(${coduri.map(c => `"${c}"`).join(',')})`
  const SEL_DOC = 'id,firma_id,fisier_nume,furnizor,numar_document,suma,locatie,utilitate,data_document,fisier_path,luna_id,created_at,cod_rezervare_airbnb,cod_unitate_booking,tranzactie_id'
  const [rez2, csv2, s52, com2, docsCod] = coduri.length ? await Promise.all([
    getJson(`${SB}/borderou_rezervari?${ff}cod_rezervare=${inCod}&select=${SEL_REZ}&limit=60`),
    getJson(`${SB}/airbnb_facturi_asteptate?${ff}cod_confirmare=${inCod}&select=${SEL_CSV}&limit=60`),
    getJson(`${SB}/stardesk_facturi?${ff}id_rezervare=${inCod}&select=*&limit=60`),
    getJson(`${SB}/comision_facturi?${ff}cod_rezervare=${inCod}&select=${SEL_COM}&limit=60`),
    getJson(`${SB}/documente?${ff}cod_rezervare_airbnb=${inCod}&select=${SEL_DOC}&limit=40`),
  ]) : [[], [], [], [], []]
  const unice = (...liste: (any[] | null)[]) => { const m = new Map<string, any>(); for (const l of liste) for (const x of l || []) m.set(x.id, x); return [...m.values()] }
  const rezervari = unice(rez1, rez2), csvRows = unice(csv1, csv2), facturi5 = unice(s51, s52), comisioane = unice(com1, com2)
  const csvDupaCod = new Map<string, any>(csvRows.map((c: any) => [codNorm(c.cod_confirmare), c]))
  const f5DupaCod = new Map<string, any>(facturi5.filter((f: any) => f.id_rezervare).map((f: any) => [codNorm(f.id_rezervare), f]))

  function docMatchesGenuinely(d: any): boolean {
    const furnizorClean = furnizorCurat(d.furnizor)
    if (are(furnizorClean)) return true
    if (includeFisierNume && are(d.fisier_nume)) return true
    if (are(d.numar_document, d.locatie, d.utilitate)) return true
    if (inInterval(d.suma)) return true
    if (dateQuery && d.data_document === dateQuery) return true
    if (are(d.cod_rezervare_airbnb, d.cod_unitate_booking)) return true
    return false
  }
  const docsDirecte = unice((docsRaw || []).filter(docMatchesGenuinely), docsCod).slice(0, 40)

  // Al treilea pas: legaturile document <-> tranzactie (in ambele sensuri), ca fiecare rezultat sa vina
  // cu "raspunsul" lui: documentul unei tranzactii, plata/incasarea unui document, factura sau bonul
  // asociat unei tranzactii.
  const inIds = (ids: unknown[]) => { const u = [...new Set(ids.filter(Boolean))].slice(0, 60); return u.length ? `in.(${u.join(',')})` : null }
  const txDinDocs = inIds([...docsDirecte.map((d: any) => d.tranzactie_id), ...facturi.map((f: any) => f.tranzactie_id), ...bonuri.map((b: any) => b.tranzactie_id)])
  const docIdsDirecte = inIds(docsDirecte.map((d: any) => d.id))
  const docDinTx = inIds(txs.map((t: any) => t.document_id))
  const txIds = inIds(txs.map((t: any) => t.id))
  const [txL1, txL2, docL1, docL2, factL, bonL] = await Promise.all([
    txDinDocs ? getJson(`${SB}/tranzactii?id=${txDinDocs}&select=${SEL_TX}`) : [],
    docIdsDirecte ? getJson(`${SB}/tranzactii?document_id=${docIdsDirecte}&select=${SEL_TX}`) : [],
    docDinTx ? getJson(`${SB}/documente?id=${docDinTx}&select=${SEL_DOC}`) : [],
    txIds ? getJson(`${SB}/documente?tranzactie_id=${txIds}&select=${SEL_DOC}`) : [],
    txIds ? getJson(`${SB}/facturi_asteptate?tranzactie_id=${txIds}&select=id,firma_id,fisier_nume,furnizor,numar_document,suma,data_factura,status,created_at,tranzactie_id`) : [],
    txIds ? getJson(`${SB}/bonuri?tranzactie_id=${txIds}&select=id,firma_id,fisier_nume,comerciant,cui_client,suma,data_bon,status,created_at,tranzactie_id`) : [],
  ])
  const docs = unice(docsDirecte, docL1, docL2)
  const toateTx = unice(txs, txL1, txL2)
  const toateFacturi = unice(facturi, factL), toateBonuri = unice(bonuri, bonL)
  const legat = new Set<string>([...(docL1 || []), ...(docL2 || [])].map((d: any) => d.id).filter((id: string) => !docsDirecte.some((x: any) => x.id === id)))
  for (const t of [...(txL1 || []), ...(txL2 || [])]) if (!txs.some((x: any) => x.id === t.id)) legat.add(t.id)
  for (const f of [...(factL || []), ...(bonL || [])]) legat.add(f.id)
  const txById = new Map<string, any>(toateTx.map((t: any) => [t.id, t]))
  const docById = new Map<string, any>(docs.map((d: any) => [d.id, d]))
  const txPentruDoc = (d: any) => (d.tranzactie_id && txById.get(d.tranzactie_id)) || toateTx.find((t: any) => t.document_id === d.id) || null
  const descTx = (t: any) => `${t.tip === 'credit' ? 'încasat' : 'plătit'} ${zz(t.data_tranzactie)} (${lei(t.suma)})`
  const descDocTx = (t: any) => {
    const d = (t.document_id && docById.get(t.document_id)) || docs.find((x: any) => x.tranzactie_id === t.id)
    const f = d ? null : [...toateFacturi, ...toateBonuri].find((x: any) => x.tranzactie_id === t.id)
    return d ? `document: ${furnizorCurat(d.furnizor) || d.fisier_nume}` : f ? `asociat: ${f.furnizor || f.comerciant || f.fisier_nume}` : ''
  }

  // Luna fiecarui document / tranzactii (prin extras) - doua cereri mici, tot in paralel.
  const extrasIds = [...new Set(toateTx.map((t: any) => t.extras_id).filter(Boolean))]
  const extrase = extrasIds.length ? await getJson(`${SB}/extrase?id=in.(${extrasIds.join(',')})&select=id,luna_id`) : []
  const extrasLuna = new Map<string, string>((extrase || []).map((e: any) => [e.id, e.luna_id]))
  const lunaIds = [...new Set([
    ...docs.map((d: any) => d.luna_id),
    ...[...extrasLuna.values()],
    ...rezervari.map((r: any) => r.luna_id), ...csvRows.map((r: any) => r.luna_id), ...facturi5.map((r: any) => r.luna_id),
    ...comisioane.map((r: any) => r.luna_id), ...mailuri.map((r: any) => r.luna_id),
  ].filter(Boolean))]
  const luniById = new Map<string, string>()
  if (lunaIds.length) {
    const luni = await getJson(`${SB}/luni_contabile?id=in.(${lunaIds.join(',')})&select=id,luna`)
    for (const l of luni || []) luniById.set(l.id, l.luna)
  }

  const results: Rezultat[] = []
  const baza = { locatie: null, utilitate: null, numarDocument: null }
  const platf = (p: string) => p === 'airbnb' ? 'Airbnb' : p === 'booking' ? 'Booking' : p
  const coduriRezervari = new Set<string>()
  for (const r of rezervari) {
    const cod = codNorm(r.cod_rezervare); coduriRezervari.add(cod)
    const c = csvDupaCod.get(cod), f = f5DupaCod.get(cod)
    const per = sejur(c?.data_start || f?.data_start, c?.data_sfarsit || f?.data_sfarsit)
    results.push({
      ...baza, id: r.id, tip: 'rezervare', firmaId: r.firma_id, modul: '5stardesk', downloadUrl: '',
      fisierNume: `${r.nume_oaspete || '—'} · ${r.cod_rezervare}`, furnizor: `${r.nume_oaspete || '—'} · ${r.cod_rezervare}`,
      suma: r.suma != null ? Number(r.suma) : null, dataDocument: null, luna: luniById.get(r.luna_id) || null,
      sectiune: [`Rezervare ${platf(r.platforma)} (borderou)`, per, c?.taxa_servicii != null ? `comision ${lei(c.taxa_servicii)}` : '', f ? `factură ${f.numar_factura}` : 'fără factură client'].filter(Boolean).join(' · '),
    })
  }
  for (const c of csvRows) {
    if (coduriRezervari.has(codNorm(c.cod_confirmare))) continue  // deja afisata din borderou, cu perioada ei
    results.push({
      ...baza, id: c.id, tip: 'rezervare', firmaId: c.firma_id, modul: 'airbnb-borderou',
      downloadUrl: c.factura_document_id ? `/api/chitante/document?id=${c.factura_document_id}` : '',
      fisierNume: `${c.oaspete || '—'} · ${c.cod_confirmare}`, furnizor: `${c.oaspete || '—'} · ${c.cod_confirmare}`,
      suma: c.suma != null ? Number(c.suma) : null, dataDocument: null, luna: luniById.get(c.luna_id) || null,
      sectiune: ['Rezervare Airbnb (CSV)', sejur(c.data_start, c.data_sfarsit), c.taxa_servicii != null ? `comision ${lei(c.taxa_servicii)}` : '', c.factura_document_id ? 'factură comision atașată' : 'fără factură de comision'].filter(Boolean).join(' · '),
    })
  }
  for (const f of facturi5) {
    results.push({
      ...baza, id: f.id, tip: 'factura_client', firmaId: f.firma_id, numarDocument: f.numar_factura || null,
      downloadUrl: f.document_id ? `/api/chitante/document?id=${f.document_id}` : '', modul: '5stardesk',
      fisierNume: `Factura ${f.numar_factura || '—'} · ${f.nume_client || '—'}`, furnizor: `Factura ${f.numar_factura || '—'} · ${f.nume_client || '—'}`,
      suma: f.suma != null ? Number(f.suma) : null, dataDocument: null, luna: luniById.get(f.luna_id) || null,
      sectiune: ['Factură client 5StarDesk', f.id_rezervare ? `rez. ${f.id_rezervare}` : '', sejur(f.data_start, f.data_sfarsit)].filter(Boolean).join(' · '),
    })
  }
  for (const c of comisioane) {
    if (c.document_id && docs.some((d: any) => d.id === c.document_id)) continue  // documentul apare deja
    results.push({
      ...baza, id: c.id, tip: 'comision', firmaId: c.firma_id, numarDocument: c.numar_factura || null,
      downloadUrl: c.document_id ? `/api/chitante/document?id=${c.document_id}` : '', modul: c.platforma === 'airbnb' ? 'airbnb-facturi' : 'booking-facturi',
      fisierNume: `Comision ${platf(c.platforma)} ${c.numar_factura || ''}`.trim(), furnizor: `Comision ${platf(c.platforma)} · ${c.cod_rezervare || '—'}`,
      suma: c.suma != null ? Number(c.suma) : null, dataDocument: null, luna: luniById.get(c.luna_id) || null,
      sectiune: `Factură de comision ${platf(c.platforma)}`,
    })
  }
  for (const m of mailuri || []) {
    results.push({
      ...baza, id: m.id, tip: 'mail', firmaId: m.firma_id, modul: 'mail-contabil', downloadUrl: '',
      fisierNume: m.subiect || 'Mail contabil', furnizor: m.subiect || 'Mail contabil', suma: null,
      dataDocument: m.data_mail || String(m.created_at).slice(0, 10), luna: luniById.get(m.luna_id) || null, sectiune: 'Mail contabil',
    })
  }
  const prefixLegat = (id: string) => legat.has(id) ? 'legat · ' : ''
  for (const d of docs) {
    const t = txPentruDoc(d)
    results.push({
      id: d.id, fisierNume: d.fisier_nume, furnizor: furnizorCurat(d.furnizor), numarDocument: d.numar_document || null,
      suma: d.suma, locatie: d.locatie, utilitate: d.utilitate, dataDocument: d.data_document,
      sectiune: prefixLegat(d.id) + [sectionFromPath(d.fisier_path), d.cod_rezervare_airbnb && d.cod_rezervare_airbnb !== '-' ? `rez. ${d.cod_rezervare_airbnb}` : '', t ? descTx(t) : ''].filter(Boolean).join(' · '),
      luna: luniById.get(d.luna_id) || null,
      downloadUrl: `/api/chitante/document?id=${d.id}`, firmaId: d.firma_id || null, tip: 'document',
    })
  }
  for (const t of toateTx) {
    const luna = luniById.get(extrasLuna.get(t.extras_id) || '') || null
    const dt = descDocTx(t)
    results.push({
      id: t.id, fisierNume: t.descriere_curatata || t.descriere || 'Tranzacție', furnizor: t.descriere_curatata || t.descriere || null,
      numarDocument: null, suma: typeof t.suma === 'number' ? t.suma : Number(t.suma), locatie: null, utilitate: null,
      dataDocument: t.data_tranzactie,
      sectiune: prefixLegat(t.id) + (dt ? `Tranzacție · ${dt}` : t.document_id ? 'Tranzacție · documentată' : `Tranzacție · fără document${t.note && t.note !== 'na' ? ` · notă: ${t.note}` : ''}`),
      luna, downloadUrl: t.document_id ? `/api/chitante/document?id=${t.document_id}` : '', firmaId: t.firma_id || null, tip: 'tranzactie', valuta: t.valuta || null,
    })
  }
  for (const f of toateFacturi) {
    const t = f.tranzactie_id ? txById.get(f.tranzactie_id) : null
    results.push({
      id: f.id, fisierNume: f.fisier_nume, furnizor: furnizorCurat(f.furnizor), numarDocument: f.numar_document || null,
      suma: f.suma, locatie: null, utilitate: null, dataDocument: f.data_factura,
      sectiune: prefixLegat(f.id) + `Facturi de asociat${f.status === 'asociata' ? ' (asociată)' : ''}${t ? ` · ${descTx(t)}` : ''}`, luna: null,
      downloadUrl: `/api/facturi-asteptate/download?id=${f.id}`, firmaId: f.firma_id || null, tip: 'factura',
    })
  }
  for (const b of toateBonuri) {
    const t = b.tranzactie_id ? txById.get(b.tranzactie_id) : null
    results.push({
      id: b.id, fisierNume: b.fisier_nume, furnizor: b.comerciant || null, numarDocument: null,
      suma: b.suma, locatie: null, utilitate: null, dataDocument: b.data_bon,
      sectiune: prefixLegat(b.id) + `Bonuri${b.status === 'asociata' ? ' (asociat)' : ''}${t ? ` · ${descTx(t)}` : ''}`, luna: null,
      downloadUrl: `/api/bonuri/download?id=${b.id}`, firmaId: b.firma_id || null, tip: 'bon',
    })
  }
  for (const d of modelDocs || []) {
    results.push({
      id: d.id, fisierNume: d.fisier_nume, furnizor: null, numarDocument: null,
      suma: null, locatie: null, utilitate: null, dataDocument: null,
      sectiune: MODEL_DOC_LABELS[d.sectiune] || 'Model documente', luna: null,
      downloadUrl: `/api/model-documente/download?id=${d.id}`, firmaId: d.firma_id || null, tip: 'model',
    })
  }

  return NextResponse.json(results.slice(0, 120))
}
