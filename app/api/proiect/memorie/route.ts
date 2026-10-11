import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { adaugaMemorie, listaMemorie } from '@/lib/proiect-memorie'

export const dynamic = 'force-dynamic'

// Memoria proiectului: lista (cele mai noi primele), adaugare manuala, stergere.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  return NextResponse.json(await listaMemorie(getServiceSupabase(), firmaId))
}

export async function POST(req: NextRequest) {
  const { firmaId, data, categorie, text } = await req.json().catch(() => ({}))
  if (!firmaId || !String(text || '').trim()) return NextResponse.json({ error: 'Scrie ce s-a întâmplat.' }, { status: 400 })
  const m = await adaugaMemorie(getServiceSupabase(), firmaId, { data, categorie, text, sursa: 'manual' })
  if (!m) return NextResponse.json({ error: 'Nu s-a salvat — rulează migrarea SQL pentru tabelul proiect_memorie.' }, { status: 500 })
  return NextResponse.json({ memorie: m })
}

export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), id = req.nextUrl.searchParams.get('id')
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const { error } = await getServiceSupabase().from('proiect_memorie').delete().eq('firma_id', firmaId).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
