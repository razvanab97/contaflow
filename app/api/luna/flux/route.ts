import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { collectPaged } from '@/lib/raport-lunar'
import { calculeazaFlux } from '@/lib/flux-lunar'

// Fluxul bancar al lunii din toate conturile (aceleasi extrase ca rezumatul de pana acum: cele
// atasate lunii), pe monede + consolidat in lei la cursul BNR. Doar citiri.
export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({ error: 'lunaId lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: extrase, error } = await sb.from('extrase').select('id').eq('luna_id', lunaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (extrase || []).map(e => e.id)
  if (!ids.length) return NextResponse.json({ flux: null })
  try {
    const COLS = 'data_tranzactie,tip,suma,valuta,descriere,descriere_curatata'
    const incarca = (cols: string) => collectPaged<any>((a, b) => sb.from('tranzactii').select(cols).in('extras_id', ids).order('id').range(a, b) as any)
    // achizitie_produse (corectia manuala la Achizitii produse) vine din supabase_tranzactii_achizitie_produse.sql;
    // pana la migrare, fluxul se calculeaza doar cu regula automata.
    const txs = await incarca(`${COLS},achizitie_produse`).catch(() => incarca(COLS))
    return NextResponse.json({ flux: await calculeazaFlux(txs) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
