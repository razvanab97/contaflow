import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File
  const txId = fd.get('txId') as string
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  const tip = (fd.get('tip') as string) || 'factura'
  const furnizor = (fd.get('furnizor') as string) || ''
  const numDoc = (fd.get('numDoc') as string) || ''

  if (!file || !txId) return NextResponse.json({ error: 'lipsă' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const path = `${firmaId}/${lunaId}/tx/${txId}_${Date.now()}_${file.name}`

  // Upload to storage
  const upRes = await fetch(`${SB}/storage/v1/object/documente/${path}`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
    body: buf
  })
  if (!upRes.ok) return NextResponse.json({ error: 'Storage: ' + await upRes.text() }, { status: 500 })

  // Insert document
  const docRes = await fetch(`${SB}/rest/v1/documente`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      firma_id: firmaId, luna_id: lunaId, tranzactie_id: txId,
      modul: 'extras', tip_document: tip, furnizor, numar_document: numDoc,
      fisier_path: path, fisier_nume: file.name, fisier_tip: file.type,
      fisier_marime: file.size, in_zip: true
    })
  })
  const docs = await docRes.json()
  const doc = Array.isArray(docs) ? docs[0] : docs
  if (!docRes.ok || !doc?.id) return NextResponse.json({ error: 'DB doc: ' + JSON.stringify(doc) }, { status: 500 })

  // Update tranzactie
  await fetch(`${SB}/rest/v1/tranzactii?id=eq.${txId}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ document_id: doc.id })
  })

  return NextResponse.json({ ok: true, docId: doc.id })
}
