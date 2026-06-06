import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'

export async function GET(req: NextRequest) {
  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ docs: [] })
  const r = await fetch(`${SB}/documente?checklist_item_id=eq.${itemId}&select=id,fisier_nume,tip_document&order=created_at`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  })
  const docs = r.ok ? await r.json() : []
  return NextResponse.json({ docs })
}
