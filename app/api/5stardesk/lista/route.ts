import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { generateDiscrepantePdfBytes, getListaDiscrepante } from '@/lib/discrepante-lista'

export const dynamic = 'force-dynamic'

const lipsaTabel = (e: { code?: string; message: string }) => ['42P01', 'PGRST205'].includes(e.code || '') ? 'Tabelul discrepante_lista nu există încă - rulează migrarea SQL.' : e.message

// Lista de discrepante a lunii: GET (randurile sau ?format=pdf), POST (bifare), PATCH (nota), DELETE (debifare).
export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsă' }, { status: 400 })
  if (req.nextUrl.searchParams.get('format') === 'pdf') {
    const bytes = await generateDiscrepantePdfBytes(lunaId, req.nextUrl.searchParams.get('firmaNume') || '', req.nextUrl.searchParams.get('lunaLabel') || '')
    if (!bytes) return NextResponse.json({ error: 'Lista e goală' }, { status: 404 })
    return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="lista_discrepante_5stardesk.pdf"' } })
  }
  const { error } = await getServiceSupabase().from('discrepante_lista').select('id').limit(1)
  if (error) return NextResponse.json({ error: lipsaTabel(error) }, { status: 500 })
  return NextResponse.json({ randuri: await getListaDiscrepante(lunaId) })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.lunaId || !b.firmaId || !b.cheie || !b.sectiune) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('discrepante_lista').upsert({
    luna_id: b.lunaId, firma_id: b.firmaId, cheie: String(b.cheie), sectiune: String(b.sectiune).slice(0, 120),
    titlu: b.titlu ? String(b.titlu).slice(0, 200) : null, cod_rezervare: b.codRezervare || null,
    suma: typeof b.suma === 'number' ? b.suma : null, detalii: b.detalii ? String(b.detalii).slice(0, 1500) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'luna_id,cheie' }).select('*').single()
  if (error) return NextResponse.json({ error: lipsaTabel(error) }, { status: 500 })
  return NextResponse.json({ rand: data })
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id lipsă' }, { status: 400 })
  const { error } = await getServiceSupabase().from('discrepante_lista')
    .update({ nota: String(b.nota || '').trim().slice(0, 2000) || null, updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: lipsaTabel(error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId'), cheie = req.nextUrl.searchParams.get('cheie')
  if (!lunaId || !cheie) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const { error } = await getServiceSupabase().from('discrepante_lista').delete().eq('luna_id', lunaId).eq('cheie', cheie)
  if (error) return NextResponse.json({ error: lipsaTabel(error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
