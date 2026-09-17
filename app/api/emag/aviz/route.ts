import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

interface ExtractedInvoice {
  categorie?: string
  idDocument?: string
  serieDocument?: string
  dataDocument?: string
  valoare?: number
}

interface OrphanInvoice {
  id: string
  task_key: string
  numar_document: string | null
  fisier_nume: string
}

function currencyForTaskKey(taskKey?: string | null) {
  const key = String(taskKey || '').toLowerCase()
  if (key.includes('_bg')) return 'EUR'
  if (key.includes('_hu')) return 'HUF'
  return 'RON'
}

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function normalize(value: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function taskKeyFromPath(path?: string | null) {
  return String(path || '').split('/emag-facturi/')[1]?.split('/')[0] || ''
}

function invoiceMatches(numarCautare?: string | null, doc?: OrphanInvoice | null) {
  const target = normalize(numarCautare || '')
  if (!target || !doc) return false
  const docNo = normalize(doc.numar_document || '')
  const docName = normalize(doc.fisier_nume || '')
  const trailing = normalize(String(numarCautare || '').match(/(\d+)$/)?.[1] || '')
  return (!!docNo && (docNo === target || docNo.includes(target) || target.includes(docNo))) ||
    (!!docName && (docName.includes(target) || (!!trailing && trailing.length >= 4 && docName.includes(trailing))))
}

async function analyzeAviz(bytes: Buffer) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role:'user', content:[
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:bytes.toString('base64') } },
      { type:'text', text:`Analizeaza avizul de plata eMAG Marketplace (tabelul cu documentele platite).
Returneaza DOAR JSON valid:
{"numarAviz":"2027-4100118186","dataAviz":"2026-07-03","facturi":[{"categorie":"Factura comision","idDocument":"2027-1000507403","serieDocument":"C-MKTP-5683369","dataDocument":"2026-07-02","valoare":-34.82}]}
Extrage DOAR liniile care au "Serie document" real (nu "n/a") - acestea sunt facturile pentru care trebuie cautat si descarcat documentul din portalul eMAG.
Ignora liniile cu Serie document = "n/a" (incasari ramburs, incasari card online, retineri curier etc - nu sunt facturi de descarcat).
serieDocument = intreaga valoare din coloana "Serie document", COMPLETA, caracter cu caracter, fara sa scoti sau sa scurtezi vreo parte (prefixe precum "C-MKTP-" sau cifre precum "100" de la inceput NU se elimina).
valoare = numar (poate fi negativ), fara simbol monetar.` },
    ] }],
  })
  const text = response.content.filter(block=>block.type==='text').map(block=>(block as {text:string}).text).join('')
  const match = text.match(/\{[\s\S]*\}/)
  return match ? JSON.parse(match[0]) as { numarAviz?:string; dataAviz?:string; facturi?:ExtractedInvoice[] } : {}
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!lunaId) return NextResponse.json({})
  const sb = getServiceSupabase()

  const { data: avize, error } = await sb.from('documente')
    .select('id,furnizor,numar_document,fisier_nume,fisier_marime,created_at')
    .eq('luna_id', lunaId)
    .eq('modul', 'emag')
    .eq('tip_document', 'aviz_plata')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const documentIds = (avize || []).map(a => a.id)
  const { data: facturi } = documentIds.length
    ? await sb.from('emag_avize_facturi').select('*').in('document_id', documentIds)
    : { data: [] }

  const facturaDocIds = [...new Set((facturi || []).map(f => f.factura_document_id).filter(Boolean))]
  const { data: facturaDocs } = facturaDocIds.length
    ? await sb.from('documente').select('id,fisier_nume').in('id', facturaDocIds)
    : { data: [] }
  const facturaDocById = new Map((facturaDocs || []).map(d => [d.id, d.fisier_nume]))
  const linkedFacturaIds = new Set(facturaDocIds)

  const { data: emagFacturiDocs } = await sb.from('documente')
    .select('id,fisier_path,fisier_nume,furnizor,numar_document')
    .eq('luna_id', lunaId)
    .eq('modul', 'emag')
    .eq('tip_document', 'factura')
    .like('fisier_path', '%/emag-facturi/%')

  const orphanByTask: Record<string, OrphanInvoice[]> = {}
  for (const doc of emagFacturiDocs || []) {
    if (linkedFacturaIds.has(doc.id)) continue
    const taskKey = doc.furnizor || taskKeyFromPath(doc.fisier_path)
    if (!taskKey) continue
    if (!orphanByTask[taskKey]) orphanByTask[taskKey] = []
    orphanByTask[taskKey].push({
      id: doc.id,
      task_key: taskKey,
      numar_document: doc.numar_document || null,
      fisier_nume: doc.fisier_nume,
    })
  }

  const facturiEnriched = (facturi || []).map(f => ({
    ...f,
    valuta: currencyForTaskKey(f.task_key),
    factura_fisier_nume: f.factura_document_id ? facturaDocById.get(f.factura_document_id) || null : null,
  }))

  const result: Record<string, { documentId:string|null; avizNumber:string; fisierNume:string; invoices:typeof facturiEnriched; orphanInvoices?:OrphanInvoice[] }> = {}
  for (const a of avize || []) {
    result[a.furnizor || ''] = {
      documentId: a.id,
      avizNumber: a.numar_document || '',
      fisierNume: a.fisier_nume,
      invoices: facturiEnriched.filter(f => f.document_id === a.id),
      orphanInvoices: orphanByTask[a.furnizor || ''] || [],
    }
  }
  for (const [taskKey, orphanInvoices] of Object.entries(orphanByTask)) {
    if (result[taskKey]) continue
    result[taskKey] = {
      documentId: null,
      avizNumber: '',
      fisierNume: '',
      invoices: [],
      orphanInvoices,
    }
  }
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const taskKey = fd.get('taskKey') as string
    if (!file || !firmaId || !lunaId || !taskKey)
      return NextResponse.json({ error: 'Adaugă PDF-ul avizului, firma, luna și task-ul' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    if (file.type !== 'application/pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      return NextResponse.json({ error: 'Este acceptat doar un fișier PDF' }, { status: 422 })

    let extracted: { numarAviz?:string; dataAviz?:string; facturi?:ExtractedInvoice[] } = {}
    try { extracted = await analyzeAviz(bytes) } catch {}

    const avizNumber = String(extracted.numarAviz || '')
    const fileName = `${safePart(avizNumber || 'aviz', 'aviz')}_${Date.now()}.pdf`
    const path = `${firmaId}/${lunaId}/emag-avize/${taskKey}/${fileName}`

    const sb = getServiceSupabase()
    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: 'application/pdf' })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'emag',
      tip_document: 'aviz_plata',
      furnizor: taskKey,
      numar_document: avizNumber,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: 'application/pdf',
      fisier_marime: bytes.length,
      in_zip: true,
    }).select('id').single()
    if (error || !doc) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: error?.message || 'Eroare salvare' }, { status: 500 })
    }

    const invoices = extracted.facturi || []
    const valuta = currencyForTaskKey(taskKey)
    let inserted: unknown[] = []
    if (invoices.length) {
      const rows = invoices.map(inv => ({
        document_id: doc.id,
        luna_id: lunaId,
        task_key: taskKey,
        categorie: inv.categorie || '',
        id_document: inv.idDocument || '',
        serie_document: inv.serieDocument || '',
        numar_cautare: inv.serieDocument || '',
        data_document: inv.dataDocument || '',
        valoare: Number(inv.valoare) || 0,
      }))
      const { data: insertedRows, error: insError } = await sb.from('emag_avize_facturi').insert(rows).select('*')
      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
      const { data: existingDocs } = await sb.from('documente')
        .select('id,fisier_nume,numar_document')
        .eq('luna_id', lunaId)
        .eq('modul', 'emag')
        .eq('tip_document', 'factura')
        .eq('furnizor', taskKey)
        .like('fisier_path', `%/emag-facturi/${taskKey}/%`)

      const usedDocs = new Set<string>()
      for (const row of insertedRows || []) {
        const match = (existingDocs || []).find(existingDoc => !usedDocs.has(existingDoc.id) && invoiceMatches(row.numar_cautare, { ...existingDoc, task_key: taskKey }))
        if (!match) continue
        usedDocs.add(match.id)
        await sb.from('emag_avize_facturi').update({ factura_document_id: match.id }).eq('id', row.id)
        row.factura_document_id = match.id
      }
      inserted = (insertedRows || []).map(row => ({ ...row, valuta }))
    }

    return NextResponse.json({ ok: true, documentId: doc.id, avizNumber, fisierNume: fileName, invoices: inserted })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Avizul lipsește' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: document } = await sb.from('documente').select('id,fisier_path').eq('id', id).eq('modul', 'emag').eq('tip_document', 'aviz_plata').single()
  if (!document) return NextResponse.json({ error: 'Avizul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from('documente').remove([document.fisier_path])
  return NextResponse.json({ ok: true })
}
