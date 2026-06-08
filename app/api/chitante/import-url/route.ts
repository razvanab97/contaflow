import { isIP } from 'node:net'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

const ACCOUNTING_SECTIONS = new Set(['facturi-chitanta', 'facturi-restante'])

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function isPrivateSource(source: URL) {
  const hostname = source.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true
  if (isIP(hostname) === 4) {
    return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  }
  return isIP(hostname) === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:'))
}

export async function POST(req: NextRequest) {
  const {
    url, firmaId, lunaId, section, supplier, description, reference, transactionId,
    itemId, documentType = 'factura',
  } = await req.json()
  const isAccountingSection = ACCOUNTING_SECTIONS.has(section)
  if (!url || !firmaId || !lunaId || (!isAccountingSection && !itemId && !transactionId))
    return NextResponse.json({ error: 'Date lipsă sau destinație invalidă' }, { status: 400 })

  let source: URL
  try { source = new URL(url) } catch { return NextResponse.json({ error: 'Link invalid' }, { status: 400 }) }
  if (source.protocol !== 'https:' || isPrivateSource(source))
    return NextResponse.json({ error: 'Este acceptat doar un link HTTPS public către un PDF' }, { status: 400 })

  const response = await fetch(source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
      'Referer': `${source.origin}/`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
    },
  })
  if (!response.ok) return NextResponse.json({ error: `Platforma sursă a răspuns cu status ${response.status}` }, { status: 502 })
  const contentType = response.headers.get('content-type') || ''
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!contentType.toLowerCase().includes('pdf') && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    return NextResponse.json({ error: 'Linkul nu a returnat un fișier PDF' }, { status: 422 })

  const sb = getServiceSupabase()
  let transaction: { id:string; document_id:string|null; extras_id:string; data_tranzactie:string; descriere_curatata:string|null; descriere:string|null } | null = null
  if (transactionId) {
    const result = await sb.from('tranzactii')
      .select('id,document_id,extras_id,data_tranzactie,descriere_curatata,descriere')
      .eq('id', transactionId).eq('firma_id', firmaId).maybeSingle()
    transaction = result.data
    if (!transaction) return NextResponse.json({ error: 'Tranzacția nu a fost găsită pentru firma selectată' }, { status: 404 })
  }

  const sourceName = source.hostname.replace(/^www\./, '')
  const details = [supplier, description, reference, transaction?.descriere_curatata || transaction?.descriere].filter(Boolean).join(' ')
  const fileName = `${safePart(transaction?.data_tranzactie || '', '')}${transaction?.data_tranzactie ? '_' : ''}${safePart(documentType, 'document')}_${safePart(details, sourceName)}_${Date.now()}.pdf`
  const destination = itemId ? `checklist/${itemId}` : transactionId ? `tx/${transactionId}` : section
  const path = `${firmaId}/${lunaId}/${destination}/${fileName}`
  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType:'application/pdf' })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const documentValues = {
    firma_id:firmaId,
    luna_id:lunaId,
    checklist_item_id:itemId || null,
    tranzactie_id:transactionId || null,
    ...(transactionId ? { modul:'extras' } : isAccountingSection ? { modul:'acte_contabile' } : {}),
    tip_document:documentType,
    furnizor:[supplier, description && `Descriere: ${description}`, reference && `Referinta: ${reference}`, `Sursa: ${sourceName}`].filter(Boolean).join(' | '),
    fisier_path:path,
    fisier_nume:fileName,
    fisier_tip:'application/pdf',
    fisier_marime:bytes.length,
    in_zip:true,
  }
  const oldDocumentId = transaction?.document_id
  const oldDocument = oldDocumentId
    ? await sb.from('documente').select('fisier_path').eq('id', oldDocumentId).maybeSingle()
    : null
  const query = oldDocumentId
    ? sb.from('documente').update(documentValues).eq('id', oldDocumentId)
    : sb.from('documente').insert(documentValues)
  const { data, error } = await query.select('id,fisier_nume,tip_document,furnizor,modul,created_at').single()
  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error:error.message }, { status:500 })
  }

  if (transactionId && transaction) {
    await sb.from('tranzactii').update({ document_id:data.id, note:null }).eq('id', transactionId)
    const { count } = await sb.from('tranzactii').select('id', { count:'exact', head:true }).eq('extras_id', transaction.extras_id).not('document_id', 'is', null)
    if (count !== null) await sb.from('extrase').update({ nr_documentate:count }).eq('id', transaction.extras_id)
    const oldPath = oldDocument?.data?.fisier_path
    if (oldPath && oldPath !== path) await sb.storage.from('documente').remove([oldPath])
  }
  return NextResponse.json({ doc:data })
}
