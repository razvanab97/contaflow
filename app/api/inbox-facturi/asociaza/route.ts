import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Leaga un document deja importat in Inbox Facturi (local sau Gmail) de o tranzactie din Extras
// de cont - documentul e deja in storage, deci doar actualizam legaturile, fara re-upload.
// modul devine 'extras' ca sa fie inclus corect la exportul grupat pe tranzactii (getExtrasTxDocs),
// dar ramane vizibil si in Inbox Facturi (acel ecran filtreaza dupa fisier_path, nu dupa modul).
export async function POST(req: NextRequest) {
  const { facturaId, tranzactieId } = await req.json().catch(() => ({}))
  if (!facturaId || !tranzactieId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error: docError } = await sb.from('documente')
    .select('id,tranzactie_id')
    .eq('id', facturaId)
    .like('fisier_path', '%/inbox-facturi/%')
    .single()
  if (docError || !doc) return NextResponse.json({ error: 'Factura nu a fost găsită în Inbox Facturi' }, { status: 404 })
  if (doc.tranzactie_id) return NextResponse.json({ error: 'Această factură este deja asociată altei tranzacții' }, { status: 409 })

  const { data: tx, error: txError } = await sb.from('tranzactii')
    .select('id,extras_id,document_id,data_tranzactie')
    .eq('id', tranzactieId).single()
  if (txError || !tx) return NextResponse.json({ error: 'Tranzacția nu a fost găsită' }, { status: 404 })

  const { error: updateError } = await sb.from('documente')
    .update({ tranzactie_id: tranzactieId, modul: 'extras', platit: true, data_platii: tx.data_tranzactie })
    .eq('id', facturaId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (!tx.document_id) {
    await sb.from('tranzactii').update({ document_id: facturaId, note: null, status_note: null }).eq('id', tranzactieId)
  }

  const { data: documentedTxs } = await sb.from('tranzactii').select('id').eq('extras_id', tx.extras_id).not('document_id', 'is', null)
  if (documentedTxs) await sb.from('extrase').update({ nr_documentate: documentedTxs.length }).eq('id', tx.extras_id)

  return NextResponse.json({ ok: true, docId: facturaId })
}
