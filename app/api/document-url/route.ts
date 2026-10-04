import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Pentru vizualizatorul pop-up: transforma URL-ul de descarcare al unui document (oricare dintre
// rutele aplicatiei) intr-un link semnat DIRECT catre fisierul din Supabase Storage - documentul se
// incarca direct din storage (CDN), fara sa mai treaca prin functia serverless, deci mult mai repede.
const RUTE: Record<string, { tabel: string; param: string }> = {
  '/api/chitante/document': { tabel: 'documente', param: 'id' },
  '/api/tranzactii/document': { tabel: 'documente', param: 'id' },
  '/api/checklist/docs': { tabel: 'documente', param: 'docId' },
  '/api/emag': { tabel: 'documente', param: 'docId' },
  '/api/documente-generale': { tabel: 'documente', param: 'download' },
  '/api/bonuri/download': { tabel: 'bonuri', param: 'id' },
  '/api/facturi-asteptate/download': { tabel: 'facturi_asteptate', param: 'id' },
  '/api/model-documente/download': { tabel: 'model_documente', param: 'id' },
  '/api/inbox-facturi/global/document': { tabel: 'inbox_watch_files', param: 'id' },
  '/api/proiect-documente/download': { tabel: 'proiect_documente', param: 'id' },
}

function mimeDin(nume: string, tip?: string | null) {
  if (tip) return tip
  const n = nume.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (/\.jpe?g$/.test(n)) return 'image/jpeg'
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'application/octet-stream'
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  let tinta: URL
  try { tinta = new URL(u, req.nextUrl.origin) } catch { return NextResponse.json({ error: 'URL invalid' }, { status: 400 }) }
  const sb = getServiceSupabase()

  let path: string | null = null, nume = 'document', tip: string | null = null
  let bucket = 'documente'
  const ruta = RUTE[tinta.pathname]
  if (ruta) {
    const id = tinta.searchParams.get(ruta.param)
    if (!id) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    const { data } = await sb.from(ruta.tabel).select('*').eq('id', id).single() // '*': unele tabele nu au fisier_tip
    if (data) { path = data.fisier_path; nume = data.fisier_nume || nume; tip = data.fisier_tip || null }
  } else if (tinta.pathname === '/api/extras/pdf-download') {
    // PDF-ul original al extrasului de cont (tab-ul Extras PDF) - sta in bucket-ul extrase-pdf
    const { data } = await sb.from('extrase').select('pdf_path,pdf_nume').eq('id', tinta.searchParams.get('extrasId') || '').single()
    if (data) { path = data.pdf_path; nume = data.pdf_nume || 'extras.pdf'; tip = 'application/pdf'; bucket = 'extrase-pdf' }
  } else if (tinta.pathname === '/api/firma-date/download') {
    const t = tinta.searchParams.get('tip')
    if (t === 'certificat') {
      const { data } = await sb.from('firme').select('certificat_path,certificat_nume').eq('id', tinta.searchParams.get('firmaId') || '').single()
      if (data) { path = data.certificat_path; nume = data.certificat_nume || 'Certificat de inregistrare' }
    } else if (t === 'buletin') {
      const { data } = await sb.from('proprietari').select('buletin_path,buletin_nume').eq('id', tinta.searchParams.get('proprietarId') || '').single()
      if (data) { path = data.buletin_path; nume = data.buletin_nume || 'Buletin' }
    }
  }
  if (!path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })

  const { data: semnat, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !semnat?.signedUrl) return NextResponse.json({ error: error?.message || 'Link indisponibil' }, { status: 500 })
  return NextResponse.json({ url: semnat.signedUrl, nume, tip: mimeDin(nume || path, tip) }, { headers: { 'Cache-Control': 'private, max-age=600' } })
}
