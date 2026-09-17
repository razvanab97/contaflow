import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

const MS_DAY = 86400000
// Diferenta in zile calendaristice intre doua date (ignora ora, ca sa nu strice pragul de toleranta
// cand factura a fost incarcata spre finalul zilei).
function daysBetween(a: string, b: string) {
  const da = new Date(String(a).slice(0, 10) + 'T00:00:00Z').getTime()
  const db = new Date(String(b).slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.abs(da - db) / MS_DAY
}

// Diferenta de suma acceptata intre document si tranzactie (comisioane bancare, rotunjiri de curs
// etc. produc de obicei cateva zeci de bani diferenta) - sub acest prag sugestia automata tot apare,
// doar ca nu mai e marcata "suma identica" (vezi sumaPotrivita in components/types.ts).
const SUMA_TOLERANTA = 1

// Potriveste documentele deja importate in Inbox Facturi (local, Gmail sau Oblio), dar inca nelegate
// de nicio tranzactie, cu tranzactiile nedocumentate - dupa suma apropiata (+/- SUMA_TOLERANTA) si,
// cand documentul are data, dupa apropierea de data tranzactiei - ca sugestie automata (nu asociere
// directa), la fel ca la facturile Airbnb de mai jos. Alege mereu cea mai apropiata suma disponibila,
// nu prima gasita, ca sa nu "fure" un document mai potrivit pentru o alta tranzactie.
async function matchInboxFacturi(firmaId: string, txs: any[]) {
  const dRes = await fetch(`${SB}/documente?firma_id=eq.${firmaId}&modul=eq.inbox_facturi&tranzactie_id=is.null&suma=not.is.null&select=id,fisier_nume,furnizor,suma,valuta,data_document,numar_document`, { headers: H })
  if (!dRes.ok) return new Map<string, any>()
  const docs: any[] = await dRes.json()
  if (!docs?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    const txValuta = (tx.valuta || 'RON').toUpperCase()
    let best: any = null
    let bestDiff = Infinity
    for (const d of docs) {
      if (used.has(d.id) || d.suma == null) continue
      if ((d.valuta || 'RON').toUpperCase() !== txValuta) continue
      const diff = Math.abs(Number(d.suma) - Number(tx.suma))
      if (diff > SUMA_TOLERANTA) continue
      if (d.data_document && daysBetween(d.data_document, tx.data_tranzactie) > 60) continue
      if (diff < bestDiff) { best = d; bestDiff = diff }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, best) }
  }
  return sugestii
}

// Data cea mai de incredere pentru apropierea de tranzactia bancara: data reala a documentului
// (data_factura/data_bon) cand exista - de multe ori bonurile/facturile sunt fotografiate/incarcate
// in lot, mult dupa cumparare (ex. mai multe bonuri de combustibil scanate intr-o singura sedinta la
// sfarsit de luna), deci data incarcarii (created_at) nu mai are nicio legatura cu data platii. Cand
// documentul nu are data proprie, ramanem pe created_at ca aproximare (comportamentul de dinainte).
function dataReferintaDocument(dataDocument: string | null | undefined, createdAt: string): string {
  return dataDocument || createdAt
}

// Potriveste facturile adaugate in avans (luna trecuta) cu tranzactiile nedocumentate ale lunii curente,
// dupa suma apropiata (+/- SUMA_TOLERANTA) si apropierea de data platii (data facturii cand exista,
// altfel data incarcarii) - ca sugestie, nu asociere automata. Alege cea mai apropiata suma, nu prima gasita.
async function matchFacturiAsteptate(firmaId: string, txs: any[]) {
  const fRes = await fetch(`${SB}/facturi_asteptate?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,fisier_nume,furnizor,suma,data_factura,created_at`, { headers: H })
  if (!fRes.ok) return new Map<string, any>()
  const facturi: any[] = await fRes.json()
  if (!facturi?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    // facturi_asteptate nu are coloana valuta (presupune mereu RON) - o tranzactie in alta moneda
    // nu poate fi comparata corect dupa suma bruta, asa ca o excludem din potrivire automata.
    if ((tx.valuta || 'RON').toUpperCase() !== 'RON') continue
    let best: any = null
    let bestDiff = Infinity
    for (const f of facturi) {
      if (used.has(f.id) || f.suma == null) continue
      const diff = Math.abs(Number(f.suma) - Number(tx.suma))
      if (diff > SUMA_TOLERANTA) continue
      const referinta = dataReferintaDocument(f.data_factura, f.created_at)
      const maxZile = f.data_factura ? 7 : 3
      if (daysBetween(referinta, tx.data_tranzactie) > maxZile) continue
      if (diff < bestDiff) { best = f; bestDiff = diff }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, best) }
  }
  return sugestii
}

// Potriveste bonurile fiscale adaugate in avans cu tranzactiile nedocumentate, dupa aceleasi
// criterii ca facturile din facturi_asteptate (suma apropiata + apropierea de data platii) - ca
// sugestie, nu asociere automata. Alege cea mai apropiata suma.
async function matchBonuri(firmaId: string, txs: any[]) {
  const bRes = await fetch(`${SB}/bonuri?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,fisier_nume,comerciant,cui_client,suma,data_bon,tip,created_at`, { headers: H })
  if (!bRes.ok) return new Map<string, any>()
  const bonuri: any[] = await bRes.json()
  if (!bonuri?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    // bonuri nu are coloana valuta (presupune mereu RON) - vezi motivul de mai sus la facturi_asteptate.
    if ((tx.valuta || 'RON').toUpperCase() !== 'RON') continue
    let best: any = null
    let bestDiff = Infinity
    for (const b of bonuri) {
      if (used.has(b.id) || b.suma == null) continue
      const diff = Math.abs(Number(b.suma) - Number(tx.suma))
      if (diff > SUMA_TOLERANTA) continue
      const referinta = dataReferintaDocument(b.data_bon, b.created_at)
      const maxZile = b.data_bon ? 7 : 3
      if (daysBetween(referinta, tx.data_tranzactie) > maxZile) continue
      if (diff < bestDiff) { best = b; bestDiff = diff }
    }
    if (best) { used.add(best.id); sugestii.set(tx.id, best) }
  }
  return sugestii
}

export async function GET(req: NextRequest) {
  const lunaId = new URL(req.url).searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json([], { status: 400 })

  // Get extras IDs for this luna
  const eRes = await fetch(`${SB}/extrase?luna_id=eq.${lunaId}&select=id`, { headers: H })
  if (!eRes.ok)
    return NextResponse.json({ error: await eRes.text() }, { status: 502 })
  const extrase = await eRes.json()
  if (!extrase?.length) return NextResponse.json([])

  // Get all tranzactii for these extras
  let all: any[] = []
  for (const e of extrase) {
    const r = await fetch(
      `${SB}/tranzactii?extras_id=eq.${e.id}&select=id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,referinta,categorie,document_id,note,status_note&order=data_tranzactie,id`,
      { headers: H }
    )
    if (!r.ok)
      return NextResponse.json({ error: await r.text() }, { status: 502 })
    const txs = await r.json()
    if (Array.isArray(txs)) all = [...all, ...txs]
  }

  const documentIds = [...new Set(all.map(tx => tx.document_id).filter(Boolean))]
  const documentsById = new Map<string, any>()
  if (documentIds.length > 0) {
    const dRes = await fetch(
      `${SB}/documente?id=in.(${documentIds.join(',')})&select=id,tip_document,furnizor,numar_document,fisier_nume`,
      { headers: H }
    )
    if (!dRes.ok)
      return NextResponse.json({ error: await dRes.text() }, { status: 502 })
    const documents = await dRes.json()
    for (const document of documents) documentsById.set(document.id, document)
  }

  // Toate documentele atasate pe fiecare tranzactie (nu doar cel principal) - o tranzactie poate avea mai multe facturi
  const txIds = all.map(tx => tx.id)
  const allDocsByTx = new Map<string, any[]>()
  if (txIds.length > 0) {
    const adRes = await fetch(
      `${SB}/documente?tranzactie_id=in.(${txIds.join(',')})&select=id,tranzactie_id,tip_document,furnizor,numar_document,fisier_nume&order=created_at`,
      { headers: H }
    )
    if (adRes.ok) {
      const allTxDocs = await adRes.json()
      for (const d of allTxDocs) {
        if (!allDocsByTx.has(d.tranzactie_id)) allDocsByTx.set(d.tranzactie_id, [])
        allDocsByTx.get(d.tranzactie_id)!.push(d)
      }
    }
  }

  // Sugestii de asociere cu facturi adaugate in avans luna trecuta (dupa suma + data apropiata)
  // sau deja importate in Inbox Facturi (local/Gmail), dar nelegate inca de nicio tranzactie.
  const lunaRes = await fetch(`${SB}/luni_contabile?id=eq.${lunaId}&select=firma_id`, { headers: H })
  const [lunaRow] = lunaRes.ok ? await lunaRes.json() : []
  const sugestii = lunaRow?.firma_id ? await matchFacturiAsteptate(lunaRow.firma_id, all) : new Map<string, any>()
  const sugestiiInbox = lunaRow?.firma_id ? await matchInboxFacturi(lunaRow.firma_id, all) : new Map<string, any>()
  const sugestiiBon = lunaRow?.firma_id ? await matchBonuri(lunaRow.firma_id, all) : new Map<string, any>()

  return NextResponse.json(all.map(tx => ({
    ...tx,
    documente: tx.document_id ? documentsById.get(tx.document_id) || null : null,
    documenteToate: allDocsByTx.get(tx.id) || [],
    sugestieFactura: sugestii.get(tx.id) || null,
    sugestieInbox: sugestiiInbox.get(tx.id) || null,
    sugestieBon: sugestiiBon.get(tx.id) || null,
  })))
}
