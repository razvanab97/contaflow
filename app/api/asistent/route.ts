import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { TOOLS, CU_CONFIRMARE, executa, descriereActiune, firme, instructiuni } from '@/lib/asistent'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = process.env.ASISTENT_AI_MODEL || 'claude-opus-5'
const EFFORT = (process.env.ASISTENT_AI_EFFORT as 'low' | 'medium' | 'high') || 'medium'
const MAX_PASI = 12

type Mesaje = Anthropic.Beta.BetaMessageParam[]
// Imagini lipite in asistent (capturi de ecran, poze): intra in mesajul utilizatorului ca blocuri „image”, AI-ul le vede.
const TIPURI_IMAGINE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type TipImagine = typeof TIPURI_IMAGINE[number]
const MAX_IMAGINI = 5
const MAX_CARACTERE_IMAGINE = 1_800_000   // per imagine, in base64
const MAX_CARACTERE_TOTAL = 4_000_000     // limita corpului cererii pe functia serverless e ~4,5 MB
type Eveniment =
  | { t: 'text'; d: string }
  | { t: 'unealta'; nume: string }
  | { t: 'confirma'; actiuni: { id: string; nume: string; descriere: string }[]; mesaje: Mesaje }
  | { t: 'gata'; mesaje: Mesaje }
  | { t: 'eroare'; d: string; mesaje?: Mesaje }

const ETICHETE: Record<string, string> = {
  de_facut: 'Verific ce e de făcut în toate firmele…', stare_firma: 'Citesc situația firmei…', cauta: 'Caut în documente și tranzacții…',
  tranzactii: 'Citesc tranzacțiile din extras…', facturi_neplatite: 'Caut facturile neplătite…', proiect: 'Citesc datele PROIECT AB Textile…',
}

// Asistentul global: istoria conversatiei (inclusiv blocurile tool_use / thinking, neschimbate) o tine
// clientul si o trimite la fiecare pas. Uneltele de citire ruleaza direct; daca modelul cere o unealta care
// MODIFICA date, ne oprim si trimitem actiunea la confirmare - abia la urmatorul apel (cu deciziile
// utilizatorului) se executa sau se refuza.
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY lipsește.' }, { status: 500 })
  const body = await req.json().catch(() => ({})) as { mesaje?: Mesaje; text?: string; imagini?: { mediaType?: string; data?: string; nume?: string }[]; decizii?: { id: string; aproba: boolean }[]; pagina?: { firma?: string; luna?: string; cale?: string } }
  const mesaje: Mesaje = Array.isArray(body.mesaje) ? body.mesaje.slice(-60) : []
  const text = String(body.text || '').trim().slice(0, 8000)
  const imagini = (Array.isArray(body.imagini) ? body.imagini : []).slice(0, MAX_IMAGINI)
    .filter((i): i is { mediaType: TipImagine; data: string; nume?: string } => !!i && TIPURI_IMAGINE.includes(i.mediaType as TipImagine) && typeof i.data === 'string' && i.data.length <= MAX_CARACTERE_IMAGINE && /^[A-Za-z0-9+/]+={0,2}$/.test(i.data))
  if (imagini.reduce((n, i) => n + i.data.length, 0) > MAX_CARACTERE_TOTAL) return NextResponse.json({ error: 'Imaginile sunt prea mari împreună. Lipește mai puține sau mai mici.' }, { status: 413 })
  if (!text && !body.decizii?.length && !imagini.length) return NextResponse.json({ error: 'Scrie un mesaj.' }, { status: 400 })

  const sb = getServiceSupabase()
  const lista = await firme(sb)
  const { fix, variabil } = instructiuni(lista, body.pagina || {})
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const enc = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const trimite = (e: Eveniment) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'))
      try {
        // 1. Deciziile pentru actiunile in asteptare: executam ce s-a aprobat (si citirile din acelasi pas).
        if (body.decizii?.length) {
          const ultim = mesaje[mesaje.length - 1]
          const blocuri = ultim?.role === 'assistant' && Array.isArray(ultim.content) ? ultim.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === 'tool_use') : []
          if (!blocuri.length) throw new Error('Nu există acțiuni în așteptare.')
          const rezultate: Anthropic.Beta.BetaToolResultBlockParam[] = []
          for (const b of blocuri) {
            const aprobat = body.decizii.find(d => d.id === b.id)?.aproba
            if (CU_CONFIRMARE.has(b.name) && !aprobat) { rezultate.push({ type: 'tool_result', tool_use_id: b.id, content: 'Utilizatorul a REFUZAT această acțiune. Nu o repeta fără să fie cerută din nou.' }); continue }
            trimite({ t: 'unealta', nume: CU_CONFIRMARE.has(b.name) ? 'Aplic modificarea confirmată…' : (ETICHETE[b.name] || b.name) })
            try { rezultate.push({ type: 'tool_result', tool_use_id: b.id, content: await executa(b.name, (b.input || {}) as Record<string, unknown>, lista) }) }
            catch (e) { rezultate.push({ type: 'tool_result', tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true }) }
          }
          mesaje.push({ role: 'user', content: rezultate })
        } else {
          mesaje.push({ role: 'user', content: imagini.length
            ? [...imagini.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })), { type: 'text' as const, text: text || 'Uită-te la imaginea atașată.' }]
            : text })
        }

        // 2. Bucla agentului.
        for (let pas = 0; pas < MAX_PASI; pas++) {
          const s = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: EFFORT },
            system: [{ type: 'text', text: fix, cache_control: { type: 'ephemeral' } }, { type: 'text', text: variabil }],
            tools: TOOLS,
            messages: mesaje,
          })
          s.on('text', d => trimite({ t: 'text', d }))
          const raspuns = await s.finalMessage()
          mesaje.push({ role: 'assistant', content: raspuns.content as Anthropic.Beta.BetaContentBlockParam[] })

          if (raspuns.stop_reason === 'refusal') { trimite({ t: 'eroare', d: 'Cererea a fost refuzată de modelul AI. Reformulează.', mesaje }); break }
          if (raspuns.stop_reason === 'max_tokens') { trimite({ t: 'eroare', d: 'Răspunsul a fost prea lung și s-a oprit. Cere o variantă mai scurtă.', mesaje }); break }
          if (raspuns.stop_reason === 'pause_turn') continue
          if (raspuns.stop_reason !== 'tool_use') { trimite({ t: 'gata', mesaje }); break }

          const cereri = raspuns.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          const deConfirmat = cereri.filter(b => CU_CONFIRMARE.has(b.name))
          if (deConfirmat.length) {
            const actiuni = await Promise.all(deConfirmat.map(async b => ({ id: b.id, nume: b.name, descriere: await descriereActiune(b.name, (b.input || {}) as Record<string, unknown>, lista) })))
            trimite({ t: 'confirma', actiuni, mesaje })
            break
          }
          const rezultate: Anthropic.Beta.BetaToolResultBlockParam[] = []
          for (const b of cereri) {
            trimite({ t: 'unealta', nume: ETICHETE[b.name] || b.name })
            try { rezultate.push({ type: 'tool_result', tool_use_id: b.id, content: await executa(b.name, (b.input || {}) as Record<string, unknown>, lista) }) }
            catch (e) { rezultate.push({ type: 'tool_result', tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true }) }
          }
          mesaje.push({ role: 'user', content: rezultate })
          if (pas === MAX_PASI - 1) trimite({ t: 'eroare', d: 'Am atins limita de pași pentru o singură cerere. Continuă cu o întrebare mai precisă.', mesaje })
        }
      } catch (e) {
        const msg = e instanceof Anthropic.RateLimitError ? 'Prea multe cereri către AI acum — încearcă din nou peste un minut.'
          : e instanceof Anthropic.APIError ? `Eroare AI (${e.status}): ${e.message}` : e instanceof Error ? e.message : String(e)
        trimite({ t: 'eroare', d: msg })
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
}
