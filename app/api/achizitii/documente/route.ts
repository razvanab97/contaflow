import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export async function GET(req: NextRequest) {
  const achizitieId = req.nextUrl.searchParams.get('achizitieId')
  if (!achizitieId) return NextResponse.json({ error: 'achizitieId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('id,fisier_nume,fisier_tip,tip_document,created_at')
    .eq('achizitie_id', achizitieId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const achizitieId = String(fd.get('achizitieId') || '')
  const etapa = String(fd.get('etapa') || 'document')
  if (!file || !achizitieId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: achizitie } = await sb.from('proiect_achizitii').select('id,firma_id,luna_id,denumire').eq('id', achizitieId).single()
  if (!achizitie) return NextResponse.json({ error: 'Achiziția nu a fost găsită' }, { status: 404 })

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const bytes = new Uint8Array(await file.arrayBuffer())
  const safeName = (achizitie.denumire || 'achizitie').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
  const path = `${achizitie.firma_id}/${achizitie.luna_id || 'fara-luna'}/achizitii/${achizitieId}_${Date.now()}_${safeName}_${etapa}.${extension}`

  const { error: uploadError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: doc, error: docError } = await sb.from('documente').insert({
    firma_id: achizitie.firma_id,
    luna_id: achizitie.luna_id,
    achizitie_id: achizitieId,
    modul: 'achizitii',
    tip_document: etapa,
    furnizor: achizitie.denumire,
    fisier_path: path,
    fisier_nume: `${safeName}_${etapa}.${extension}`,
    fisier_tip: file.type,
    fisier_marime: bytes.length,
    in_zip: true,
  }).select('id,fisier_nume,fisier_tip,tip_document,created_at').single()
  if (docError || !doc) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: docError?.message || 'Eroare salvare document' }, { status: 500 })
  }

  return NextResponse.json(doc)
}
