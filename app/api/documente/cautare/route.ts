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
  tip: 'document' | 'model' | 'factura' | 'bon' | 'tranzactie'
  valuta?: string | null
}

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
  const hasNumeric = Number.isFinite(numeric) && q.trim() !== ''
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

  // 1. Documente principale. "furnizor" poate contine metadata interna (Inbox Facturi: dupa primul "|";
  // Dispozitii: bloc JSON) - filtrul SQL e larg, apoi fiecare rezultat e reverificat pe campurile curate.
  const orParts = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${escaped}*`] : []),
    `furnizor.ilike.*${escaped}*`,
    `numar_document.ilike.*${escaped}*`,
    `locatie.ilike.*${escaped}*`,
    `utilitate.ilike.*${escaped}*`,
  ]
  if (sumaCondition) orParts.push(sumaCondition)
  if (dateQuery) orParts.push(`data_document.eq.${dateQuery}`)
  const docUrl = `${SB}/documente?${ff}or=(${orParts.join(',')})` +
    `&fisier_path=not.like.*%2Fconfig%2F*&fisier_path=not.like.*%2Fdispozitii-plata%2Fresetari%2F*` +
    `&select=id,firma_id,fisier_nume,furnizor,numar_document,suma,locatie,utilitate,data_document,fisier_path,luna_id,created_at` +
    `&order=created_at.desc&limit=${firmaId ? 80 : 120}`

  const modelUrl = `${SB}/model_documente?${ff}fisier_nume=ilike.*${escaped}*` +
    `&select=id,firma_id,fisier_nume,sectiune,created_at&order=created_at.desc&limit=20`

  const facturaOr = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${escaped}*`] : []),
    `furnizor.ilike.*${escaped}*`,
    `numar_document.ilike.*${escaped}*`,
  ]
  if (sumaCondition) facturaOr.push(sumaCondition)
  if (dateQuery) facturaOr.push(`data_factura.eq.${dateQuery}`)
  const facturaUrl = `${SB}/facturi_asteptate?${ff}or=(${facturaOr.join(',')})` +
    `&select=id,firma_id,fisier_nume,furnizor,numar_document,suma,data_factura,status,created_at&order=created_at.desc&limit=20`

  const bonOr = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${escaped}*`] : []),
    `comerciant.ilike.*${escaped}*`,
    `cui_client.ilike.*${escaped}*`,
  ]
  if (sumaCondition) bonOr.push(sumaCondition)
  if (dateQuery) bonOr.push(`data_bon.eq.${dateQuery}`)
  const bonUrl = `${SB}/bonuri?${ff}or=(${bonOr.join(',')})` +
    `&select=id,firma_id,fisier_nume,comerciant,cui_client,suma,data_bon,status,created_at&order=created_at.desc&limit=20`

  // 5. Tranzactii bancare - dupa descriere, suma (aceeasi logica aproximativa) sau data.
  const txOr = [
    ...(hasNumeric ? [] : [`descriere.ilike.*${escaped}*`, `descriere_curatata.ilike.*${escaped}*`]),
  ]
  if (sumaCondition) txOr.push(sumaCondition)
  if (dateQuery) txOr.push(`data_tranzactie.eq.${dateQuery}`)
  const txUrl = txOr.length ? `${SB}/tranzactii?${ff}or=(${txOr.join(',')})` +
    `&select=id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,suma,valuta,tip,document_id` +
    `&order=data_tranzactie.desc&limit=20` : null

  const [docsRaw, modelDocs, facturi, bonuri, txs] = await Promise.all([
    getJson(docUrl), getJson(modelUrl), getJson(facturaUrl), getJson(bonUrl), txUrl ? getJson(txUrl) : Promise.resolve([]),
  ])
  if (docsRaw === null && modelDocs === null && facturi === null && bonuri === null)
    return NextResponse.json({ error: 'Căutarea nu a putut accesa baza de date' }, { status: 502 })

  function docMatchesGenuinely(d: any): boolean {
    const furnizorClean = furnizorCurat(d.furnizor)
    if (furnizorClean && furnizorClean.toLowerCase().includes(qLower)) return true
    if (includeFisierNume && d.fisier_nume && String(d.fisier_nume).toLowerCase().includes(qLower)) return true
    if (d.numar_document && String(d.numar_document).toLowerCase().includes(qLower)) return true
    if (d.locatie && String(d.locatie).toLowerCase().includes(qLower)) return true
    if (d.utilitate && String(d.utilitate).toLowerCase().includes(qLower)) return true
    if (sumaMin != null && sumaMax != null && typeof d.suma === 'number' && d.suma >= sumaMin && d.suma <= sumaMax) return true
    if (dateQuery && d.data_document === dateQuery) return true
    return false
  }
  const docs = (docsRaw || []).filter(docMatchesGenuinely).slice(0, 40)

  // Luna fiecarui document / tranzactii (prin extras) - doua cereri mici, tot in paralel.
  const extrasIds = [...new Set((txs || []).map((t: any) => t.extras_id).filter(Boolean))]
  const extrase = extrasIds.length ? await getJson(`${SB}/extrase?id=in.(${extrasIds.join(',')})&select=id,luna_id`) : []
  const extrasLuna = new Map<string, string>((extrase || []).map((e: any) => [e.id, e.luna_id]))
  const lunaIds = [...new Set([
    ...docs.map((d: any) => d.luna_id),
    ...[...extrasLuna.values()],
  ].filter(Boolean))]
  const luniById = new Map<string, string>()
  if (lunaIds.length) {
    const luni = await getJson(`${SB}/luni_contabile?id=in.(${lunaIds.join(',')})&select=id,luna`)
    for (const l of luni || []) luniById.set(l.id, l.luna)
  }

  const results: Rezultat[] = []
  for (const d of docs) {
    results.push({
      id: d.id, fisierNume: d.fisier_nume, furnizor: furnizorCurat(d.furnizor), numarDocument: d.numar_document || null,
      suma: d.suma, locatie: d.locatie, utilitate: d.utilitate, dataDocument: d.data_document,
      sectiune: sectionFromPath(d.fisier_path), luna: luniById.get(d.luna_id) || null,
      downloadUrl: `/api/chitante/document?id=${d.id}`, firmaId: d.firma_id || null, tip: 'document',
    })
  }
  for (const t of txs || []) {
    const luna = luniById.get(extrasLuna.get(t.extras_id) || '') || null
    results.push({
      id: t.id, fisierNume: t.descriere_curatata || t.descriere || 'Tranzacție', furnizor: t.descriere_curatata || t.descriere || null,
      numarDocument: null, suma: typeof t.suma === 'number' ? t.suma : Number(t.suma), locatie: null, utilitate: null,
      dataDocument: t.data_tranzactie, sectiune: t.document_id ? 'Tranzacție · documentată' : 'Tranzacție · fără document',
      luna, downloadUrl: '', firmaId: t.firma_id || null, tip: 'tranzactie', valuta: t.valuta || null,
    })
  }
  for (const f of facturi || []) {
    results.push({
      id: f.id, fisierNume: f.fisier_nume, furnizor: furnizorCurat(f.furnizor), numarDocument: f.numar_document || null,
      suma: f.suma, locatie: null, utilitate: null, dataDocument: f.data_factura,
      sectiune: `Facturi de asociat${f.status === 'asociata' ? ' (asociată)' : ''}`, luna: null,
      downloadUrl: `/api/facturi-asteptate/download?id=${f.id}`, firmaId: f.firma_id || null, tip: 'factura',
    })
  }
  for (const b of bonuri || []) {
    results.push({
      id: b.id, fisierNume: b.fisier_nume, furnizor: b.comerciant || null, numarDocument: null,
      suma: b.suma, locatie: null, utilitate: null, dataDocument: b.data_bon,
      sectiune: `Bonuri${b.status === 'asociata' ? ' (asociat)' : ''}`, luna: null,
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

  return NextResponse.json(results.slice(0, 80))
}
