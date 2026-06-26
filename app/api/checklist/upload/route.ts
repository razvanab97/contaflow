import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File
  const itemId = fd.get('itemId') as string
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  const tip = (fd.get('tip') as string) || 'factura'
  const desc = (fd.get('desc') as string) || ''

  if (!file || !itemId) return NextResponse.json({ error: 'lipsă' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const path = `${firmaId}/${lunaId}/checklist/${itemId}_${Date.now()}_${file.name}`

  const upRes = await fetch(`${SB}/storage/v1/object/documente/${path}`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
    body: buf
  })
  if (!upRes.ok) return NextResponse.json({ error: await upRes.text() }, { status: 500 })

  await fetch(`${SB}/rest/v1/documente`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      firma_id: firmaId, luna_id: lunaId, checklist_item_id: itemId,
      tip_document: tip, furnizor: desc,
      fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, fisier_marime: file.size, in_zip: true
    })
  })

  return NextResponse.json({ ok: true })
}
