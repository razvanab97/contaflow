import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { extractExtras } from '@/lib/ai/extract'

export async function POST(req: NextRequest) {
  const sb = getServiceSupabase()
  const fd = await req.formData()
  const file = fd.get('pdf') as File
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  const valuta = fd.get('valuta') as string
  if (!file||!firmaId||!lunaId) return NextResponse.json({ error:'lipsă date' }, { status:400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const path = `${firmaId}/${lunaId}/${valuta}_${Date.now()}.pdf`
  const { error: upErr } = await sb.storage.from('extrase-pdf').upload(path, buf, { contentType:'application/pdf' })
  if (upErr) return NextResponse.json({ error:upErr.message }, { status:500 })

  let info: Awaited<ReturnType<typeof extractExtras>>
  try { info = await extractExtras(buf.toString('base64')) }
  catch (e) { return NextResponse.json({ error:'AI extract: '+String(e) }, { status:500 }) }

  // Delete old extras for same luna+valuta
  const { data: oldExtras } = await sb.from('extrase').select('id').eq('luna_id', lunaId).eq('valuta', valuta)
  if (oldExtras?.length) {
    const ids = oldExtras.map(e=>e.id)
    await sb.from('tranzactii').delete().in('extras_id', ids)
    await sb.from('extrase').delete().in('id', ids)
  }

  const { data: extras, error: eErr } = await sb.from('extrase').insert({
    firma_id:firmaId, luna_id:lunaId, valuta:info.valuta||valuta,
    iban:info.iban, numar_extras:info.numar_extras,
    perioada_start:info.perioada_start, perioada_end:info.perioada_end,
    sold_initial:info.sold_initial, sold_final:info.sold_final,
    total_debit:info.total_debit, total_credit:info.total_credit,
    pdf_path:path, pdf_nume:file.name, procesat_ai:true,
    nr_tranzactii:info.tranzactii.length, nr_documentate:0
  }).select().single()
  if (eErr||!extras) return NextResponse.json({ error:eErr?.message }, { status:500 })

  const txs = info.tranzactii.map(t => ({
    extras_id:extras.id, firma_id:firmaId,
    data_tranzactie:t.data_tranzactie, descriere:t.descriere, descriere_curatata:t.descriere_curatata,
    tip:t.tip, suma:t.suma, valuta:t.valuta||info.valuta||valuta,
    referinta:t.referinta, categorie:t.categorie,
  }))

  if (txs.length > 0) {
    const { error: txErr } = await sb.from('tranzactii').insert(txs)
    if (txErr) return NextResponse.json({ error:txErr.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, extrasId:extras.id, count:txs.length })
}
