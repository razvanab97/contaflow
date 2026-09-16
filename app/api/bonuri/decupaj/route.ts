import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ALLOWED = new Set(['image/jpeg', 'image/png'])

type Box = { x: number; y: number; width: number; height: number }

function parseBox(v: any): Box | null {
  const { x, y, width, height } = v || {}
  const valid = [x, y, width, height].every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
    && x >= 0 && y >= 0 && width > 0.03 && height > 0.03 && x + width <= 1.02 && y + height <= 1.02
  if (!valid) return null
  return { x: Math.max(0, x), y: Math.max(0, y), width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) }
}

// Nu avem nicio librarie server-side de procesare imagini (sharp/jimp) in proiect - decuparea
// efectiva se face pe client, cu canvas. Ruta asta doar identifica, via Claude vision, unde sunt
// bonul/bonurile de hartie in poza, ca sa stim ce dreptunghi(uri) sa decupam - elimina fundalul/
// mana/masa din jur, pastrand doar bonurile, inainte de citirea datelor. O singura poza poate
// contine mai multe bonuri puse alaturat (ex. fotografiate impreuna la finalul lunii) - in acel
// caz raspunde cu cate un dreptunghi pentru fiecare, ca sa devina fiecare cate un bon separat.
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Fișier lipsă' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ boxes: [] })

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: `Aceasta e o poză făcută ca să scaneze unul sau mai multe bonuri fiscale/chitanțe de hârtie - ținute în mână, puse pe o masă, sau mai multe alăturate (ex. mai multe bonuri fotografiate împreună la final de lună). Găsește FIECARE bon/chitanță de hârtie distinctă din poză și dreptunghiul STRÂNS din jurul ei (fără fundal, fără mâna care o ține, fără masă) - poate fi rotită/înclinată, ia cel mai mic dreptunghi ALINIAT ORIZONTAL care o acoperă complet. Nu uni două bonuri alăturate într-un singur dreptunghi - fiecare bon separat, cu marginea lui proprie.
Răspunde DOAR cu JSON, coordonate ca fracție (0-1) din dimensiunea imaginii: {"bonuri":[{"x":0.1,"y":0.05,"width":0.2,"height":0.85},{"x":0.35,"y":0.06,"width":0.2,"height":0.83}]}
Dacă nu găsești clar niciun bon/chitanță de hârtie în poză (poza e goală, neclară, sau altceva), răspunde {"bonuri":[]}.` },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ boxes: [] })
    const parsed = JSON.parse(match[0])
    const boxes = (Array.isArray(parsed.bonuri) ? parsed.bonuri : []).map(parseBox).filter((b: Box | null): b is Box => !!b)
    return NextResponse.json({ boxes })
  } catch {
    return NextResponse.json({ boxes: [] })
  }
}
