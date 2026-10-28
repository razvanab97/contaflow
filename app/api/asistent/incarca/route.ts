import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { POST as inboxPOST } from '@/app/api/inbox-facturi/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Facturile atasate in fereastra asistentului intra in Inbox Facturi prin fluxul existent (aceeasi
// extragere AI, aceleasi verificari) - aici doar aflam firma si luna dupa slug / luna de lucru.
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const slug = String(fd.get('firma') || ''), luna = String(fd.get('luna') || '')
  if (!slug || !/^\d{4}-\d{2}$/.test(luna)) return NextResponse.json({ error: 'Alege firma și luna în care intră facturile.' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: firma } = await sb.from('firme').select('id,nume').eq('slug', slug).maybeSingle()
  if (!firma) return NextResponse.json({ error: 'Firmă necunoscută.' }, { status: 404 })
  const { data: luni } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', firma.id)
  const lunaId = (luni || []).find(l => String(l.luna).startsWith(luna))?.id
  if (!lunaId) return NextResponse.json({ error: `Luna ${luna} nu e deschisă pentru ${firma.nume}. Deschide-o întâi din Rezumatul lunii.` }, { status: 409 })
  const intern = new FormData()
  intern.set('firmaId', firma.id); intern.set('lunaId', lunaId); intern.set('luna', luna)
  for (const f of fd.getAll('file')) if (f instanceof File) intern.append('file', f)
  const res = await inboxPOST(new NextRequest('http://intern/api/inbox-facturi', { method: 'POST', body: intern }))
  const data = await res.json().catch(() => ({}))
  return NextResponse.json({ ...data, firma: firma.nume, luna }, { status: res.status })
}
