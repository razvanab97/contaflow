import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { MODEL_PROIECT, contextLive, promptFix } from '@/lib/proiect-intreaba'
import type { StarePlan } from '@/lib/proiect-plan'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // raspuns in timp real, cu gandire - poate depasi 60s la intrebari complexe
const lipsaTabel = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205'].includes(e.code || '')

// Istoricul intrebarilor (cele mai recente 40, in ordine cronologica).
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('proiect_intrebari').select('id,intrebare,raspuns,created_at').eq('firma_id', firmaId).order('created_at', { ascending: false }).limit(40)
  if (error) return lipsaTabel(error) ? NextResponse.json({ intrebari: [], lipsaMigrare: true }) : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ intrebari: (data || []).reverse() })
}

export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsă' }, { status: 400 })
  const { error } = await getServiceSupabase().from('proiect_intrebari').delete().eq('firma_id', firmaId)
  if (error && !lipsaTabel(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Intrebare noua -> raspuns transmis in timp real (text/plain, bucata cu bucata), apoi salvat.
export async function POST(req: NextRequest) {
  const { firmaId, intrebare, istoric } = await req.json().catch(() => ({})) as { firmaId?: string; intrebare?: string; istoric?: { intrebare: string; raspuns: string }[] }
  const q = String(intrebare || '').trim().slice(0, 4000)
  if (!firmaId || !q) return NextResponse.json({ error: 'Scrie o întrebare.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY lipsește.' }, { status: 500 })

  const sb = getServiceSupabase()
  const { data: st, error: eSt } = await sb.from('proiect_plan_stari').select('cheie,status,nota,data_realizare').eq('firma_id', firmaId)
  const live = await contextLive(sb, firmaId, eSt ? [] : (st || []) as StarePlan[])

  // Ultimele schimburi, ca sa se poata pune intrebari de continuare ("si la cofinantare?").
  const messages: Anthropic.MessageParam[] = []
  for (const h of (istoric || []).slice(-6)) {
    if (!h?.intrebare || !h?.raspuns) continue
    messages.push({ role: 'user', content: String(h.intrebare).slice(0, 4000) }, { role: 'assistant', content: String(h.raspuns).slice(0, 8000) })
  }
  messages.push({ role: 'user', content: q })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let raspuns = ''
      try {
        const stream = client.messages.stream({
          model: MODEL_PROIECT,
          // Modelul gandeste implicit inainte sa raspunda: plafon larg + efort mediu, ca gandirea sa nu
          // consume tot bugetul de tokeni (altfel raspunsul iese gol) si sa ramana sub limita de 60s.
          max_tokens: 8000,
          output_config: { effort: (process.env.PROIECT_AI_EFFORT as 'low' | 'medium' | 'high') || 'medium' },
          system: [
            { type: 'text', text: promptFix(), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: live },
          ],
          messages,
        })
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            raspuns += ev.delta.text
            controller.enqueue(enc.encode(ev.delta.text))
          }
        }
        if (!raspuns.trim()) {
          const msg = 'Nu am reușit să formulez un răspuns de data asta (analiza a depășit limita). Reformulează întrebarea mai pe scurt sau împarte-o în două.'
          raspuns = msg
          controller.enqueue(enc.encode(msg))
        }
      } catch (e) {
        const msg = `\n\n⚠️ Eroare AI: ${e instanceof Error ? e.message : String(e)}`
        raspuns += msg
        controller.enqueue(enc.encode(msg))
      }
      if (raspuns.trim()) {
        const { error } = await sb.from('proiect_intrebari').insert({ firma_id: firmaId, intrebare: q, raspuns })
        if (error && !lipsaTabel(error)) console.error('proiect_intrebari insert', error.message)
      }
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
}
