import { getServiceSupabase } from '@/lib/supabase/server'

// Token Oblio din conexiunea deja salvata in ContaFlow (Inbox facturi → Oblio, inbox_surse_email).
// Contul Oblio e acelasi pentru toate firmele (AB Homes Invest / ABXHomes / AB Textile) - cautam
// conexiunea care are acces la CIF-ul cerut. Tokenul (valabil ~1h) se refoloseste pana expira.
export async function oblioToken(cif: string): Promise<string> {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('inbox_surse_email')
    .select('id,email,client_secret,access_token,token_expires_at,provider_companies')
    .eq('provider', 'oblio')
  if (error) throw new Error(error.message)
  const curat = (c: string) => c.replace(/^RO/i, '').trim()
  const sursa = (data || []).find(s =>
    (s.provider_companies as { cif?: string }[] | null)?.some(c => curat(c.cif || '') === curat(cif))
  ) || data?.[0]
  if (!sursa?.email || !sursa.client_secret) throw new Error('Oblio nu e conectat în ContaFlow (Inbox facturi → Oblio)')

  const expira = sursa.token_expires_at ? new Date(sursa.token_expires_at).getTime() : 0
  if (sursa.access_token && expira > Date.now() + 60_000) return sursa.access_token

  const res = await fetch('https://www.oblio.eu/api/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: sursa.email, client_secret: sursa.client_secret }),
  })
  const tok = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: string | number; statusMessage?: string }
  if (!res.ok || !tok.access_token) throw new Error(tok.statusMessage || 'Tokenul Oblio nu a putut fi generat')
  await sb.from('inbox_surse_email').update({
    access_token: tok.access_token,
    token_expires_at: new Date(Date.now() + Number(tok.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', sursa.id)
  return tok.access_token
}
