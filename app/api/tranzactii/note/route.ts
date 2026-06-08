import { NextRequest, NextResponse } from 'next/server'

const URL = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'

export async function POST(req: NextRequest) {
  const { id, note } = await req.json()
  if (!id || (note !== null && note !== 'na'))
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const res = await fetch(`${URL}/tranzactii?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ note })
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
  return NextResponse.json({ ok: true })
}
