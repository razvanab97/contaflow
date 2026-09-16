import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Cautare manuala in Inbox Facturi (local + Gmail), mai permisiva decat sugestia automata din
// tranzactii/list (care cere suma exact identica) - pentru cazul in care sugestia automata nu a
// gasit nimic si utilizatorul vrea sa se asigure ca nu exista totusi o factura potrivita, printre
// documentele inca nelegate de nicio tranzactie. Returneaza cele mai apropiate candidate dupa suma,
// oricat de mare ar fi diferenta, ca sa poata fi verificate vizual.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const suma = Number(req.nextUrl.searchParams.get('suma'))
  if (!firmaId || !Number.isFinite(suma)) return NextResponse.json({ error: 'firmaId sau suma lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: docs, error } = await sb.from('documente')
    .select('id,fisier_nume,furnizor,suma,data_document,numar_document,created_at')
    .eq('firma_id', firmaId)
    .eq('modul', 'inbox_facturi')
    .is('tranzactie_id', null)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const target = Math.abs(suma)
  const candidates = (docs || [])
    .filter(d => d.suma != null)
    .map(d => ({ ...d, diferentaSuma: Math.abs(Number(d.suma) - target) }))
    .sort((a, b) => a.diferentaSuma - b.diferentaSuma)
    .slice(0, 8)

  return NextResponse.json({ candidates })
}
