import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Secțiunile gestionate prin UploadPanel — singurele din care acest endpoint generic
// are voie să șteargă (documentele din emag-avize/dispozitii-plata/etc. au rutele lor proprii)
const DELETABLE_SECTIONS = [
  'facturi-chitanta', 'facturi-restante', 'inbox-facturi',
  'booking-facturi', 'booking-borderou',
  'airbnb-facturi', 'airbnb-borderou',
  '5stardesk', 'trendyol', 'acte-contabile', 'angajati', 'achizitii',
]

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const inline = req.nextUrl.searchParams.get('preview') === '1'
  if (!id) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error } = await sb
    .from('documente')
    .select('fisier_path,fisier_nume,fisier_tip,modul')
    .eq('id', id)
    .single()
  if (error || !doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const { data: file, error: downloadError } = await sb.storage.from('documente').download(doc.fisier_path)
  if (downloadError || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  const fileName = String(doc.fisier_nume || 'document').replace(/["\r\n]/g, '_')
  return new NextResponse(Buffer.from(await file.arrayBuffer()), {
    headers: {
      'Content-Type': doc.fisier_tip || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc, error } = await sb
    .from('documente')
    .select('id,fisier_path,tranzactie_id,modul')
    .eq('id', id)
    .single()
  if (error || !doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const path = String(doc.fisier_path || '')
  // "/tx/..." = document atasat direct pe o tranzactie din Extras de cont (nu printr-o sectiune
  // UploadPanel) - stergerea e mereu permisa, tranzactia revine la "fara document" prin unlink-ul
  // de mai jos.
  if (!path.includes('/tx/') && !DELETABLE_SECTIONS.some(section => path.includes(`/${section}/`)))
    return NextResponse.json({ error: 'Acest document nu poate fi șters din această secțiune' }, { status: 403 })

  // extras_id al tranzactiei (daca exista) - ca sa recalculam nr_documentate dupa stergere,
  // altfel Extras de cont ar arata un numar de documente mai mare decat cel real.
  let extrasId: string | null = null
  if (doc.tranzactie_id) {
    const { data: tx } = await sb.from('tranzactii').select('extras_id').eq('id', doc.tranzactie_id).single()
    extrasId = tx?.extras_id || null
  }

  const { error: unlinkError } = await sb.from('tranzactii').update({ document_id: null }).eq('document_id', id)
  if (unlinkError) return NextResponse.json({ error: unlinkError.message }, { status: 500 })

  if (path.includes('/airbnb-facturi/')) {
    await sb
      .from('airbnb_facturi_asteptate')
      .update({ factura_document_id: null, status: 'de_atasat', updated_at: new Date().toISOString() })
      .eq('factura_document_id', id)
  }

  const { error: deleteError } = await sb.from('documente').delete().eq('id', id)
  if (deleteError) {
    if (doc.tranzactie_id) await sb.from('tranzactii').update({ document_id: id }).eq('id', doc.tranzactie_id)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  const { error: storageError } = await sb.storage.from('documente').remove([path])

  if (extrasId) {
    const { data: documentedTxs } = await sb.from('tranzactii').select('id').eq('extras_id', extrasId).not('document_id', 'is', null)
    await sb.from('extrase').update({ nr_documentate: documentedTxs?.length || 0 }).eq('id', extrasId)
  }

  return NextResponse.json({ ok: true, warning: storageError?.message || null })
}
