import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function filenamePart(value: string, fallback = '') {
  const normalized = value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  return normalized || fallback
}

// Confirma o sugestie: copiaza bonul adaugat in avans pe tranzactia din extras, ca un
// atasament normal — la fel ca atunci cand incarci manual un document pe o tranzactie.
export async function POST(req: NextRequest) {
  const { bonId, tranzactieId } = await req.json()
  if (!bonId || !tranzactieId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: bon, error: bonError } = await sb.from('bonuri')
    .select('id,fisier_path,fisier_nume,fisier_tip,comerciant,cui_client,suma,firma_id')
    .eq('id', bonId).single()
  if (bonError || !bon) return NextResponse.json({ error: 'Bonul nu a fost găsit' }, { status: 404 })

  const { data: tx, error: txError } = await sb.from('tranzactii')
    .select('id,extras_id,document_id,data_tranzactie,suma')
    .eq('id', tranzactieId).single()
  if (txError || !tx) return NextResponse.json({ error: 'Tranzacția nu a fost găsită' }, { status: 404 })

  const { data: extras } = await sb.from('extrase').select('luna_id').eq('id', tx.extras_id).single()
  if (!extras?.luna_id) return NextResponse.json({ error: 'Luna tranzacției nu a putut fi determinată' }, { status: 500 })

  const { data: file, error: downloadError } = await sb.storage.from('documente').download(bon.fisier_path)
  if (downloadError || !file) return NextResponse.json({ error: 'Fișierul bonului nu a putut fi citit' }, { status: 500 })
  const bytes = new Uint8Array(await file.arrayBuffer())

  const details = filenamePart(bon.comerciant || 'bon', 'document')
  const renamedFile = [filenamePart(tx.data_tranzactie), filenamePart(Number(tx.suma).toFixed(2)), details].filter(Boolean).join('_') + `_${bon.fisier_nume}`
  const path = `${bon.firma_id}/${extras.luna_id}/tx/${tranzactieId}_${Date.now()}_${renamedFile}`

  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: bon.fisier_tip || 'application/pdf' })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data: doc, error: docError } = await sb.from('documente').insert({
    firma_id: bon.firma_id,
    luna_id: extras.luna_id,
    tranzactie_id: tranzactieId,
    modul: 'extras',
    tip_document: 'bon',
    furnizor: bon.comerciant || '',
    numar_document: '',
    fisier_path: path,
    fisier_nume: renamedFile,
    fisier_tip: bon.fisier_tip || 'application/pdf',
    fisier_marime: bytes.length,
    in_zip: true,
  }).select('id').single()
  if (docError || !doc) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: docError?.message || 'Eroare salvare document' }, { status: 500 })
  }

  if (!tx.document_id) {
    await sb.from('tranzactii').update({ document_id: doc.id, note: null, status_note: null }).eq('id', tranzactieId)
  }

  await sb.from('bonuri').update({ status: 'asociata', tranzactie_id: tranzactieId }).eq('id', bonId)

  const { data: documentedTxs } = await sb.from('tranzactii').select('id').eq('extras_id', tx.extras_id).not('document_id', 'is', null)
  if (documentedTxs) await sb.from('extrase').update({ nr_documentate: documentedTxs.length }).eq('id', tx.extras_id)

  return NextResponse.json({ ok: true, docId: doc.id })
}
