import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const sb = getServiceSupabase()
  const fd = await req.formData()
  const file = fd.get('file') as File
  const txId = fd.get('txId') as string
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  const tip = (fd.get('tip') as string) || 'factura'
  const furnizor = (fd.get('furnizor') as string) || ''
  const numDoc = (fd.get('numDoc') as string) || ''

  if (!file || !txId) return NextResponse.json({ error: 'lipsă date' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const path = `${firmaId}/${lunaId}/tx/${txId}_${Date.now()}_${file.name}`

  const { error: upErr } = await sb.storage.from('documente').upload(path, buf, { contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: doc, error: docErr } = await sb.from('documente').insert({
    firma_id: firmaId, luna_id: lunaId, tranzactie_id: txId,
    modul: 'extras', tip_document: tip, furnizor, numar_document: numDoc,
    fisier_path: path, fisier_nume: file.name, fisier_tip: file.type,
    fisier_marime: file.size, in_zip: true
  }).select().single()

  if (docErr || !doc) return NextResponse.json({ error: docErr?.message }, { status: 500 })

  await sb.from('tranzactii').update({ document_id: doc.id }).eq('id', txId)
  return NextResponse.json({ ok: true })
}
