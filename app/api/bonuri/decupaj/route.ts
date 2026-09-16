import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ALLOWED = new Set(['image/jpeg', 'image/png'])

// Nu avem nicio librarie server-side de procesare imagini (sharp/jimp) in proiect - decuparea
// efectiva se face pe client, cu canvas. Ruta asta doar identifica, via Claude vision, unde e
// bonul de hartie in poza, ca sa stim ce dreptunghi sa decupam - elimina fundalul/mana/biroul
// din jur, pastrand doar bonul, inainte sa il trimitem la extractia de date (care citeste mai
// bine o poza curata, incadrata strans, decat una cu mult fundal in jur).
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Fișier lipsă' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ box: null })

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: `Aceasta e o poză făcută ca să scaneze un bon fiscal/chitanță de hârtie ținută în mână sau pusă pe o masă. Găsește dreptunghiul STRÂNS în jurul bonului de hârtie (fără fundal, fără mâna care îl ține, fără masă) - poate fi rotit/înclinat, ia cel mai mic dreptunghi ALINIAT ORIZONTAL care îl acoperă complet.
Răspunde DOAR cu JSON, coordonate ca fracție (0-1) din dimensiunea imaginii: {"x":0.1,"y":0.05,"width":0.6,"height":0.85}
Dacă nu găsești clar un bon/chitanță de hârtie în poză (poza e goală, neclară, sau altceva), răspunde {"x":null}.` },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ box: null })
    const parsed = JSON.parse(match[0])
    const { x, y, width, height } = parsed
    const valid = [x, y, width, height].every((v: unknown) => typeof v === 'number' && Number.isFinite(v))
      && x >= 0 && y >= 0 && width > 0.05 && height > 0.05 && x + width <= 1.02 && y + height <= 1.02
    if (!valid) return NextResponse.json({ box: null })
    return NextResponse.json({ box: { x: Math.max(0, x), y: Math.max(0, y), width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) } })
  } catch {
    return NextResponse.json({ box: null })
  }
}
