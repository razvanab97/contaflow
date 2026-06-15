import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file || !ALLOWED.has(file.type))
      return NextResponse.json({ error: 'Fișier invalid — acceptă JPG, PNG sau PDF' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const source = file.type === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: bytes.toString('base64') } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp', data: bytes.toString('base64') } }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: 'Citeste cu atentie acest buletin/carte de identitate romanesc. Extrage: numele de familie (NUME), prenumele (PRENUME), seria CI (2 litere), numarul CI (6 cifre). Returneaza DOAR JSON, nimic altceva: {"nume":"IONESCU","prenume":"GHEORGHE","serieCi":"MX","numarCi":"123456"}. Daca nu gasesti un camp lasa string gol. Nu inventa date.' },
      ] }],
    })

    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) return NextResponse.json({ error: 'AI nu a putut extrage datele' }, { status: 422 })

    let extracted: { nume?: string; prenume?: string; serieCi?: string; numarCi?: string } = {}
    try { extracted = JSON.parse(match[0]) } catch {
      return NextResponse.json({ error: 'Răspuns AI invalid' }, { status: 422 })
    }

    return NextResponse.json({
      nume: String(extracted.nume || '').trim(),
      prenume: String(extracted.prenume || '').trim(),
      serieCi: String(extracted.serieCi || '').trim().toUpperCase(),
      numarCi: String(extracted.numarCi || '').trim(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
