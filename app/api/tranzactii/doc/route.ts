import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'
import { syncComandaNote } from '@/lib/comandaNote'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

function fmtDataRo(s: string) {
  const [y, m, d] = String(s || '').split('-')
  return y && m && d ? `${d}.${m}.${y}` : String(s || '')
}

// Adauga o stampila discreta cu data tranzactiei pe prima pagina a PDF-ului,
// ca sa fie vizibila direct pe document, nu doar in numele fisierului.
async function stampPdfWithDate(buf: Buffer, dataTranzactie: string): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
    const page = pdfDoc.getPages()[0]
    if (!page) return buf
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const label = `Tranzactie extras: ${fmtDataRo(dataTranzactie)}`
    const size = 8
    const width = page.getWidth()
    page.drawText(label, {
      x: Math.max(8, width - font.widthOfTextAtSize(label, size) - 12),
      y: 10,
      size,
      font,
      color: rgb(0.55, 0.55, 0.55),
    })
    return Buffer.from(await pdfDoc.save())
  } catch {
    // PDF criptat/corupt, nu poate fi editat - il incarcam nemodificat
    return buf
  }
}
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function filenamePart(value: string, fallback = '') {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return normalized || fallback
}

function shortReference(value?: string | null) {
  const firstPart = String(value || '').split(';')[0]?.trim() || ''
  const numeric = firstPart.match(/\d+/)?.[0]
  return numeric || firstPart
}

function sameDocNumber(a?: string | null, b?: string | null) {
  const ca = String(a || '').toLowerCase().replace(/\s+/g, '')
  const cb = String(b || '').toLowerCase().replace(/\s+/g, '')
  return !!ca && !!cb && ca === cb
}

function supplierMatch(a?: string | null, b?: string | null) {
  const ca = String(a || '').split('|')[0]?.toLowerCase().trim() || ''
  const cb = String(b || '').toLowerCase().trim()
  return ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))
}

async function markMatchingRestantePaid(firmaId: string, tx: any, furnizor: string, numDoc: string) {
  const restRes = await fetch(
    `${SB}/rest/v1/documente?firma_id=eq.${encodeURIComponent(firmaId)}&platit=eq.false&or=(fisier_path.like.*%2Ffacturi-restante%2F*,fisier_path.like.*%2Finbox-facturi%2F*)&select=id,numar_document,furnizor,suma`,
    { headers: H }
  )
  if (!restRes.ok) return
  const rest = await restRes.json()
  if (!Array.isArray(rest) || !rest.length) return
  const txSuma = Math.abs(Number(tx.suma))
  const ids = rest
    .filter((doc: any) => sameDocNumber(doc.numar_document, numDoc) || (
      supplierMatch(doc.furnizor, furnizor || tx.descriere_curatata || tx.descriere) &&
      doc.suma != null &&
      Math.abs(Math.abs(Number(doc.suma)) - txSuma) <= 0.01
    ))
    .map((doc: any) => doc.id)
  if (!ids.length) return
  await fetch(`${SB}/rest/v1/documente?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ platit: true, data_platii: tx.data_tranzactie })
  })
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const files = fd.getAll('file').filter((item): item is File => item instanceof File && item.size > 0)
    const txId = fd.get('txId') as string
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const tip = (fd.get('tip') as string) || 'factura'
    const furnizor = (fd.get('furnizor') as string) || ''
    const numDoc = (fd.get('numDoc') as string) || ''
    const mode = (fd.get('mode') as string) || 'replace'
    const sumaField = fd.get('suma') as string | null
    const sumaFactura = sumaField && !Number.isNaN(Number(sumaField)) ? Number(sumaField) : null

    if (!files.length || !txId || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă pentru asocierea documentului' }, { status: 400 })
    if (files.some(file => !ALLOWED_TYPES.has(file.type)))
      return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

    const txRes = await fetch(
      `${SB}/rest/v1/tranzactii?id=eq.${encodeURIComponent(txId)}&firma_id=eq.${encodeURIComponent(firmaId)}&select=id,extras_id,document_id,data_tranzactie,descriere_curatata,descriere,suma,valuta,referinta`,
      { headers: H }
    )
    const txs = txRes.ok ? await txRes.json() : []
    const tx = Array.isArray(txs) ? txs[0] : null
    if (!tx?.id)
      return NextResponse.json({ error: 'Tranzacția nu a fost găsită pentru firma selectată' }, { status: 404 })

    const orderRef = shortReference(tx.referinta)
    const documents: { docId: string; filename: string }[] = []
    let primaryDocId = tx.document_id as string | null

    for (const [idx, file] of files.entries()) {
      let buf: Buffer = Buffer.from(await file.arrayBuffer())
      if (file.type === 'application/pdf') buf = await stampPdfWithDate(buf, tx.data_tranzactie)
      const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
      const details = furnizor || tx.descriere_curatata || tx.descriere || 'document'
      const renamedFile = [
        filenamePart(tx.data_tranzactie, 'fara_data'),
        filenamePart(Number(tx.suma).toFixed(2), 'fara_suma'),
        filenamePart(tx.valuta || '', ''),
        orderRef ? filenamePart(`comanda_${orderRef}`) : '',
        filenamePart(details, 'document'),
        numDoc ? filenamePart(numDoc) : '',
        files.length > 1 ? `anexa_${idx + 1}` : '',
      ].filter(Boolean).join('_') + `.${extension}`
      const path = `${firmaId}/${lunaId}/tx/${txId}_${Date.now()}_${idx}_${renamedFile}`

      const upRes = await fetch(`${SB}/storage/v1/object/documente/${path}`, {
        method: 'POST',
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
        body: new Uint8Array(buf)
      })
      if (!upRes.ok) return NextResponse.json({ error: 'Storage: ' + await upRes.text() }, { status: 500 })

      const documentBody = {
        firma_id: firmaId, luna_id: lunaId, tranzactie_id: txId,
        modul: 'extras', tip_document: tip, furnizor, numar_document: numDoc || orderRef,
        // La atasare suplimentara (mode=add), fiecare factura poate acoperi doar o parte din
        // suma tranzactiei - folosim suma introdusa pentru ea, nu suma intregii tranzactii,
        // altfel notele/rapoartele ar aduna gresit de mai multe ori acelasi total.
        suma: sumaFactura ?? Math.abs(Number(tx.suma)),
        data_document: tx.data_tranzactie,
        fisier_path: path, fisier_nume: renamedFile, fisier_tip: file.type,
        fisier_marime: buf.length, in_zip: true
      }
      // mode='add': tranzactia poate avea mai multe facturi - nu suprascrie documentul existent, adauga unul nou.
      // La incarcare multipla initiala, primul document devine principal, restul raman atasate aceleiasi tranzactii/comenzi.
      const shouldReplace = mode === 'replace' && !!tx.document_id && idx === 0
      const docRes = await fetch(
        shouldReplace
          ? `${SB}/rest/v1/documente?id=eq.${encodeURIComponent(tx.document_id)}`
          : `${SB}/rest/v1/documente`,
        {
          method: shouldReplace ? 'PATCH' : 'POST',
          headers: { ...H, 'Prefer': 'return=representation' },
          body: JSON.stringify(documentBody)
        }
      )
      const docs = await docRes.json()
      const doc = Array.isArray(docs) ? docs[0] : docs
      if (!docRes.ok || !doc?.id) return NextResponse.json({ error: 'DB doc: ' + JSON.stringify(doc) }, { status: 500 })
      if (!primaryDocId) primaryDocId = doc.id
      documents.push({ docId: doc.id, filename: renamedFile })
    }

    // La adaugare suplimentara, document_id (documentul "principal") se seteaza doar daca tranzactia nu avea deja unul.
    if (primaryDocId && (mode !== 'add' || !tx.document_id)) {
      const updateRes = await fetch(`${SB}/rest/v1/tranzactii?id=eq.${encodeURIComponent(txId)}`, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ document_id: primaryDocId, note: null, status_note: null })
      })
      if (!updateRes.ok)
        return NextResponse.json({ error: 'Tranzacția nu a putut fi actualizată' }, { status: 500 })
    }

    const countRes = await fetch(
      `${SB}/rest/v1/tranzactii?extras_id=eq.${encodeURIComponent(tx.extras_id)}&document_id=not.is.null&select=id`,
      { headers: { ...H, 'Prefer': 'count=exact' } }
    )
    const documented = countRes.ok ? (await countRes.json()).length : null
    if (documented !== null) {
      await fetch(`${SB}/rest/v1/extrase?id=eq.${encodeURIComponent(tx.extras_id)}`, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ nr_documentate: documented })
      })
    }
    await markMatchingRestantePaid(firmaId, tx, furnizor, numDoc || orderRef)
    await syncComandaNote(getServiceSupabase(), txId)

    return NextResponse.json({ ok: true, docId: documents[0]?.docId, filename: documents[0]?.filename, documents, count: documents.length })
  } catch (error) {
    const message = String(error)
    const status = message.includes('Content-Type') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
