import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { ensureLocalUploadSource } from '@/lib/inbox-facturi'

const PROVIDERS = new Set(['gmail', 'icloud_imap', 'oblio', 'local_upload'])
const STATUSES = new Set(['neconectat', 'activ', 'eroare', 'pauzat'])

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  // Sursa "Fișiere locale" nu are credențiale reale, așa că e creată automat
  // la prima listare, ca să apară în UI fără un pas separat de "conectare".
  await ensureLocalUploadSource(sb, firmaId)
  const { data, error } = await sb
    .from('inbox_surse_email')
    .select('id,provider,eticheta,email,status,last_sync_at,updated_at')
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data || [] })
}

export async function POST(req: NextRequest) {
  const { firmaId, provider, eticheta, email, status = 'activ' } = await req.json()
  const cleanFirmaId = String(firmaId || '')
  const cleanProvider = String(provider || '')
  const cleanEticheta = String(eticheta || '').trim()
  const cleanEmail = String(email || '').trim()
  const cleanStatus = String(status || 'activ')

  if (!cleanFirmaId || !PROVIDERS.has(cleanProvider) || !cleanEticheta || !STATUSES.has(cleanStatus)) {
    return NextResponse.json({ error: 'Date sursă invalide' }, { status: 400 })
  }

  const sb = getServiceSupabase()
  const { data: existing, error: findError } = await sb
    .from('inbox_surse_email')
    .select('id')
    .eq('firma_id', cleanFirmaId)
    .eq('provider', cleanProvider)
    .eq('eticheta', cleanEticheta)
    .limit(1)
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })

  const values = {
    firma_id: cleanFirmaId,
    provider: cleanProvider,
    eticheta: cleanEticheta,
    email: cleanEmail || null,
    status: cleanStatus,
    updated_at: new Date().toISOString(),
  }
  const query = existing?.[0]?.id
    ? sb.from('inbox_surse_email').update(values).eq('id', existing[0].id)
    : sb.from('inbox_surse_email').insert(values)
  const { data, error } = await query.select('id,provider,eticheta,email,status,last_sync_at,updated_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
