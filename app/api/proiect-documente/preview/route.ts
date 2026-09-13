import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { getServiceSupabase } from '@/lib/supabase/server'

// Randare Word -> HTML direct in server (fara viewer extern gen Office Online) - documentul ramane
// privat, nu iese niciodata dintr-un URL public catre servere terte.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('proiect_documente').select('fisier_path,fisier_tip').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  if (doc.fisier_tip === 'application/pdf') return NextResponse.json({ pdf: true })
  if (!doc.fisier_tip?.includes('wordprocessingml') && !doc.fisier_path.toLowerCase().endsWith('.docx')) {
    return NextResponse.json({ error: 'Previzualizare disponibilă doar pentru .docx și PDF' }, { status: 400 })
  }

  const { data: file, error } = await sb.storage.from('documente').download(doc.fisier_path)
  if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.convertToHtml({ buffer })
    return NextResponse.json({ html: result.value })
  } catch (e) {
    return NextResponse.json({ error: 'Documentul nu a putut fi randat: ' + String(e) }, { status: 500 })
  }
}
