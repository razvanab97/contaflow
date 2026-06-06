import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
export async function GET(req: NextRequest) {
  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ docs: [] })
  const sb = getServiceSupabase()
  const { data } = await sb.from('documente').select('id,fisier_nume,tip_document').eq('checklist_item_id', itemId).order('created_at')
  return NextResponse.json({ docs: data || [] })
}
