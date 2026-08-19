import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const SECTIUNI = ['raport_lunar', 'stat_plata_angajati', 'reges_angajati', 'acte_contabile']

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const [{ data: fisiere, error: e1 }, { data: notite, error: e2 }] = await Promise.all([
    sb.from('model_documente').select('id,sectiune,fisier_nume,fisier_tip,fisier_marime,created_at').eq('firma_id', firmaId).order('created_at', { ascending: true }),
    sb.from('model_documente_notite').select('sectiune,continut').eq('firma_id', firmaId),
  ])
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ fisiere: fisiere || [], notite: Object.fromEntries((notite || []).map(n => [n.sectiune, n.continut])) })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File
  const firmaId = fd.get('firmaId') as string
  const sectiune = fd.get('sectiune') as string
  if (!file || !firmaId || !sectiune) return NextResponse.json({ error: 'lipsă file/firmaId/sectiune' }, { status: 400 })
  if (!SECTIUNI.includes(sectiune)) return NextResponse.json({ error: 'secțiune invalidă' }, { status: 400 })

  const sb = getServiceSupabase()
  const path = `${firmaId}/model-documente/${sectiune}/${Date.now()}_${file.name}`

  const { error: upErr } = await sb.storage.from('documente').upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error } = await sb.from('model_documente').insert({
    firma_id: firmaId, sectiune, fisier_nume: file.name, fisier_path: path,
    fisier_tip: file.type, fisier_marime: file.size,
  }).select('id,sectiune,fisier_nume,fisier_tip,fisier_marime,created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, fisier_nume } = await req.json()
  if (!id || !fisier_nume) return NextResponse.json({ error: 'lipsă id/fisier_nume' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('model_documente').update({ fisier_nume }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('model_documente').select('fisier_path').eq('id', id).single()
  if (doc?.fisier_path) await sb.storage.from('documente').remove([doc.fisier_path])

  const { error } = await sb.from('model_documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
