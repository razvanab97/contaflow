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
