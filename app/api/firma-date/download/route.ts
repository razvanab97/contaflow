import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function safeHeaders(fileName: string, contentType: string) {
  const safeName = fileName.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\x20-\x7E]/g, '_')
  return {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  }
}

export async function GET(req: NextRequest) {
  const tip = req.nextUrl.searchParams.get('tip')
  const sb = getServiceSupabase()

  if (tip === 'certificat') {
    const firmaId = req.nextUrl.searchParams.get('firmaId')
    if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

    const { data: firma } = await sb.from('firme').select('certificat_path,certificat_nume').eq('id', firmaId).single()
    if (!firma?.certificat_path) return NextResponse.json({ error: 'Certificatul nu a fost încărcat' }, { status: 404 })

    const { data: file, error } = await sb.storage.from('documente').download(firma.certificat_path)
    if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

    const fileName = firma.certificat_nume || 'certificat-inregistrare'
    return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: safeHeaders(fileName, file.type) })
  }

  if (tip === 'buletin') {
    const proprietarId = req.nextUrl.searchParams.get('proprietarId')
    if (!proprietarId) return NextResponse.json({ error: 'proprietarId lipsește' }, { status: 400 })

    const { data: proprietar } = await sb.from('proprietari').select('buletin_path,buletin_nume').eq('id', proprietarId).single()
    if (!proprietar?.buletin_path) return NextResponse.json({ error: 'Buletinul nu a fost încărcat' }, { status: 404 })

    const { data: file, error } = await sb.storage.from('documente').download(proprietar.buletin_path)
    if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })

    const fileName = proprietar.buletin_nume || 'buletin'
    return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: safeHeaders(fileName, file.type) })
  }

  return NextResponse.json({ error: 'tip invalid (certificat/buletin)' }, { status: 400 })
}
