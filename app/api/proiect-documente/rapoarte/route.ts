import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { LUNI_FULL } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

// Rapoartele lunare de implementare salvate ale proiectului, cate unul pe luna raportata („Raport implementare <Luna> <An>”),
// cele mai recente primele. Se scriu din lib/proiectRaport.ts (salveazaRaportLuna).
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data, error } = await sb.from('documente').select('id,fisier_nume,fisier_marime,created_at')
    .eq('firma_id', firmaId).eq('modul', 'obligatii').eq('tip_document', 'raport').like('fisier_nume', 'Raport implementare %')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const cheie = (nume: string) => {
    const m = nume.match(/Raport implementare (\S+) (\d{4})/)
    const luna = m ? LUNI_FULL.findIndex(l => l.toLowerCase() === m[1].toLowerCase()) : -1
    return m && luna > 0 ? `${m[2]}-${String(luna).padStart(2, '0')}` : ''
  }
  const rapoarte = (data || []).map(d => ({ ...d, luna: cheie(d.fisier_nume) })).sort((a, b) => b.luna.localeCompare(a.luna) || b.created_at.localeCompare(a.created_at))
  return NextResponse.json({ rapoarte })
}

// Sterge un raport salvat al unei luni (doar randurile „Raport implementare ...” ale proiectului). Documentul curent din editor
// nu e afectat; daca luna lui e stearsa, se salveaza din nou la urmatoarea generare.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('documente').select('id,fisier_path,fisier_nume').eq('id', id).eq('modul', 'obligatii').eq('tip_document', 'raport').like('fisier_nume', 'Raport implementare %').maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Raportul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (doc.fisier_path) await sb.storage.from('documente').remove([doc.fisier_path])
  return NextResponse.json({ ok: true })
}
