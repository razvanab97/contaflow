import { NextRequest, NextResponse } from 'next/server'

const URL = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(req: NextRequest) {
  const body = await req.json()
  const id = body.id
  let statusNote = body.statusNote
  if (typeof statusNote === 'string') statusNote = statusNote.trim().slice(0, 300) || null
  if (!id || (statusNote !== null && typeof statusNote !== 'string'))
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const res = await fetch(`${URL}/tranzactii?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ status_note: statusNote })
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
  return NextResponse.json({ ok: true })
}
