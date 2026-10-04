import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { extragePuncte, type ImagineMail, type MailContabil, type Punct } from '@/lib/mail-contabil'
import { contextFirma } from './context'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TIPURI = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
const mesajEroare = (e: { code?: string; message: string }) => ['42P01', 'PGRST205'].includes(e.code || '') ? 'Tabelul mail_contabil nu există încă - rulează migrarea SQL.' : e.message

async function cuImagini(sb: ReturnType<typeof getServiceSupabase>, m: MailContabil) {
  const urls = await Promise.all((m.imagini || []).map(async p => (await sb.storage.from('documente').createSignedUrl(p, 3600)).data?.signedUrl || null))
  return { ...m, imaginiUrl: urls.filter(Boolean) }
}

// Lista mailurilor firmei (toate lunile), cele mai noi primele.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data, error } = await sb.from('mail_contabil').select('*').eq('firma_id', firmaId).order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: mesajEroare(error) }, { status: 500 })
  return NextResponse.json({ mailuri: await Promise.all((data || []).map(m => cuImagini(sb, m as MailContabil))) })
}

// Mail nou: text lipit si/sau capturi de ecran (data URL) -> AI-ul il imparte in situatii.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { firmaId, lunaId, text, imagini } = body as { firmaId?: string; lunaId?: string | null; text?: string; imagini?: string[] }
  const txt = String(text || '').trim()
  const img: ImagineMail[] = []
  for (const u of (imagini || []).slice(0, 6)) {
    const m = String(u).match(/^data:(image\/[a-z]+);base64,(.+)$/)
    if (m && (TIPURI as readonly string[]).includes(m[1])) img.push({ mediaType: m[1] as ImagineMail['mediaType'], data: m[2] })
  }
  if (!firmaId || (!txt && !img.length)) return NextResponse.json({ error: 'Lipește textul mailului sau adaugă o captură de ecran.' }, { status: 400 })

  const sb = getServiceSupabase()
  const ctx = await contextFirma(sb, firmaId, lunaId || null)
  let extras
  try { extras = await extragePuncte(txt, img, ctx) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Citirea mailului a eșuat' }, { status: 502 }) }

  const id = crypto.randomUUID()
  const paths: string[] = []
  await Promise.all(img.map(async (i, k) => {
    const path = `${firmaId}/mail-contabil/${id}-${k + 1}.${i.mediaType.split('/')[1].replace('jpeg', 'jpg')}`
    const { error } = await sb.storage.from('documente').upload(path, Buffer.from(i.data, 'base64'), { contentType: i.mediaType, upsert: true })
    if (!error) paths[k] = path
  }))

  const { data, error } = await sb.from('mail_contabil').insert({
    id, firma_id: firmaId, luna_id: lunaId || null, subiect: extras.subiect, data_mail: extras.dataMail,
    text_mail: txt || null, imagini: paths.filter(Boolean), rezumat: extras.rezumat, puncte: extras.puncte,
  }).select('*').single()
  if (error) return NextResponse.json({ error: mesajEroare(error) }, { status: 500 })
  return NextResponse.json({ mail: await cuImagini(sb, data as MailContabil) })
}

// Marcare manuala a unei situatii (rezolvat + nota) sau redenumirea mailului.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { id, punctId, rezolvatManual, nota } = body as { id?: string; punctId?: string; rezolvatManual?: boolean; nota?: string | null }
  if (!id || !punctId) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: m } = await sb.from('mail_contabil').select('puncte').eq('id', id).single()
  if (!m) return NextResponse.json({ error: 'Mailul nu există' }, { status: 404 })
  const puncte = (m.puncte as Punct[]).map(p => p.id !== punctId ? p : {
    ...p,
    ...(typeof rezolvatManual === 'boolean' ? { rezolvatManual } : {}),
    ...(nota !== undefined ? { nota: String(nota || '').trim().slice(0, 1000) || null } : {}),
  })
  const { error } = await sb.from('mail_contabil').update({ puncte, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, puncte })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: m } = await sb.from('mail_contabil').select('imagini').eq('id', id).single()
  if (m?.imagini?.length) await sb.storage.from('documente').remove(m.imagini)
  const { error } = await sb.from('mail_contabil').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
