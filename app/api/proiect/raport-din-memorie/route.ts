import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { MODEL_PROIECT, contextLive, promptFix } from '@/lib/proiect-intreaba'
import { listaMemorie, memorieText } from '@/lib/proiect-memorie'
import type { StarePlan } from '@/lib/proiect-plan'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const pad = (n: number) => String(n).padStart(2, '0')

// Propunere pentru raportul lunar (Anexa 5) al unei luni, din memoria proiectului + documente + date
// ContaFlow. Nu scrie nimic in raport - utilizatorul vede propunerea si o aplica din editor.
export async function POST(req: NextRequest) {
  const { firmaId, luna } = await req.json().catch(() => ({})) as { firmaId?: string; luna?: string }
  const m = String(luna || '').match(/^(\d{4})-(\d{2})$/)
  if (!firmaId || !m) return NextResponse.json({ error: 'Alege luna raportului.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY lipsește.' }, { status: 500 })
  const an = Number(m[1]), ln = Number(m[2])
  const ultima = new Date(an, ln, 0).getDate()
  const de = `${an}-${pad(ln)}-01`, pana = `${an}-${pad(ln)}-${pad(ultima)}`
  const perioada = `01.${pad(ln)}.${an} – ${ultima}.${pad(ln)}.${an}`

  const sb = getServiceSupabase()
  const [{ data: st }, { memorie: memLuna }, { data: raport }] = await Promise.all([
    sb.from('proiect_plan_stari').select('cheie,status,nota,data_realizare').eq('firma_id', firmaId),
    listaMemorie(sb, firmaId, { de, pana }),
    sb.from('proiect_raport_campuri').select('perioada,autorizatii,obiective,activitati').eq('firma_id', firmaId).eq('sectiune', 'raport_lunar').maybeSingle(),
  ])
  const live = await contextLive(sb, firmaId, (st || []) as StarePlan[])

  const cerere = `Pregătește conținutul RAPORTULUI LUNAR DE IMPLEMENTARE (Anexa 5) pentru ${LUNI[ln - 1]} ${an}, perioada ${perioada}.

Ce s-a întâmplat în această lună, din memoria proiectului:
${memorieText(memLuna)}

Raportul completat ultima dată în ContaFlow (perioada ${raport?.perioada || '—'}) — punct de plecare, de actualizat:
Autorizații:
${raport?.autorizatii || '—'}
Obiective:
${raport?.obiective || '—'}
Activități:
${raport?.activitati || '—'}

Reguli:
- Respectă stilul rapoartelor lunare deja trimise (vezi documentele „Raport lunar de implementare” din dosarul local): rânduri scurte, fără diacritice obligatorii, fără bullet-uri în text.
- „autorizatii”: câte un rând per autorizație/aviz relevant pentru CAEN 9610, cu stadiul LA SFÂRȘITUL lunii (ex. „Autorizatie de mediu – stadiu obtinere: ...”). Actualizează stadiul din memorie și din starea planului; dacă nu există informație nouă, păstrează stadiul anterior.
- „obiective”: obiectivele din planul de afaceri realizate parțial/integral în lună (din memorie și din calendarul activităților). Dacă nu s-a realizat nimic, un singur rând: „Fara activitate”.
- „activitati”: activitățile concrete derulate în lună (din memorie; apoi din calendarul planului doar ce e confirmat ca făcut / în curs). Nu inventa activități care nu reies din memorie, stări sau documente.
- „lipsuri”: ce NU ai putut afla și ar trebui completat de utilizator înainte de trimitere (ex. „stadiul autorizației de la Primărie în octombrie”), maximum 5.
- „surse”: de unde ai luat fiecare informație importantă, scurt.

Răspunde DOAR cu JSON valid, fără alt text:
{"autorizatii":["..."],"obiective":["..."],"activitati":["..."],"lipsuri":["..."],"surse":["..."]}`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: MODEL_PROIECT,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: promptFix(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: live },
      ],
      messages: [{ role: 'user', content: cerere }],
    })
    const text = msg.content.map(b => b.type === 'text' ? b.text : '').join('')
    const j = text.match(/\{[\s\S]*\}/)
    if (!j) return NextResponse.json({ error: 'AI-ul nu a returnat o propunere. Încearcă din nou.' }, { status: 502 })
    const d = JSON.parse(j[0]) as Record<string, unknown>
    const lista = (v: unknown) => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 15) : []
    return NextResponse.json({
      perioada, dataRaport: `${ultima}.${pad(ln)}.${an}`,
      autorizatii: lista(d.autorizatii), obiective: lista(d.obiective), activitati: lista(d.activitati),
      lipsuri: lista(d.lipsuri), surse: lista(d.surse), memorieFolosita: memLuna.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Eroare AI' }, { status: 500 })
  }
}
