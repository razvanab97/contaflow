import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function normalize(value: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Token-uri posibile pentru potrivire: codul complet + doar partea numerica finala
// (fisierele descarcate de pe eMAG pot sa nu includa prefixul de tip "C-MKTP-")
function candidateTokens(numarCautare: string) {
  const full = normalize(numarCautare)
  const trailing = normalize(String(numarCautare || '').match(/(\d+)$/)?.[1] || '')
  return [...new Set([full, trailing].filter(Boolean))]
}

async function extractInvoiceCode(bytes: Buffer): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{ role:'user', content:[
      { type:'document', source:{ type:'base64', media_type:'application/pdf', data:bytes.toString('base64') } },
      { type:'text', text:`Acesta e o factura descarcata din portalul eMAG Marketplace (seller). Extrage codul/seria facturii asa cum apare pe document (ex: "C-MKTP-5683369" sau un numar precum "1001781716"). Raspunde DOAR cu codul, fara alt text.` },
    ] }],
  })
  return response.content.filter(b => b.type === 'text').map(b => (b as {text:string}).text).join('').trim()
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const files = fd.getAll('files') as File[]
  const documentId = fd.get('documentId') as string
  const firmaId = fd.get('firmaId') as string
  const lunaId = fd.get('lunaId') as string
  if (!files.length || !documentId || !firmaId || !lunaId)
    return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: facturi } = await sb.from('emag_avize_facturi')
    .select('id,task_key,numar_cautare,factura_document_id')
    .eq('document_id', documentId)
  const available = (facturi || []).filter(f => !f.factura_document_id)

  const matched: { fileName:string; numarCautare:string }[] = []
  const unmatched: { fileName:string; reason:string }[] = []

  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer())
    const normalizedName = normalize(file.name)

    let target = available.find(f => !f.factura_document_id &&
      candidateTokens(f.numar_cautare).some(tok => tok.length >= 4 && normalizedName.includes(tok)))

    if (!target) {
      try {
        const code = await extractInvoiceCode(bytes)
        const codeTokens = candidateTokens(code)
        if (codeTokens.length) {
          target = available.find(f => !f.factura_document_id &&
            candidateTokens(f.numar_cautare).some(tok => tok.length >= 4 && codeTokens.some(ct => ct.length >= 4 && (ct.includes(tok) || tok.includes(ct)))))
        }
      } catch {}
    }

    if (!target) {
      unmatched.push({ fileName: file.name, reason: 'Nu s-a putut asocia cu nicio factură din aviz' })
      continue
    }

    const isPdf = file.type === 'application/pdf' || bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
    const extension = isPdf ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${safePart(target.numar_cautare || 'factura', 'factura')}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${extension}`
    const path = `${firmaId}/${lunaId}/emag-facturi/${target.task_key}/${fileName}`

    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
    if (storageError) { unmatched.push({ fileName: file.name, reason: storageError.message }); continue }

    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId,
      luna_id: lunaId,
      modul: 'emag',
      tip_document: 'factura',
      furnizor: target.task_key,
      numar_document: target.numar_cautare,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: file.type,
      fisier_marime: bytes.length,
      in_zip: true,
    }).select('id').single()
    if (error || !doc) {
      await sb.storage.from('documente').remove([path])
      unmatched.push({ fileName: file.name, reason: error?.message || 'Eroare salvare' })
      continue
    }

    const { error: updError } = await sb.from('emag_avize_facturi').update({ factura_document_id: doc.id }).eq('id', target.id)
    if (updError) { unmatched.push({ fileName: file.name, reason: updError.message }); continue }

    target.factura_document_id = doc.id
    matched.push({ fileName: file.name, numarCautare: target.numar_cautare })
  }

  return NextResponse.json({ matched, unmatched })
}
