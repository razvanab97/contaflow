import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function filenamePart(value: string, fallback = '') {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return normalized || fallback
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File
    const txId = fd.get('txId') as string
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const tip = (fd.get('tip') as string) || 'factura'
    const furnizor = (fd.get('furnizor') as string) || ''
    const numDoc = (fd.get('numDoc') as string) || ''

    if (!file || !txId || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă pentru asocierea documentului' }, { status: 400 })
    if (!ALLOWED_TYPES.has(file.type))
      return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

    const txRes = await fetch(
      `${SB}/rest/v1/tranzactii?id=eq.${encodeURIComponent(txId)}&firma_id=eq.${encodeURIComponent(firmaId)}&select=id,extras_id,document_id,data_tranzactie,descriere_curatata,descriere,suma`,
      { headers: H }
    )
    const txs = txRes.ok ? await txRes.json() : []
    const tx = Array.isArray(txs) ? txs[0] : null
    if (!tx?.id)
      return NextResponse.json({ error: 'Tranzacția nu a fost găsită pentru firma selectată' }, { status: 404 })

    const buf = Buffer.from(await file.arrayBuffer())
    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const details = furnizor || tx.descriere_curatata || tx.descriere || 'document'
    const renamedFile = [
      filenamePart(tx.data_tranzactie, 'fara_data'),
      filenamePart(Number(tx.suma).toFixed(2), 'fara_suma'),
      filenamePart(details, 'document'),
      numDoc ? filenamePart(numDoc) : '',
    ].filter(Boolean).join('_') + `.${extension}`
    const path = `${firmaId}/${lunaId}/tx/${txId}_${Date.now()}_${renamedFile}`

    const upRes = await fetch(`${SB}/storage/v1/object/documente/${path}`, {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
      body: buf
    })
    if (!upRes.ok) return NextResponse.json({ error: 'Storage: ' + await upRes.text() }, { status: 500 })

    const documentBody = {
      firma_id: firmaId, luna_id: lunaId, tranzactie_id: txId,
      modul: 'extras', tip_document: tip, furnizor, numar_document: numDoc,
      fisier_path: path, fisier_nume: renamedFile, fisier_tip: file.type,
      fisier_marime: file.size, in_zip: true
    }
    const docRes = await fetch(
      tx.document_id
        ? `${SB}/rest/v1/documente?id=eq.${encodeURIComponent(tx.document_id)}`
        : `${SB}/rest/v1/documente`,
      {
        method: tx.document_id ? 'PATCH' : 'POST',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(documentBody)
      }
    )
    const docs = await docRes.json()
    const doc = Array.isArray(docs) ? docs[0] : docs
    if (!docRes.ok || !doc?.id) return NextResponse.json({ error: 'DB doc: ' + JSON.stringify(doc) }, { status: 500 })

    const updateRes = await fetch(`${SB}/rest/v1/tranzactii?id=eq.${encodeURIComponent(txId)}`, {
      method: 'PATCH',
      headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ document_id: doc.id, note: null })
    })
    if (!updateRes.ok)
      return NextResponse.json({ error: 'Tranzacția nu a putut fi actualizată' }, { status: 500 })

    const countRes = await fetch(
      `${SB}/rest/v1/tranzactii?extras_id=eq.${encodeURIComponent(tx.extras_id)}&document_id=not.is.null&select=id`,
      { headers: { ...H, 'Prefer': 'count=exact' } }
    )
    const documented = countRes.ok ? (await countRes.json()).length : null
    if (documented !== null) {
      await fetch(`${SB}/rest/v1/extrase?id=eq.${encodeURIComponent(tx.extras_id)}`, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ nr_documentate: documented })
      })
    }

    return NextResponse.json({ ok: true, docId: doc.id, filename: renamedFile })
  } catch (error) {
    const message = String(error)
    const status = message.includes('Content-Type') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
