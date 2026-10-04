import { NextRequest, NextResponse } from 'next/server'
import { matchBonuri, matchFacturiAsteptate, matchInboxFacturi, matchGrupuriInbox, cuEchivalentLei } from '@/lib/tranzactii-potrivire'
import { cursuriBnrSigur } from '@/lib/curs-bnr'

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
  // motiv_ignorare/ignorat_auto vin din supabase_tranzactii_motiv_ignorare.sql - daca migrarea nu a
  // fost rulata inca, citim fara ele (pagina functioneaza ca inainte).
  const BASE_COLS = 'id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,referinta,categorie,document_id,note,status_note'
  let cols = `${BASE_COLS},motiv_ignorare,ignorat_auto`
  let all: any[] = []
  for (const e of extrase) {
    let r = await fetch(`${SB}/tranzactii?extras_id=eq.${e.id}&select=${cols}&order=data_tranzactie,id`, { headers: H })
    if (!r.ok && cols !== BASE_COLS) {
      cols = BASE_COLS
      r = await fetch(`${SB}/tranzactii?extras_id=eq.${e.id}&select=${cols}&order=data_tranzactie,id`, { headers: H })
    }
    if (!r.ok)
      return NextResponse.json({ error: await r.text() }, { status: 502 })
    const txs = await r.json()
    if (Array.isArray(txs)) all = [...all, ...txs]
  }

  const documentIds = [...new Set(all.map(tx => tx.document_id).filter(Boolean))]
  const documentsById = new Map<string, any>()
  if (documentIds.length > 0) {
    const dRes = await fetch(
      `${SB}/documente?id=in.(${documentIds.join(',')})&select=id,tip_document,furnizor,numar_document,fisier_nume,suma,valuta,data_document`,
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
      `${SB}/documente?tranzactie_id=in.(${txIds.join(',')})&select=id,tranzactie_id,tip_document,furnizor,numar_document,fisier_nume,suma,valuta,data_document&order=created_at`,
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
  // O plata = mai multe facturi (tipic eMAG) - doar pentru tranzactiile fara sugestie simpla, si fara
  // facturile deja propuse altor tranzactii.
  const sugestiiGrup = lunaRow?.firma_id ? await matchGrupuriInbox(lunaRow.firma_id, all, {
    tx: new Set([...sugestii.keys(), ...sugestiiInbox.keys(), ...sugestiiBon.keys()]),
    docs: new Set([...sugestiiInbox.values()].map((d: any) => d.id)),
  }) : new Map<string, any>()

  // Documentele in valuta (ex. factura 18 EUR) raman in moneda lor; adaugam doar echivalentul in lei
  // la cursul BNR din ziua documentului, pentru afisare.
  const docsValuta = [...documentsById.values(), ...[...allDocsByTx.values()].flat()].filter(d => (d.valuta || 'RON').toUpperCase() !== 'RON')
  const curs = await cursuriBnrSigur(docsValuta.map(d => d.data_document))

  return NextResponse.json(all.map(tx => ({
    ...tx,
    documente: tx.document_id && documentsById.get(tx.document_id) ? cuEchivalentLei(documentsById.get(tx.document_id), curs) : null,
    documenteToate: (allDocsByTx.get(tx.id) || []).map(d => cuEchivalentLei(d, curs)),
    sugestieFactura: sugestii.get(tx.id) || null,
    sugestieInbox: sugestiiInbox.get(tx.id) || null,
    sugestieBon: sugestiiBon.get(tx.id) || null,
    sugestieGrup: sugestiiGrup.get(tx.id) || null,
  })))
}
