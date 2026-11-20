import { NextRequest, NextResponse } from 'next/server'
import { extrageDateBuletin } from '@/lib/ai/buletin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Extrage datele de identitate dintr-un buletin încărcat (imagine sau PDF) pentru completarea
// automată a câmpurilor unui beneficiar. Nu salvează fișierul — doar citește datele.
const ACCEPTAT = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null)
  const file = fd?.get('file')
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Încarcă poza buletinului (JPG, PNG sau PDF)' }, { status: 400 })
  if (!ACCEPTAT.has(file.type)) return NextResponse.json({ error: 'Doar imagine (JPG/PNG) sau PDF' }, { status: 400 })
  if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: 'Fișier prea mare (max 12 MB)' }, { status: 400 })
  const mt = file.type === 'image/webp' ? 'image/jpeg' : file.type // webp -> tratat ca jpeg de model
  const date = await extrageDateBuletin(new Uint8Array(await file.arrayBuffer()), mt)
  if (!date || !Object.keys(date).length) return NextResponse.json({ date: {}, mesaj: 'Nu am putut citi datele — completează manual' })
  return NextResponse.json({ date })
}
