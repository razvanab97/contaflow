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

// Potriveste facturile adaugate in avans (luna trecuta) cu tranzactiile nedocumentate ale lunii curente,
// dupa suma exacta si data la care a fost INCARCATA factura (nu data emisa pe factura) - se presupune
// ca plata s-a facut in ziua incarcarii, iar tranzactia bancara poate aparea la 2-3 zile dupa - ca sugestie,
// nu asociere automata.
async function matchFacturiAsteptate(firmaId: string, txs: any[]) {
  const fRes = await fetch(`${SB}/facturi_asteptate?firma_id=eq.${firmaId}&status=eq.asteptare&select=id,fisier_nume,furnizor,suma,data_factura,created_at`, { headers: H })
  if (!fRes.ok) return new Map<string, any>()
  const facturi: any[] = await fRes.json()
  if (!facturi?.length) return new Map<string, any>()

  const used = new Set<string>()
  const sugestii = new Map<string, any>()
  for (const tx of txs) {
    if (tx.document_id || tx.tip !== 'debit' || tx.suma == null) continue
    let best: any = null
    for (const f of facturi) {
      if (used.has(f.id) || f.suma == null) continue
      if (Math.abs(Number(f.suma) - Number(tx.suma)) > 0.01) continue
      if (daysBetween(f.created_at, tx.data_tranzactie) > 3) continue
      best = f
      break
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
  const lunaRes = await fetch(`${SB}/luni_contabile?id=eq.${lunaId}&select=firma_id`, { headers: H })
  const [lunaRow] = lunaRes.ok ? await lunaRes.json() : []
  const sugestii = lunaRow?.firma_id ? await matchFacturiAsteptate(lunaRow.firma_id, all) : new Map<string, any>()

  return NextResponse.json(all.map(tx => ({
    ...tx,
    documente: tx.document_id ? documentsById.get(tx.document_id) || null : null,
    documenteToate: allDocsByTx.get(tx.id) || [],
    sugestieFactura: sugestii.get(tx.id) || null,
  })))
}
