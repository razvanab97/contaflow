import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const CATEGORIES = new Set(['comision', 'cupoane', 'publicitate', 'transport', 'servicii', 'altele'])
const EFFECTS = new Set(['cheltuiala', 'reducere'])

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function metadata(document: { furnizor?: string|null; fisier_path?: string|null; numar_document?: string|null }) {
  const source = String(document.furnizor || '')
  const value = (label: string) => source.match(new RegExp(`${label}: ([^|]+)`))?.[1]?.trim() || ''
  const amount = Number(value('Suma')) || 0
  const effect = value('Efect') === 'reducere' ? 'reducere' : 'cheltuiala'
  const category = String(document.fisier_path || '').split('/emag-calcul/')[1]?.split('/')[0] || 'altele'
  return { amount, effect, category, invoiceNumber: document.numar_document || '', date: value('Data'), notes: value('Note') }
}

async function analyzeInvoice(bytes: Buffer) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role:'user', content:[
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:bytes.toString('base64') } },
      { type:'text', text:`Analizeaza factura emisa de Dante International / eMAG pentru un seller.
Returneaza DOAR JSON valid:
{"amount":123.45,"invoiceNumber":"ABC123","date":"2026-06-01","category":"comision","effect":"cheltuiala","notes":"explicatie scurta"}
category trebuie sa fie una dintre: comision|cupoane|publicitate|transport|servicii|altele.
effect este reducere doar pentru storno/credit/note care reduc costul; altfel cheltuiala.
amount este totalul final al documentului in RON, pozitiv.` },
    ] }],
  })
  const text = response.content.filter(block=>block.type==='text').map(block=>(block as {text:string}).text).join('')
  const match = text.match(/\{[\s\S]*\}/)
  return match ? JSON.parse(match[0]) as Record<string, unknown> : {}
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  const docId = req.nextUrl.searchParams.get('docId')
  const sb = getServiceSupabase()

  if (docId) {
    const { data: doc } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', docId).or('fisier_path.like.%/emag-calcul/%,fisier_path.like.%/emag-avize/%').single()
    if (!doc?.fisier_path) return NextResponse.json({ error: 'Factura nu a fost găsită' }, { status: 404 })
    const { data: file } = await sb.storage.from('documente').download(doc.fisier_path)
    if (!file) return NextResponse.json({ error: 'Eroare descărcare' }, { status: 500 })
    const fileName = String(doc.fisier_nume || 'factura.pdf').replace(/["\r\n]/g, '_')
    return new NextResponse(Buffer.from(await file.arrayBuffer()), {
      headers: { 'Content-Type': doc.fisier_tip || 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` },
    })
  }

  if (!lunaId) return NextResponse.json({ documents: [], summary: {} })
  const [{ data: documents, error }, { data: statements }] = await Promise.all([
    sb.from('documente')
      .select('id,fisier_nume,fisier_path,furnizor,numar_document,created_at')
      .eq('luna_id', lunaId)
      .eq('modul', 'acte_contabile')
      .like('fisier_path', '%/emag-calcul/%')
      .order('created_at', { ascending: true }),
    sb.from('extrase').select('id').eq('luna_id', lunaId),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const statementIds = (statements || []).map(statement => statement.id)
  const { data: transactions } = statementIds.length
    ? await sb.from('tranzactii').select('tip,suma,valuta').in('extras_id', statementIds)
    : { data: [] }

  const parsed = (documents || []).map(document => ({ ...document, ...metadata(document) }))
  const categories: Record<string, number> = {}
  let emagExpenses = 0
  let emagReductions = 0
  for (const document of parsed) {
    const signed = document.effect === 'reducere' ? -document.amount : document.amount
    categories[document.category] = (categories[document.category] || 0) + signed
    if (document.effect === 'reducere') emagReductions += document.amount
    else emagExpenses += document.amount
  }
  const bank = (transactions || []).reduce((total, transaction) => {
    if (transaction.valuta !== 'RON') return total
    if (transaction.tip === 'credit') total.receipts += Number(transaction.suma) || 0
    else total.payments += Number(transaction.suma) || 0
    return total
  }, { receipts: 0, payments: 0 })

  return NextResponse.json({
    documents: parsed,
    summary: {
      bankReceipts: bank.receipts,
      bankPayments: bank.payments,
      bankCashflow: bank.receipts - bank.payments,
      emagExpenses,
      emagReductions,
      emagNetCost: emagExpenses - emagReductions,
      categories,
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const category = fd.get('category') as string
    const effect = fd.get('effect') as string
    const amount = fd.get('amount') as string
    const invoiceNumber = fd.get('invoiceNumber') as string
    const date = fd.get('date') as string
    const notes = fd.get('notes') as string

    if (!file || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Adaugă PDF-ul facturii, firma și luna' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    if (file.type !== 'application/pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      return NextResponse.json({ error: 'Este acceptat doar un fișier PDF' }, { status: 422 })
    let extracted: Record<string, unknown> = {}
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || category === 'automat' || effect === 'automat' || !invoiceNumber || !date) {
      try { extracted = await analyzeInvoice(bytes) } catch {}
    }
    const numericAmount = Number(amount) > 0 ? Number(amount) : Number(extracted.amount)
    const resolvedCategory = CATEGORIES.has(category) ? category : CATEGORIES.has(String(extracted.category)) ? String(extracted.category) : 'altele'
    const resolvedEffect = EFFECTS.has(effect) ? effect : EFFECTS.has(String(extracted.effect)) ? String(extracted.effect) : 'cheltuiala'
    const resolvedNumber = String(invoiceNumber || extracted.invoiceNumber || '')
    const resolvedDate = String(date || extracted.date || '')
    const resolvedNotes = String(notes || extracted.notes || '')
    if (!Number.isFinite(numericAmount) || numericAmount <= 0)
      return NextResponse.json({ error: 'Totalul facturii nu a putut fi identificat. Completează suma manual.' }, { status: 422 })
    const fileName = `${safePart(resolvedDate || 'fara_data', 'fara_data')}_${safePart(resolvedNumber || resolvedCategory, resolvedCategory)}_${Date.now()}.pdf`
    const path = `${firmaId}/${lunaId}/emag-calcul/${resolvedCategory}/${fileName}`
    const supplier = [
      'Dante International / eMAG',
      `Categorie: ${resolvedCategory}`,
      `Efect: ${resolvedEffect}`,
      `Suma: ${numericAmount.toFixed(2)}`,
      resolvedDate && `Data: ${resolvedDate}`,
      resolvedNotes && `Note: ${resolvedNotes.replace(/\|/g, '/')}`,
    ].filter(Boolean).join(' | ')
    const sb = getServiceSupabase()
    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: 'application/pdf' })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })
    const { error } = await sb.from('documente').insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'acte_contabile',
      tip_document: 'factura',
      furnizor: supplier,
      numar_document: resolvedNumber,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: 'application/pdf',
      fisier_marime: bytes.length,
      in_zip: true,
    })
    if (error) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, extracted:{ amount:numericAmount, category:resolvedCategory, effect:resolvedEffect, invoiceNumber:resolvedNumber, date:resolvedDate, notes:resolvedNotes } })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Factura lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: document } = await sb.from('documente').select('id,fisier_path').eq('id', id).single()
  if (!document || !String(document.fisier_path).includes('/emag-calcul/'))
    return NextResponse.json({ error: 'Factura eMAG nu a fost găsită' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from('documente').remove([document.fisier_path])
  return NextResponse.json({ ok: true })
}
