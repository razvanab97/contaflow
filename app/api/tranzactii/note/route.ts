import { NextRequest, NextResponse } from 'next/server'
import { MOTIVE_IGNORARE } from '@/lib/tranzactii-reguli'

const URL = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const MOTIVE = new Set(MOTIVE_IGNORARE.map(m => m.key))

async function patch(id: string, body: Record<string, unknown>) {
  return fetch(`${URL}/tranzactii?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
}

// Ignora / reactiveaza o tranzactie. La ignorare se poate trimite si motivul (motiv_ignorare); la
// reactivare motivul si marcajul "automat" se sterg. Daca migrarea pentru motiv nu a fost rulata,
// se salveaza doar starea de ignorare, ca inainte.
export async function POST(req: NextRequest) {
  const { id, note, motiv } = await req.json()
  if (!id || (note !== null && note !== 'na'))
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  if (motiv != null && !MOTIVE.has(motiv))
    return NextResponse.json({ error: 'Motiv invalid' }, { status: 400 })
  const extra = note === null ? { motiv_ignorare: null, ignorat_auto: false } : { motiv_ignorare: motiv ?? null, ignorat_auto: false }
  let res = await patch(id, { note, ...extra })
  let motivSalvat = true
  if (!res.ok) {
    motivSalvat = false
    res = await patch(id, { note })
  }
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
  return NextResponse.json({ ok: true, motivSalvat })
}
