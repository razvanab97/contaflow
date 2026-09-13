import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import { getServiceSupabase } from '@/lib/supabase/server'

function mimeFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'emf' || ext === 'wmf') return null // formate vectoriale vechi Office, fara suport in browser
  return 'application/octet-stream'
}

// Antetul/subsolul (ex. bannerul de finanțare europeană cu sigle) nu sunt parte din
// word/document.xml - mammoth randeaza doar corpul. Le extragem separat: gasim imaginile
// referite in header*.xml/footer*.xml (in ordinea in care apar, ca sa pastram ordinea vizuala)
// si le atasam ca <img> inainte/dupa corpul documentului.
async function extractHeaderFooterImages(zip: JSZip, kind: 'header' | 'footer'): Promise<string[]> {
  const files = Object.keys(zip.files).filter(f => new RegExp(`^word/${kind}\\d+\\.xml$`).test(f))
  const imgsHtml: string[] = []

  for (const file of files) {
    const relsPath = `word/_rels/${file.split('/').pop()}.rels`
    const relsFile = zip.file(relsPath)
    if (!relsFile) continue
    const relsXml = await relsFile.async('string')
    const relMap = new Map<string, string>()
    for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
      if (relsXml.slice(m.index, m.index! + m[0].length).includes('/image')) relMap.set(m[1], m[2])
    }
    if (!relMap.size) continue

    const xml = await zip.file(file)!.async('string')
    for (const m of xml.matchAll(/r:embed="([^"]+)"/g)) {
      const target = relMap.get(m[1])
      if (!target) continue
      const imgPath = `word/${target.replace(/^\.?\//, '')}`
      const mime = mimeFor(imgPath)
      const imgFile = zip.file(imgPath)
      if (!mime || !imgFile) continue
      const base64 = await imgFile.async('base64')
      imgsHtml.push(`<img src="data:${mime};base64,${base64}" style="max-width:100%;display:block;margin:4px auto;"/>`)
    }
  }
  return imgsHtml
}

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
    const [bodyResult, zip] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      JSZip.loadAsync(buffer),
    ])
    const [headerImgs, footerImgs] = await Promise.all([
      extractHeaderFooterImages(zip, 'header'),
      extractHeaderFooterImages(zip, 'footer'),
    ])

    const html = [...headerImgs, bodyResult.value, ...footerImgs].join('')
    return NextResponse.json({ html })
  } catch (e) {
    return NextResponse.json({ error: 'Documentul nu a putut fi randat: ' + String(e) }, { status: 500 })
  }
}
