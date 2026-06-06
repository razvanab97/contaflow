import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
export async function POST(req: NextRequest) {
  const sb = getServiceSupabase()
  const fd = await req.formData()
  const file = fd.get('file') as File
  const itemId = fd.get('itemId') as string
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  const tip = fd.get('tip') as string || 'factura'
  const desc = fd.get('desc') as string || ''
  if (!file || !itemId) return NextResponse.json({ error: 'lipsă' }, { status: 400 })
  const buf = Buffer.from(await file.arrayBuffer())
  const path = `${firmaId}/${lunaId}/checklist/${itemId}_${Date.now()}_${file.name}`
  const { error: upErr } = await sb.storage.from('documente').upload(path, buf, { contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  await sb.from('documente').insert({
    firma_id: firmaId, luna_id: lunaId, checklist_item_id: itemId,
    tip_document: tip, furnizor: desc,
    fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, fisier_marime: file.size, in_zip: true
  })
  return NextResponse.json({ ok: true })
}
