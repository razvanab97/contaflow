import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

export async function GET(req: NextRequest) {
  const lunaId = new URL(req.url).searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json([], { status: 400 })

  // Get extras IDs for this luna
  const eRes = await fetch(`${SB}/extrase?luna_id=eq.${lunaId}&select=id`, { headers: H })
  const extrase = await eRes.json()
  if (!extrase?.length) return NextResponse.json([])

  // Get all tranzactii for these extras
  let all: any[] = []
  for (const e of extrase) {
    const r = await fetch(
      `${SB}/tranzactii?extras_id=eq.${e.id}&select=id,extras_id,data_tranzactie,descriere,descriere_curatata,tip,suma,valuta,categorie,document_id,note,documente(id,tip_document,furnizor,numar_document,fisier_nume)&order=data_tranzactie`,
      { headers: H }
    )
    const txs = await r.json()
    if (Array.isArray(txs)) all = [...all, ...txs]
  }

  return NextResponse.json(all)
}
