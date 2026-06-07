import { NextRequest, NextResponse } from 'next/server'
const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
export async function GET(req: NextRequest) {
  const lunaId = new URL(req.url).searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json([])
  const r = await fetch(`${SB}/extrase?luna_id=eq.${lunaId}&select=id,valuta,nr_tranzactii,nr_documentate,sold_final&order=valuta`, { headers: H })
  return NextResponse.json(r.ok ? await r.json() : [])
}
