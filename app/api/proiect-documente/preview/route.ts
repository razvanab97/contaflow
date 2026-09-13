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

// 1 EMU (English Metric Unit, unitatea Word pentru dimensiuni) = 1/9525 px la 96dpi
const EMU_PER_PX = 9525

// Antetul/subsolul (ex. bannerul de finanțare europeană cu sigle) nu sunt parte din
// word/document.xml - mammoth randeaza doar corpul. Le extragem separat: gasim imaginile
// referite in header*.xml/footer*.xml (in ordinea in care apar, ca sa pastram ordinea vizuala),
// impreuna cu dimensiunea reala (<wp:extent>) pe care Word o afiseaza - fara ea, imaginile ies
// la rezolutia lor nativa (des uriase), nu la marimea mica la care apar de fapt in document.
async function extractHeaderFooterImages(zip: JSZip, kind: 'header' | 'footer'): Promise<string[]> {
  const files = Object.keys(zip.files).filter(f => new RegExp(`^word/${kind}\\d+\\.xml$`).test(f))
  const imgs: { html: string }[] = []

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
    // fiecare <w:drawing>...</w:drawing> contine exact un <wp:extent> (dimensiune) si un r:embed (imaginea) - impreuna
    for (const d of xml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)) {
      const block = d[0]
      const embed = block.match(/r:embed="([^"]+)"/)?.[1]
      const extent = block.match(/<wp:extent cx="(\d+)" cy="(\d+)"/)
      if (!embed) continue
      const target = relMap.get(embed)
      if (!target) continue
      const imgPath = `word/${target.replace(/^\.?\//, '')}`
      const mime = mimeFor(imgPath)
      const imgFile = zip.file(imgPath)
      if (!mime || !imgFile) continue
      const base64 = await imgFile.async('base64')
      const sizeStyle = extent
        ? `width:${(+extent[1] / EMU_PER_PX).toFixed(0)}px;height:${(+extent[2] / EMU_PER_PX).toFixed(0)}px;`
        : ''
      imgs.push({ html: `<img src="data:${mime};base64,${base64}" style="${sizeStyle}max-width:100%;object-fit:contain;"/>` })
    }
  }
  if (!imgs.length) return []
  // sigle multiple (subsol) apar de obicei una langa alta, nu stivuite - un singur banner (antet) ramane la fel
  return [`<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px;margin:8px 0;">${imgs.map(i => i.html).join('')}</div>`]
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
