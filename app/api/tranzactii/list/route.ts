import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

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
      `${SB}/tranzactii?extras_id=eq.${e.id}&select=id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,referinta,categorie,document_id,note&order=data_tranzactie,id`,
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

  return NextResponse.json(all.map(tx => ({
    ...tx,
    documente: tx.document_id ? documentsById.get(tx.document_id) || null : null
  })))
}
