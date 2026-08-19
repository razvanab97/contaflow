import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

export async function PATCH(req: NextRequest) {
  const { id, copiat, numar_cautare } = await req.json()
  if (!id) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const sb = getServiceSupabase()

  const patch: Record<string, unknown> = {}
  if (typeof copiat === 'boolean') patch.copiat = copiat
  // Corectare manuala — pentru cand AI-ul citeste gresit numarul de cautat din aviz
  if (typeof numar_cautare === 'string' && numar_cautare.trim()) patch.numar_cautare = numar_cautare.trim()
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })

  const { error } = await sb.from('emag_avize_facturi').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const facturaId = fd.get('facturaId') as string
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    if (!file || !facturaId || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

    const sb = getServiceSupabase()
    const { data: fact } = await sb.from('emag_avize_facturi').select('id,task_key,numar_cautare,factura_document_id').eq('id', facturaId).single()
    if (!fact) return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const isPdf = file.type === 'application/pdf' || bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
    const extension = isPdf ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${safePart(fact.numar_cautare || 'factura', 'factura')}_${Date.now()}.${extension}`
    const path = `${firmaId}/${lunaId}/emag-facturi/${fact.task_key}/${fileName}`

    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'emag',
      tip_document: 'factura',
      furnizor: fact.task_key,
      numar_document: fact.numar_cautare,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: file.type,
      fisier_marime: bytes.length,
      in_zip: true,
    }).select('id').single()
    if (error || !doc) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: error?.message || 'Eroare salvare' }, { status: 500 })
    }

    // Inlocuieste documentul anterior daca era deja incarcat unul (re-upload)
    if (fact.factura_document_id) {
      const { data: old } = await sb.from('documente').select('fisier_path').eq('id', fact.factura_document_id).single()
      if (old?.fisier_path) await sb.storage.from('documente').remove([old.fisier_path])
      await sb.from('documente').delete().eq('id', fact.factura_document_id)
    }

    const { error: updError } = await sb.from('emag_avize_facturi').update({ factura_document_id: doc.id }).eq('id', facturaId)
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

    return NextResponse.json({ ok: true, documentId: doc.id, fisierNume: fileName })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const facturaId = req.nextUrl.searchParams.get('facturaId')
  if (!facturaId) return NextResponse.json({ error: 'Factura lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: fact } = await sb.from('emag_avize_facturi').select('factura_document_id').eq('id', facturaId).single()
  if (!fact?.factura_document_id) return NextResponse.json({ error: 'Niciun document de șters' }, { status: 404 })
  const { data: doc } = await sb.from('documente').select('fisier_path').eq('id', fact.factura_document_id).single()
  await sb.from('emag_avize_facturi').update({ factura_document_id: null }).eq('id', facturaId)
  await sb.from('documente').delete().eq('id', fact.factura_document_id)
  if (doc?.fisier_path) await sb.storage.from('documente').remove([doc.fisier_path])
  return NextResponse.json({ ok: true })
}
