import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { createAchizitie } from '@/lib/achizitii'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('proiect_achizitii')
    .select('*')  // include linie_buget (coloana adaugata ulterior), daca exista
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { firmaId, lunaId, denumire, valoare, sursa, linieBuget, nota } = body
  if (!firmaId || !denumire) return NextResponse.json({ error: 'firmaId/denumire lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  try {
    const data = await createAchizitie(sb, { firmaId, lunaId, denumire, valoare, sursa })
    // Pornita din buget: linia de buget + nota cu bugetul (fara sa blocheze daca migrarea lipseste).
    if (data?.id && (linieBuget || nota)) await sb.from('proiect_achizitii').update({ ...(linieBuget ? { linie_buget: String(linieBuget) } : {}), ...(nota ? { nota: String(nota) } : {}) }).eq('id', data.id)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Eroare salvare' }, { status: 500 })
  }
}
