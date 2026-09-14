import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type OblioTokenResponse = {
  access_token?: string
  expires_in?: string | number
  token_type?: string
  status?: number
  statusMessage?: string
  message?: string
}

type OblioCompaniesResponse = {
  status?: number
  statusMessage?: string
  data?: { cif?: string; company?: string; userTypeAccess?: string }[]
  message?: string
}

async function oblioAccessToken(email: string, clientSecret: string) {
  const res = await fetch('https://www.oblio.eu/api/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: email,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json().catch(() => ({})) as OblioTokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(data.statusMessage || data.message || 'Tokenul Oblio nu a putut fi generat')
  }
  return data
}

async function oblioCompanies(accessToken: string) {
  const res = await fetch('https://www.oblio.eu/api/nomenclature/companies', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({})) as OblioCompaniesResponse
  if (!res.ok || data.status !== 200) {
    throw new Error(data.statusMessage || data.message || 'Nu am putut citi firmele din Oblio')
  }
  return data.data || []
}

export async function POST(req: NextRequest) {
  const { firmaId, email, clientSecret } = await req.json().catch(() => ({}))
  const cleanFirmaId = String(firmaId || '')
  const cleanEmail = String(email || '').trim()
  const cleanSecret = String(clientSecret || '').trim()
  if (!cleanFirmaId || !cleanEmail || !cleanSecret) {
    return NextResponse.json({ error: 'firmaId, email și token Oblio sunt obligatorii' }, { status: 400 })
  }

  const sb = getServiceSupabase()
  try {
    const token = await oblioAccessToken(cleanEmail, cleanSecret)
    const companies = await oblioCompanies(token.access_token!)
    const expiresIn = Number(token.expires_in || 3600)
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    const { data: existing, error: findError } = await sb
      .from('inbox_surse_email')
      .select('id')
      .eq('firma_id', cleanFirmaId)
      .eq('provider', 'oblio')
      .eq('eticheta', 'Oblio')
      .limit(1)
    if (findError) throw new Error(findError.message)

    const values = {
      firma_id: cleanFirmaId,
      provider: 'oblio',
      eticheta: 'Oblio',
      email: cleanEmail,
      status: 'activ',
      client_secret: cleanSecret,
      access_token: token.access_token,
      token_expires_at: expiresAt,
      provider_user_id: cleanEmail,
      provider_companies: companies,
      connection_error: null,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const query = existing?.[0]?.id
      ? sb.from('inbox_surse_email').update(values).eq('id', existing[0].id)
      : sb.from('inbox_surse_email').insert(values)
    const { data, error } = await query.select('id,provider,eticheta,email,status,last_sync_at,updated_at').single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ source: data, companies })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Conectarea Oblio a eșuat'
    await sb.from('inbox_surse_email').update({
      status: 'eroare',
      connection_error: message,
      updated_at: new Date().toISOString(),
    }).eq('firma_id', cleanFirmaId).eq('provider', 'oblio').eq('eticheta', 'Oblio')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
