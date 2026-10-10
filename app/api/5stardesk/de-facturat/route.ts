import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getDeFacturat } from '@/lib/stardeskVerify'

export const dynamic = 'force-dynamic'

// Rezervarile fara factura client 5StarDesk (toate lunile), cu check-out trecut si pretul complet.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  return NextResponse.json({ rezervari: await getDeFacturat(getServiceSupabase(), firmaId) })
}
