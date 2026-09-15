import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('inbox_watch_files')
    .select('id,fisier_nume,status,error_message,firma_id,document_id,created_at,synced_at,firme:firma_id(nume,slug)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const files = data || []
  return NextResponse.json({ files, pendingCount: files.filter(f => f.status === 'pending' || f.status === 'eroare').length })
}
