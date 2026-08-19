import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('angajati_extractii')
    .select('id,tip_document,angajati,cas,cass,impozit,total_plata,created_at')
    .eq('firma_id', firmaId)
    .eq('luna_id', lunaId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ angajati: [], cas: null, cass: null, impozit: null, totalPlata: null })

  // Salariile pe angajat vin de obicei din statul de plata / chenzina.
  // CAS/CASS/Impozit/Total sunt cifre de ansamblu (contributii catre stat) — le luam cu prioritate
  // din centralizatorul de contributii daca a fost incarcat (e sursa lor "oficiala"); "total de plata"
  // inseamna lucruri diferite in stat de plata (total salarii nete) fata de centralizator (total
  // contributii+impozit de virat), asa ca nu le amestecam intre documente de tipuri diferite.
  const angajatiByNume = new Map<string, number>()
  for (const row of data) {
    for (const a of (row.angajati as { nume: string; salariu: number }[] | null) || []) {
      if (a?.nume) angajatiByNume.set(a.nume, a.salariu)
    }
  }

  const centralizatoare = data.filter(r => r.tip_document === 'centralizator')
  const sursaContributii = centralizatoare.length ? centralizatoare : data.filter(r => r.cas != null || r.cass != null || r.impozit != null || r.total_plata != null)

  let cas: number | null = null, cass: number | null = null, impozit: number | null = null, totalPlata: number | null = null
  for (const row of sursaContributii) {
    if (row.cas != null) cas = row.cas
    if (row.cass != null) cass = row.cass
    if (row.impozit != null) impozit = row.impozit
    if (row.total_plata != null) totalPlata = row.total_plata
  }

  return NextResponse.json({
    angajati: [...angajatiByNume.entries()].map(([nume, salariu]) => ({ nume, salariu })),
    cas, cass, impozit, totalPlata,
  })
}
