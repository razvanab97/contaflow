import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type OAuthState = {
  firmaId: string
  eticheta: string
  returnTo: string
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  id_token?: string
  error?: string
  error_description?: string
}

type UserInfoResponse = {
  id?: string
  email?: string
  verified_email?: boolean
  error?: unknown
}

function appOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
}

function safeReturnTo(value: unknown) {
  const path = typeof value === 'string' ? value : '/dashboard'
  if (!path.startsWith('/') || path.startsWith('//')) return '/dashboard'
  return path
}

function redirectWithStatus(req: NextRequest, returnTo: string, status: 'gmail_ok' | 'gmail_error', message?: string) {
  const url = new URL(safeReturnTo(returnTo), appOrigin(req))
  url.searchParams.set(status, message || '1')
  return NextResponse.redirect(url)
}

async function readState(state: string): Promise<OAuthState | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(`gmail_oauth_${state}`)
  if (!cookie?.value) return null
  cookieStore.delete(`gmail_oauth_${state}`)
  try {
    const parsed = JSON.parse(cookie.value) as Partial<OAuthState>
    if (!parsed.firmaId || !parsed.eticheta) return null
    return {
      firmaId: parsed.firmaId,
      eticheta: parsed.eticheta,
      returnTo: safeReturnTo(parsed.returnTo),
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error')
  const fallbackReturn = '/dashboard'
  if (!stateParam) return redirectWithStatus(req, fallbackReturn, 'gmail_error', 'state_lipsa')

  const state = await readState(stateParam)
  if (!state) return redirectWithStatus(req, fallbackReturn, 'gmail_error', 'state_invalid')
  if (oauthError || !code) return redirectWithStatus(req, state.returnTo, 'gmail_error', oauthError || 'code_lipsa')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appOrigin(req)}/api/inbox-facturi/gmail/callback`
  if (!clientId || !clientSecret) return redirectWithStatus(req, state.returnTo, 'gmail_error', 'env_google_lipsa')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const token = await tokenRes.json().catch(() => ({})) as TokenResponse
  if (!tokenRes.ok || !token.access_token) {
    return redirectWithStatus(req, state.returnTo, 'gmail_error', token.error_description || token.error || 'token_invalid')
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const user = await userRes.json().catch(() => ({})) as UserInfoResponse
  const email = typeof user.email === 'string' ? user.email : null
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null

  const sb = getServiceSupabase()
  const { data: existing, error: findError } = await sb
    .from('inbox_surse_email')
    .select('id,refresh_token')
    .eq('firma_id', state.firmaId)
    .eq('provider', 'gmail')
    .eq('eticheta', state.eticheta)
    .limit(1)

  if (findError) return redirectWithStatus(req, state.returnTo, 'gmail_error', findError.message)

  const values = {
    firma_id: state.firmaId,
    provider: 'gmail',
    eticheta: state.eticheta,
    email,
    status: 'activ',
    access_token: token.access_token,
    refresh_token: token.refresh_token || existing?.[0]?.refresh_token || null,
    token_expires_at: expiresAt,
    scopes: token.scope || null,
    provider_user_id: user.id || null,
    connection_error: null,
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const query = existing?.[0]?.id
    ? sb.from('inbox_surse_email').update(values).eq('id', existing[0].id)
    : sb.from('inbox_surse_email').insert(values)
  const { error } = await query
  if (error) return redirectWithStatus(req, state.returnTo, 'gmail_error', error.message)

  return redirectWithStatus(req, state.returnTo, 'gmail_ok')
}
