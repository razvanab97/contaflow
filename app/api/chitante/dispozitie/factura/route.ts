import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Editarea unei facturi atasate la o dispozitie de plata (suma, utilitatea/furnizorul, apartamentul,
// data facturii). Doar facturile din /dispozitii-plata/atasamente/. Dispozitia in sine se regenereaza
// separat (POST /api/chitante/dispozitie cu editId) ca sa-si ia noua suma/noul text.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if ('suma' in body) {
    const v = body.suma === null || body.suma === '' ? null : Number(body.suma)
    if (v !== null && !Number.isFinite(v)) return NextResponse.json({ error: 'Suma nu e validă' }, { status: 400 })
    patch.suma = v
  }
  if ('utilitate' in body) patch.utilitate = String(body.utilitate || '').trim() || null
  if ('locatie' in body) patch.locatie = String(body.locatie || '').trim() || null
  if ('data_document' in body) {
    const d = body.data_document ? String(body.data_document) : null
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ error: 'Data nu e validă' }, { status: 400 })
    patch.data_document = d
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nimic de salvat' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('documente').select('id').eq('id', id).eq('tip_document', 'factura').like('fisier_path', '%/dispozitii-plata/atasamente/%').maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
  const { error } = await sb.from('documente').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
