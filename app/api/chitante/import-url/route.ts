import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

export async function POST(req: NextRequest) {
  const { url, firmaId, lunaId, section, supplier, description, reference, transactionId } = await req.json()
  if (!url || !firmaId || !lunaId || !['facturi-chitanta', 'facturi-restante'].includes(section))
    return NextResponse.json({ error: 'Date lipsă sau invalide' }, { status: 400 })

  let source: URL
  try { source = new URL(url) } catch { return NextResponse.json({ error: 'Link invalid' }, { status: 400 }) }
  if (source.protocol !== 'https:' || !source.hostname.endsWith('oblio.eu'))
    return NextResponse.json({ error: 'Momentan sunt acceptate doar linkuri HTTPS Oblio' }, { status: 400 })

  const response = await fetch(source, { redirect: 'error' })
  if (!response.ok) return NextResponse.json({ error: `Oblio a răspuns cu status ${response.status}` }, { status: 502 })
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('pdf')) return NextResponse.json({ error: 'Linkul nu a returnat un fișier PDF' }, { status: 422 })

  const bytes = Buffer.from(await response.arrayBuffer())
  const details = [supplier, description, reference].filter(Boolean).join(' ')
  const fileName = `${safePart(details, 'factura_oblio')}_${Date.now()}.pdf`
  const path = `${firmaId}/${lunaId}/${section}/${fileName}`
  const sb = getServiceSupabase()
  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType:'application/pdf' })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data, error } = await sb.from('documente').insert({
    firma_id:firmaId, luna_id:lunaId, tranzactie_id:transactionId || null, modul:'acte_contabile', tip_document:'factura',
    furnizor:[supplier, description && `Descriere: ${description}`, reference && `Referinta: ${reference}`, 'Sursa: Oblio'].filter(Boolean).join(' | '),
    fisier_path:path, fisier_nume:fileName, fisier_tip:'application/pdf', fisier_marime:bytes.length, in_zip:true,
  }).select('id,fisier_nume,tip_document,furnizor,modul,created_at').single()
  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error:error.message }, { status:500 })
  }
  if (transactionId) await sb.from('tranzactii').update({ document_id: data.id, note: null }).eq('id', transactionId)
  return NextResponse.json({ doc: data })
}
