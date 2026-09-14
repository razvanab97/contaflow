import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
]

function appOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
}

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appOrigin(req)}/api/inbox-facturi/gmail/callback`
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID lipsește din env' }, { status: 500 })

  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const eticheta = req.nextUrl.searchParams.get('eticheta') || 'Gmail 1'
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const state = crypto.randomBytes(24).toString('base64url')
  const cookieStore = await cookies()
  cookieStore.set(`gmail_oauth_${state}`, JSON.stringify({
    firmaId,
    eticheta,
    returnTo: safeReturnTo(req.nextUrl.searchParams.get('returnTo')),
  }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: appOrigin(req).startsWith('https://'),
    path: '/',
    maxAge: 10 * 60,
  })

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  url.searchParams.set('include_granted_scopes', 'true')

  return NextResponse.redirect(url)
}
