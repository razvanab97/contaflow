import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export async function GET(req: NextRequest) {
  const obligatieStareId = req.nextUrl.searchParams.get('obligatieStareId')
  if (!obligatieStareId) return NextResponse.json({ error: 'obligatieStareId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('id,fisier_nume,fisier_tip,created_at')
    .eq('obligatie_stare_id', obligatieStareId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const obligatieStareId = String(fd.get('obligatieStareId') || '')
  const label = String(fd.get('label') || 'obligatie')
  if (!file || !obligatieStareId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: stare } = await sb.from('obligatii_stari').select('id,luna_id,tip_key').eq('id', obligatieStareId).single()
  if (!stare) return NextResponse.json({ error: 'Obligația nu a fost găsită' }, { status: 404 })
  const { data: lunaRow } = await sb.from('luni_contabile').select('firma_id').eq('id', stare.luna_id).single()
  if (!lunaRow) return NextResponse.json({ error: 'Luna nu a fost găsită' }, { status: 404 })

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const bytes = new Uint8Array(await file.arrayBuffer())
  const safeLabel = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
  const path = `${lunaRow.firma_id}/${stare.luna_id}/obligatii/${obligatieStareId}_${Date.now()}_${safeLabel}.${extension}`

  const { error: uploadError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: doc, error: docError } = await sb.from('documente').insert({
    firma_id: lunaRow.firma_id,
    luna_id: stare.luna_id,
    obligatie_stare_id: obligatieStareId,
    modul: 'obligatii',
    tip_document: stare.tip_key,
    furnizor: label,
    fisier_path: path,
    fisier_nume: `${safeLabel}.${extension}`,
    fisier_tip: file.type,
    fisier_marime: bytes.length,
    in_zip: true,
  }).select('id,fisier_nume,fisier_tip,created_at').single()
  if (docError || !doc) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: docError?.message || 'Eroare salvare document' }, { status: 500 })
  }

  return NextResponse.json(doc)
}
