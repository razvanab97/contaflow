import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { analizeazaPunct, cautaDovezi, incarcaDateFirma, type Punct } from '@/lib/mail-contabil'
import { contextFirma } from '../context'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PARALEL = 6
const BUGET_MS = 35_000

// Verifica situatiile unui mail in platforma: datele firmei se incarca o singura data, dovezile se
// cauta in cod, apoi AI-ul analizeaza cate 6 situatii in paralel. Lucreaza in limita a ~35s (sub
// limita Vercel de 60s) si intoarce `ramase` - clientul reapeleaza pana ajunge la 0.
// `punctIds` = re-verificarea doar a acelor situatii; altfel se iau cele inca neverificate.
export async function POST(req: NextRequest) {
  const start = Date.now()
  const body = await req.json().catch(() => ({}))
  const { id, punctIds } = body as { id?: string; punctIds?: string[] }
  if (!id) return NextResponse.json({ error: 'id lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: m } = await sb.from('mail_contabil').select('*').eq('id', id).single()
  if (!m) return NextResponse.json({ error: 'Mailul nu există' }, { status: 404 })
  const puncte = m.puncte as Punct[]
  const deFacut = puncte.filter(p => punctIds?.length ? punctIds.includes(p.id) : !p.analizatAt)
  if (!deFacut.length) return NextResponse.json({ puncte, ramase: 0 })

  const ctx = await contextFirma(sb, m.firma_id, m.luna_id)
  const date = await incarcaDateFirma(sb, m.firma_id, ctx.slug)
  const rezultate = new Map<string, Partial<Punct>>()
  const coada = [...deFacut]
  let eroare: string | null = null

  async function worker() {
    while (coada.length && Date.now() - start < BUGET_MS) {
      const p = coada.shift()!
      const dovezi = cautaDovezi(p, date)
      try {
        const a = await analizeazaPunct(p, dovezi, ctx, m.rezumat)
        rezultate.set(p.id, { ...a, dovezi, analizatAt: new Date().toISOString() })
      } catch (e) {
        eroare = e instanceof Error ? e.message : 'Analiza a eșuat'
        rezultate.set(p.id, { dovezi, status: 'neclar', constatare: `Analiza AI a eșuat: ${eroare}`, analizatAt: new Date().toISOString() })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALEL, deFacut.length) }, worker))

  const actualizate = puncte.map(p => rezultate.has(p.id) ? { ...p, ...rezultate.get(p.id) } : p)
  const { error } = await sb.from('mail_contabil').update({ puncte: actualizate, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ramase = punctIds?.length ? deFacut.length - rezultate.size : actualizate.filter(p => !p.analizatAt).length
  return NextResponse.json({ puncte: actualizate, ramase, eroare })
}
