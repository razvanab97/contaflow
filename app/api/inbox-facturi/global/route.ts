import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Starea cozii de facturi din folderul local: cate asteapta sincronizarea, ce cere atentie
// (firma nedetectata / eroare - toate, nu doar ultimele) si ultimele procesate.
export async function GET() {
  const sb = getServiceSupabase()
  const cols = 'id,fisier_nume,status,error_message,firma_id,document_id,created_at,synced_at,firme:firma_id(nume,slug)'
  const [pending, atentie, recente] = await Promise.all([
    sb.from('inbox_watch_files').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('inbox_watch_files').select(cols).in('status', ['nedetectat', 'eroare']).order('created_at', { ascending: false }).limit(100),
    sb.from('inbox_watch_files').select(cols).in('status', ['imported', 'duplicat']).not('synced_at', 'is', null).order('synced_at', { ascending: false }).limit(15),
  ])
  const error = pending.error || atentie.error || recente.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    pendingCount: pending.count || 0,
    files: atentie.data || [],
    recente: recente.data || [],
  })
}
