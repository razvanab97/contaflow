import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

// Corectia manuala la "Achizitii produse": true = marcheaza plata ca achizitie de produse, false =
// o elimina din achizitii, null = revine la regula automata. Se salveaza pe tranzactie si are
// prioritate fata de clasificarea automata (vezi claseazaAchizitie). Doar plati (debit).
export async function POST(req: NextRequest) {
  const { id, valoare } = await req.json().catch(() => ({}))
  if (!id || (valoare !== true && valoare !== false && valoare !== null))
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: tx, error: txError } = await sb.from('tranzactii').select('id,tip').eq('id', id).single()
  if (txError || !tx) return NextResponse.json({ error: 'Tranzacția nu a fost găsită' }, { status: 404 })
  if (tx.tip !== 'debit') return NextResponse.json({ error: 'Doar plățile pot fi achiziții de produse' }, { status: 400 })

  const { error } = await sb.from('tranzactii').update({ achizitie_produse: valoare }).eq('id', id)
  if (error) {
    if (/achizitie_produse/.test(error.message))
      return NextResponse.json({ error: 'Lipsește coloana din baza de date — rulează supabase_tranzactii_achizitie_produse.sql în Supabase.', migrare: true }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
