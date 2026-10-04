import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Sterge o factura DIN PLATFORMA si, daca a venit din folderul local (Personal Computer), si de pe
// calculator: randurile din coada inbox_watch_files ale fisierului sunt marcate "sterge_local", iar
// scripts/watch-facturi-locale.js (care ruleaza pe Mac) muta fisierul in Cos (Trash) la urmatoarea
// verificare si scoate randul din coada. Documentul se sterge prin ruta obisnuita (dezleaga si plata).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('documente').select('id,document_hash').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: 'Documentul nu există' }, { status: 404 })

  // Inainte de stergerea documentului: legatura document_id devine null la stergere (on delete set null).
  const filtru = doc.document_hash ? `document_id.eq.${doc.id},document_hash.eq.${doc.document_hash}` : `document_id.eq.${doc.id}`
  const { data: locale, error: markErr } = await sb.from('inbox_watch_files').update({ sterge_local: true }).or(filtru).select('id,fisier_nume')
  if (markErr) {
    if (markErr.code === '42703' || /sterge_local/.test(markErr.message)) return NextResponse.json({ error: 'Rulează întâi migrarea SQL (coloana sterge_local).' }, { status: 500 })
    return NextResponse.json({ error: markErr.message }, { status: 500 })
  }

  const res = await fetch(`${req.nextUrl.origin}/api/chitante/document?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { cookie: req.headers.get('cookie') || '' } })
  if (!res.ok) {
    // documentul a ramas - anulam si marcajul de stergere locala
    if (locale?.length) await sb.from('inbox_watch_files').update({ sterge_local: false }).in('id', locale.map(l => l.id))
    const d = await res.json().catch(() => ({}))
    return NextResponse.json({ error: d.error || 'Documentul nu a putut fi șters' }, { status: res.status })
  }
  return NextResponse.json({ ok: true, fisiereLocale: (locale || []).map(l => l.fisier_nume) })
}
