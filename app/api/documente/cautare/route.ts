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
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (!firmaId || q.length < 2) return NextResponse.json([])

  const escaped = q.replace(/[%,()]/g, '')
  const numeric = Number(q.replace(',', '.'))
  const hasNumeric = Number.isFinite(numeric) && q.trim() !== ''
  // Cautarea dupa suma e mai utila aproximativa decat exacta: un numar intreg tastat (ex. "300")
  // inseamna de obicei "imi amintesc aproximativ suma" - gaseste orice suma intre 300.00 si 300.99.
  // Un numar cu zecimale tastat (ex. "300.01") inseamna "stiu suma exact" - cautare aproape exacta,
  // +/- 0.01, ca sa acopere doar eventuale erori de rotunjire in float, nu o plaja larga.
  const numericIsInteger = hasNumeric && /^\d+$/.test(q)
  const sumaMin = hasNumeric ? (numericIsInteger ? numeric : numeric - 0.01) : null
  const sumaMax = hasNumeric ? (numericIsInteger ? numeric + 0.999 : numeric + 0.01) : null
  const sumaCondition = hasNumeric ? `and(suma.gte.${sumaMin},suma.lte.${sumaMax})` : null

  const dateQuery = parseDateQuery(q)

  // Numele fișierelor sunt generate automat și au deseori concatenate mai multe numere fără
  // legătură cu ce caută utilizatorul (timestamp Unix, numere de tranzacție POS, hash-uri) - un
  // termen pur numeric (ex. "300") aproape sigur se potrivește din întâmplare cu o bucată dintr-un
  // asemenea număr lung, aducând rezultate irelevante. Pentru căutare numerică pură, nu mai căutăm
  // în numele fișierului - doar în sumă (mai sus) și număr de document (câmpuri cu sens real).
  const includeFisierNume = !hasNumeric

  const results: Rezultat[] = []
  const qLower = q.toLowerCase()

  // 1. Documente principale (facturi, avize, dispoziții, extras etc.) — toate secțiunile lunare
  // "furnizor" nu e mereu un nume curat: la Inbox Facturi are metadata AI adaugata dupa primul "|"
  // (Sursa/Firma detectata/Motiv/Hash - vezi furnizorCurat mai sus), iar la Dispozitii de plata poate
  // fi un bloc JSON intern (DP_DATA:.../"Atasament DP..."). Ambele ingramadesc zeci de numere si
  // cuvinte fara legatura cu documentul (ex. campul "Motiv" repeta CUI-ul firmei la fiecare document
  // importat automat, deci o cautare dupa CUI ar "gasi" aproape orice document din firma respectiva).
  // Interogarea SQL de mai jos ramane un filtru larg (nu poate taia coloana la primul "|"), dar fiecare
  // rezultat e reverificat mai jos (docMatchesGenuinely) doar pe campurile curate, inainte de a intra
  // in lista finala - asa cautarea raspunde la ce a fost gasit cu adevarat, nu la zgomot din metadata.
  const orParts = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${escaped}*`] : []),
    `furnizor.ilike.*${escaped}*`,
    `numar_document.ilike.*${escaped}*`,
    `locatie.ilike.*${escaped}*`,
    `utilitate.ilike.*${escaped}*`,
  ]
  if (sumaCondition) orParts.push(sumaCondition)
  if (dateQuery) orParts.push(`data_document.eq.${dateQuery}`)

  const docUrl = `${SB}/documente?firma_id=eq.${encodeURIComponent(firmaId)}&or=(${orParts.join(',')})` +
    `&fisier_path=not.like.*%2Fconfig%2F*&fisier_path=not.like.*%2Fdispozitii-plata%2Fresetari%2F*` +
    `&select=id,fisier_nume,furnizor,numar_document,suma,locatie,utilitate,data_document,fisier_path,luna_id,created_at` +
    `&order=created_at.desc&limit=80`
  const docRes = await fetch(docUrl, { headers: H })
  if (!docRes.ok) return NextResponse.json({ error: await docRes.text() }, { status: 502 })
  const docsRaw = await docRes.json()

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

  const lunaIds = [...new Set((docs || []).map((d: any) => d.luna_id).filter(Boolean))]
  const luniById = new Map<string, string>()
  if (lunaIds.length) {
    const lRes = await fetch(`${SB}/luni_contabile?id=in.(${lunaIds.join(',')})&select=id,luna`, { headers: H })
    if (lRes.ok) {
      const luni = await lRes.json()
      for (const l of luni) luniById.set(l.id, l.luna)
    }
  }

  for (const d of docs || []) {
    results.push({
      id: d.id,
      fisierNume: d.fisier_nume,
      furnizor: furnizorCurat(d.furnizor),
      numarDocument: d.numar_document || null,
      suma: d.suma,
      locatie: d.locatie,
      utilitate: d.utilitate,
      dataDocument: d.data_document,
      sectiune: sectionFromPath(d.fisier_path),
      luna: luniById.get(d.luna_id) || null,
      downloadUrl: `/api/chitante/document?id=${d.id}`,
    })
  }

  // 2. Șabloane firmă (Model documente) — doar după nume, nu au furnizor/sumă
  const modelUrl = `${SB}/model_documente?firma_id=eq.${encodeURIComponent(firmaId)}&fisier_nume=ilike.*${escaped}*` +
    `&select=id,fisier_nume,sectiune,created_at&order=created_at.desc&limit=20`
  const modelRes = await fetch(modelUrl, { headers: H })
  if (modelRes.ok) {
    const modelDocs = await modelRes.json()
    for (const d of modelDocs || []) {
      results.push({
        id: d.id, fisierNume: d.fisier_nume, furnizor: null, numarDocument: null,
        suma: null, locatie: null, utilitate: null, dataDocument: null,
        sectiune: MODEL_DOC_LABELS[d.sectiune] || 'Model documente',
        luna: null,
        downloadUrl: `/api/model-documente/download?id=${d.id}`,
      })
    }
  }

  // 3. Facturi de asociat (adăugate în avans, în așteptarea extrasului lunii viitoare)
  const facturaOr = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${escaped}*`] : []),
    `furnizor.ilike.*${escaped}*`,
    `numar_document.ilike.*${escaped}*`,
  ]
  if (sumaCondition) facturaOr.push(sumaCondition)
  if (dateQuery) facturaOr.push(`data_factura.eq.${dateQuery}`)
  const facturaUrl = `${SB}/facturi_asteptate?firma_id=eq.${encodeURIComponent(firmaId)}&or=(${facturaOr.join(',')})` +
    `&select=id,fisier_nume,furnizor,numar_document,suma,data_factura,status,created_at&order=created_at.desc&limit=20`
  const facturaRes = await fetch(facturaUrl, { headers: H })
  if (facturaRes.ok) {
    const facturi = await facturaRes.json()
    for (const f of facturi || []) {
      results.push({
        id: f.id, fisierNume: f.fisier_nume, furnizor: furnizorCurat(f.furnizor), numarDocument: f.numar_document || null,
        suma: f.suma, locatie: null, utilitate: null, dataDocument: f.data_factura,
        sectiune: `Facturi de asociat${f.status === 'asociata' ? ' (asociată)' : ''}`,
        luna: null,
        downloadUrl: `/api/facturi-asteptate/download?id=${f.id}`,
      })
    }
  }

  // 4. Bonuri (combustibil și altele) — după comerciant, CUI client, sumă sau dată
  const bonOr = [
    ...(includeFisierNume ? [`fisier_nume.ilike.*${escaped}*`] : []),
    `comerciant.ilike.*${escaped}*`,
    `cui_client.ilike.*${escaped}*`,
  ]
  if (sumaCondition) bonOr.push(sumaCondition)
  if (dateQuery) bonOr.push(`data_bon.eq.${dateQuery}`)
  const bonUrl = `${SB}/bonuri?firma_id=eq.${encodeURIComponent(firmaId)}&or=(${bonOr.join(',')})` +
    `&select=id,fisier_nume,comerciant,cui_client,suma,data_bon,status,created_at&order=created_at.desc&limit=20`
  const bonRes = await fetch(bonUrl, { headers: H })
  if (bonRes.ok) {
    const bonuri = await bonRes.json()
    for (const b of bonuri || []) {
      results.push({
        id: b.id, fisierNume: b.fisier_nume, furnizor: b.comerciant || null, numarDocument: null,
        suma: b.suma, locatie: null, utilitate: null, dataDocument: b.data_bon,
        sectiune: `Bonuri${b.status === 'asociata' ? ' (asociat)' : ''}`,
        luna: null,
        downloadUrl: `/api/bonuri/download?id=${b.id}`,
      })
    }
  }

  return NextResponse.json(results.slice(0, 60))
}
