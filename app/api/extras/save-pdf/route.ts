import { NextRequest, NextResponse } from 'next/server'
import { ibanDinPdf, verificaContPdf } from '@/lib/extras-pdf-cont'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SBH = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('pdf') as File | null
    const extrasId = fd.get('extrasId') as string | null
    const firmaId = fd.get('firmaId') as string | null
    const lunaId = fd.get('lunaId') as string | null

    if (!file || !extrasId || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.pdf'))
      return NextResponse.json({ error: 'Selectează un fișier PDF' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())

    // PDF-ul trebuie sa fie al acestui cont (IBAN / moneda) - altfel ZIP-ul pentru contabil ar primi
    // extrasul altui cont, iar al acestuia ar lipsi.
    const contRes = await fetch(`${SB}/rest/v1/extrase?id=eq.${extrasId}&select=valuta,iban`, { headers: SBH })
    const [cont] = contRes.ok ? await contRes.json() : []
    if (!cont) return NextResponse.json({ error: 'Extrasul nu a fost găsit' }, { status: 404 })
    const ibanPdf = await ibanDinPdf(new Uint8Array(buf), file.name)
    const refuz = verificaContPdf(ibanPdf, cont)
    if (refuz) return NextResponse.json({ error: refuz }, { status: 422 })
    const storagePath = `${firmaId}/${lunaId}/${extrasId}_${Date.now()}.pdf`

    const upRes = await fetch(`${SB}/storage/v1/object/extrase-pdf/${storagePath}`, {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: buf,
    })
    if (!upRes.ok) return NextResponse.json({ error: 'Storage: ' + await upRes.text() }, { status: 500 })

    const dbRes = await fetch(`${SB}/rest/v1/extrase?id=eq.${extrasId}`, {
      method: 'PATCH',
      headers: { ...SBH, 'Prefer': 'return=minimal' },
      // contul fara IBAN (importat inainte de citirea antetului CSV) il primeste din PDF
      body: JSON.stringify({ pdf_path: storagePath, pdf_nume: file.name, ...(!cont.iban && ibanPdf ? { iban: ibanPdf } : {}) }),
    })
    if (!dbRes.ok) return NextResponse.json({ error: 'DB: ' + await dbRes.text() }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
