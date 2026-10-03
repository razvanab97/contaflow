import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sincronizare zilnica automata a Inbox Facturi (Vercel Cron, vezi vercel.json): porneste cate un job
// Gmail pentru fiecare cont conectat, pe luna de lucru curenta a firmei - facturile intra continuu,
// nu doar cand se apasa "Sincronizeaza". Joburile isi continua singure partile ramase (vezi gmail/sync).
// Acces: Vercel trimite "Authorization: Bearer <CRON_SECRET>" cand variabila CRON_SECRET e setata.
function autorizat(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  return (req.headers.get('user-agent') || '').toLowerCase().includes('vercel-cron')
}

export async function GET(req: NextRequest) {
  if (!autorizat(req)) return NextResponse.json({ error: 'Neautorizat' }, { status: 401 })
  const sb = getServiceSupabase()
  const luna = currentWorkMonthKey(new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bucharest' })))

  // Curata joburile agatate inainte de a porni altele noi.
  await sb.from('inbox_sync_jobs').update({ status: 'error', error_message: 'Job blocat fără progres peste 3 minute', completed_at: new Date().toISOString() })
    .in('status', ['queued', 'running']).lt('updated_at', new Date(Date.now() - 3 * 60_000).toISOString())

  const { data: surse, error } = await sb.from('inbox_surse_email')
    .select('id,firma_id,eticheta,refresh_token').eq('provider', 'gmail').not('refresh_token', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rezultate: { sursa: string; status: string }[] = []
  for (const s of surse || []) {
    const { data: luni } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', s.firma_id)
    const l = (luni || []).find(x => String(x.luna).startsWith(luna))
    if (!l) { rezultate.push({ sursa: s.eticheta, status: `luna ${luna} neinițializată` }); continue }
    const r = await fetch(new URL('/api/inbox-facturi/gmail/sync', req.nextUrl.origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: s.id, firmaId: s.firma_id, lunaId: l.id, luna }),
    }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    rezultate.push({ sursa: s.eticheta, status: !r ? 'eroare conexiune' : d.alreadyRunning ? 'deja în curs' : r.ok ? 'pornit' : (d.error || `HTTP ${r.status}`) })
  }
  return NextResponse.json({ luna, rezultate })
}
