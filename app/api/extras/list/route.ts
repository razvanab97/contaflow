import { NextRequest, NextResponse } from 'next/server'
const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
export async function GET(req: NextRequest) {
  const lunaId = new URL(req.url).searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json([])
  const r = await fetch(`${SB}/extrase?luna_id=eq.${lunaId}&select=id,valuta,nr_tranzactii,nr_documentate,sold_final&order=valuta`, { headers: H })
  return NextResponse.json(r.ok ? await r.json() : [])
}
