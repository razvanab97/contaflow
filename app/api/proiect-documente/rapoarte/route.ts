import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { LUNI_FULL } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'

const TIP_SEMNAT = 'raport_semnat'
const TIPURI_SEMNAT = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const cheie = (nume: string) => {
  const m = nume.match(/Raport implementare (\S+) (\d{4})/)
  const luna = m ? LUNI_FULL.findIndex(l => l.toLowerCase() === m[1].toLowerCase()) : -1
  return m && luna > 0 ? `${m[2]}-${String(luna).padStart(2, '0')}` : ''
}
const lunaValida = (l: unknown) => typeof l === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(l) ? l : ''
const prefixSemnat = (firmaId: string) => `${firmaId}/proiect-documente/rapoarte-semnate/`
const numeSigur = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120)

// Rapoartele lunare de implementare salvate ale proiectului, cate unul pe luna raportata („Raport implementare <Luna> <An>”),
// cele mai recente primele. Se scriu din lib/proiectRaport.ts (salveazaRaportLuna). Fiecare luna poate avea si varianta
// SEMNATA, incarcata de utilizator (tip_document 'raport_semnat', „Raport implementare <Luna> <An> - semnat.pdf”): e un rand
// separat, deci regenerarea sau stergerea raportului generat n-o atinge. O luna cu doar varianta semnata apare cu id null.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data, error } = await sb.from('documente').select('id,fisier_nume,fisier_marime,created_at,tip_document')
    .eq('firma_id', firmaId).eq('modul', 'obligatii').in('tip_document', ['raport', TIP_SEMNAT]).like('fisier_nume', 'Raport implementare %')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const semnate = new Map<string, { id: string; fisier_nume: string; fisier_marime: number | null; created_at: string }>()
  for (const d of (data || []).filter(d => d.tip_document === TIP_SEMNAT).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const l = cheie(d.fisier_nume); if (l) semnate.set(l, { id: d.id, fisier_nume: d.fisier_nume, fisier_marime: d.fisier_marime, created_at: d.created_at })
  }
  const generate = (data || []).filter(d => d.tip_document !== TIP_SEMNAT).map(({ tip_document: _t, ...d }) => ({ ...d, luna: cheie(d.fisier_nume), semnat: semnate.get(cheie(d.fisier_nume)) || null }))
  const cuGenerat = new Set(generate.map(g => g.luna))
  const doarSemnate = [...semnate.entries()].filter(([l]) => !cuGenerat.has(l)).map(([luna, s]) => {
    const [an, m] = luna.split('-').map(Number)
    return { id: null, fisier_nume: `Raport implementare ${LUNI_FULL[m]} ${an}`, fisier_marime: null, created_at: s.created_at, luna, semnat: s }
  })
  const rapoarte = [...generate, ...doarSemnate].sort((a, b) => b.luna.localeCompare(a.luna) || b.created_at.localeCompare(a.created_at))
  return NextResponse.json({ rapoarte })
}

// Pasul 1 al incarcarii variantei semnate: URL semnat, ca fisierul (scanare/PDF, poate fi mare) sa mearga direct din browser in storage.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { firmaId?: string; luna?: string; nume?: string; tip?: string; marime?: number }
  const luna = lunaValida(b.luna)
  if (!b.firmaId || !luna || !b.nume) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!TIPURI_SEMNAT.has(String(b.tip || ''))) return NextResponse.json({ error: 'Încarcă raportul semnat ca PDF sau poză.' }, { status: 400 })
  if ((b.marime || 0) > 50 * 1024 * 1024) return NextResponse.json({ error: 'Fișierul e mai mare de 50 MB.' }, { status: 400 })
  const path = `${prefixSemnat(b.firmaId)}${luna}_${Date.now()}_${numeSigur(b.nume)}`
  const { data, error } = await getServiceSupabase().storage.from('documente').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Încărcarea nu a putut fi pregătită.' }, { status: 500 })
  return NextResponse.json({ path, url: data.signedUrl })
}

// Pasul 2: inregistreaza fisierul incarcat ca varianta semnata a lunii; o varianta semnata mai veche a aceleiasi luni e inlocuita.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { firmaId?: string; luna?: string; path?: string; tip?: string; marime?: number; nume?: string }
  const luna = lunaValida(b.luna), firmaId = b.firmaId || ''
  if (!firmaId || !luna || !b.path) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!b.path.startsWith(`${prefixSemnat(firmaId)}${luna}_`)) return NextResponse.json({ error: 'Cale invalidă' }, { status: 400 })
  const sb = getServiceSupabase()
  const [an, m] = luna.split('-').map(Number)
  const baza = `Raport implementare ${LUNI_FULL[m]} ${an}`
  const ext = (String(b.nume || '').match(/\.([a-z0-9]{2,5})$/i)?.[1] || (b.tip === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase()
  const nume = `${baza} - semnat.${ext}`
  // luna contabila in care se depune raportul = luna urmatoare celei raportate (la fel ca salveazaRaportLuna)
  const lucru = new Date(Date.UTC(an, m, 1)).toISOString().slice(0, 10)
  const [{ data: lunaRow }, { data: vechi }] = await Promise.all([
    sb.from('luni_contabile').select('id').eq('firma_id', firmaId).eq('luna', lucru).maybeSingle(),
    sb.from('documente').select('id,fisier_path').eq('firma_id', firmaId).eq('modul', 'obligatii').eq('tip_document', TIP_SEMNAT).like('fisier_nume', `${baza} - semnat%`),
  ])
  const { data: doc, error } = await sb.from('documente').insert({
    firma_id: firmaId, luna_id: lunaRow?.id ?? null, modul: 'obligatii', tip_document: TIP_SEMNAT, in_zip: true,
    fisier_path: b.path, fisier_nume: nume, fisier_tip: b.tip || null, fisier_marime: b.marime ?? null,
  }).select('id,fisier_nume,fisier_marime,created_at').single()
  if (error || !doc) { await sb.storage.from('documente').remove([b.path]); return NextResponse.json({ error: error?.message || 'Salvarea a eșuat' }, { status: 500 }) }
  for (const v of vechi || []) {
    await sb.from('documente').delete().eq('id', v.id)
    if (v.fisier_path && v.fisier_path !== b.path) await sb.storage.from('documente').remove([v.fisier_path])
  }
  return NextResponse.json({ semnat: doc })
}

// Sterge un raport salvat al unei luni sau varianta lui semnata (doar randurile „Raport implementare ...” ale proiectului).
// Documentul curent din editor nu e afectat; daca luna lui e stearsa, se salveaza din nou la urmatoarea generare.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('documente').select('id,fisier_path,fisier_nume').eq('id', id).eq('modul', 'obligatii').in('tip_document', ['raport', TIP_SEMNAT]).like('fisier_nume', 'Raport implementare %').maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Raportul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (doc.fisier_path) await sb.storage.from('documente').remove([doc.fisier_path])
  return NextResponse.json({ ok: true })
}
