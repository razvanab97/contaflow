import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Din lista de proprietati copiata din extranetul Booking, fiecare rand de proprietate
// incepe cu codul (cifre) urmat de denumire; liniile de adresa/status care urmeaza nu incep
// cu cifre, deci sunt ignorate automat.
function parseBulkLocatii(text: string) {
  const out: { cod: string; denumire: string }[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const match = line.match(/^(\d{5,10})[\s\t.:-]+(.+)$/)
    if (!match) continue
    const denumire = match[2].trim()
    if (denumire) out.push({ cod: match[1], denumire })
  }
  return out
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('booking_locatii')
    .select('id,cod,denumire,activa,created_at')
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locatii: data || [] })
}

export async function POST(req: NextRequest) {
  const { firmaId, cod, denumire, bulkText } = await req.json().catch(() => ({}))
  const cleanFirmaId = String(firmaId || '')
  if (!cleanFirmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const perechi = typeof bulkText === 'string' && bulkText.trim()
    ? parseBulkLocatii(bulkText)
    : cod && denumire ? [{ cod: String(cod).trim(), denumire: String(denumire).trim() }] : []
  if (!perechi.length) return NextResponse.json({ error: 'Nu am găsit nicio locație validă (cod + denumire)' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('booking_locatii')
    .upsert(
      perechi.map(p => ({ firma_id: cleanFirmaId, cod: p.cod, denumire: p.denumire, activa: true })),
      { onConflict: 'firma_id,cod' }
    )
    .select('id,cod,denumire,activa,created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locatii: data || [], adaugate: perechi.length })
}

export async function PATCH(req: NextRequest) {
  const { id, activa } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { error } = await sb.from('booking_locatii').update({ activa: !!activa }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { error } = await sb.from('booking_locatii').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
