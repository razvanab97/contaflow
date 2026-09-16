import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

type Sursa = 'local' | 'gmail' | 'oblio' | 'altele'

// Sursa e scrisa ca text in furnizor ("... | Sursa: Gmail 1 (x@gmail.com)" / "Sursa: Folder local
// (Personal Computer)" / "Sursa: Fișiere locale") - nu exista coloana dedicata, deci o deducem de
// aici ca sa putem filtra pe categorii in UI.
function detecteazaSursa(furnizor: string | null): Sursa {
  const linie = (furnizor || '').split('|').find(p => p.trim().toLowerCase().startsWith('sursa:')) || ''
  const v = linie.toLowerCase()
  if (v.includes('gmail') || v.includes('icloud')) return 'gmail'
  if (v.includes('folder local') || v.includes('fișiere locale') || v.includes('fisiere locale')) return 'local'
  if (v.includes('oblio')) return 'oblio'
  return 'altele'
}

function furnizorCurat(furnizor: string | null): string {
  return (furnizor || '').split('|')[0]?.trim() || ''
}

// Cautare manuala in Inbox Facturi (local + Gmail + Oblio) - mai permisiva decat sugestia automata
// din tranzactii/list (care cere suma exact identica), pentru cazul in care aceasta nu a gasit
// nimic si vrem sa verificam manual printre toate documentele firmei inca nelegate de nicio
// tranzactie: cautare dupa text (furnizor/nr. document), filtrare pe sursa, sortare dupa apropierea
// de suma tranzactiei cand e data.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const sumaParam = req.nextUrl.searchParams.get('suma')
  const suma = sumaParam !== null ? Number(sumaParam) : null
  const valutaTx = (req.nextUrl.searchParams.get('valutaTx') || 'RON').toUpperCase()
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const sursaFiltru = req.nextUrl.searchParams.get('sursa') as Sursa | 'toate' | null
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  let query = sb.from('documente')
    .select('id,fisier_nume,furnizor,suma,valuta,data_document,numar_document,created_at')
    .eq('firma_id', firmaId)
    .eq('modul', 'inbox_facturi')
    .is('tranzactie_id', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (q.length >= 2) query = query.or(`furnizor.ilike.%${q}%,numar_document.ilike.%${q}%,fisier_nume.ilike.%${q}%`)

  const { data: docs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const target = suma !== null && Number.isFinite(suma) ? Math.abs(suma) : null
  let candidates = (docs || []).map(d => {
    const valuta = (d.valuta || 'RON').toUpperCase()
    // Compararea directa a sumelor are sens doar daca sunt in aceeasi moneda - altfel o factura
    // de 10 USD ar parea gresit "departe" de o tranzactie de 46 RON, cand de fapt e conversia
    // exacta a aceleiasi sume, doar ca banca a convertit-o la plata cu cardul.
    const monedaDiferita = target !== null && valuta !== valutaTx
    return {
      ...d,
      valuta,
      furnizor: furnizorCurat(d.furnizor),
      sursa: detecteazaSursa(d.furnizor),
      monedaDiferita,
      diferentaSuma: target !== null && d.suma != null && !monedaDiferita ? Math.abs(Number(d.suma) - target) : null,
    }
  })

  const counts: Record<Sursa, number> = { local: 0, gmail: 0, oblio: 0, altele: 0 }
  for (const c of candidates) counts[c.sursa]++

  if (sursaFiltru && sursaFiltru !== 'toate') candidates = candidates.filter(c => c.sursa === sursaFiltru)
  candidates.sort((a, b) => {
    if (a.diferentaSuma !== null && b.diferentaSuma !== null) return a.diferentaSuma - b.diferentaSuma
    if (a.diferentaSuma !== null) return -1
    if (b.diferentaSuma !== null) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return NextResponse.json({ candidates: candidates.slice(0, 100), counts, total: docs?.length || 0 })
}
