import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const FIELDS = ['owner', 'beneficiaryFunction', 'identitySeries', 'identityNumber', 'defaultPurpose']

function cleanTemplate(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(FIELDS.map(field => [field, String(source[field] || '').slice(0, 300)]))
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ template: {} })
  const path = `${firmaId}/config/dispozitie-plata-template.json`
  const sb = getServiceSupabase()
  const { data } = await sb.storage.from('documente').download(path)
  if (!data) return NextResponse.json({ template: {} })
  try {
    return NextResponse.json({ template: cleanTemplate(JSON.parse(await data.text())) })
  } catch {
    return NextResponse.json({ template: {} })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { firmaId, lunaId, template } = await req.json()
    if (!firmaId || !lunaId) return NextResponse.json({ error: 'Firma sau luna contabilă lipsește' }, { status: 400 })
    const cleaned = cleanTemplate(template)
    const bytes = Buffer.from(JSON.stringify(cleaned))
    const path = `${firmaId}/config/dispozitie-plata-template.json`
    const sb = getServiceSupabase()
    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, {
      contentType: 'application/json',
      upsert: true,
    })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const { data: existing } = await sb.from('documente').select('id').eq('fisier_path', path).maybeSingle()
    const values = {
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'acte_contabile',
      tip_document: 'altul',
      furnizor: 'Șablon dispoziție de plată',
      fisier_path: path,
      fisier_nume: 'sablon_dispozitie_plata.json',
      fisier_tip: 'application/json',
      fisier_marime: bytes.length,
      in_zip: false,
    }
    const { error } = existing
      ? await sb.from('documente').update(values).eq('id', existing.id)
      : await sb.from('documente').insert(values)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: cleaned })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
