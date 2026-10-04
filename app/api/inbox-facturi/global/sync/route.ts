import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { importInboxDocument, detecteazaDocumenteMultiple } from '@/lib/inbox-facturi'
import { pdfPageCount, extractPageRange } from '@/lib/pdfBatch'
import { currentWorkMonthKey } from '@/lib/accounting-period'

export const dynamic = 'force-dynamic'
// Vercel Hobby opreste functia la 60s indiferent de valoarea declarata - lucram pe un buget de
// timp si ne oprim curat inainte, cu fiecare fisier marcat in coada imediat ce e gata. Clientul
// (Dashboard) / cron-ul apeleaza din nou pana `ramase` ajunge la 0.
export const maxDuration = 60
const BUGET_MS = 28_000

type Sb = ReturnType<typeof getServiceSupabase>
type Rand = { id: string; fisier_path: string; fisier_nume: string; fisier_tip: string }

function safeName(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]+/g, '_').slice(0, 120) || 'document'
}

// Un PDF care contine mai multe facturi (ex. export ANAF SPV/Oblio) se imparte O SINGURA DATA in
// fisiere separate, puse inapoi in coada ca randuri proprii - fiecare se proceseaza, se vede si se
// atribuie individual (o factura nerecunoscuta nu mai blocheaza tot pachetul si nu se reia totul).
async function imparteInCoada(sb: Sb, file: Rand, bytes: Uint8Array): Promise<number | null> {
  if (file.fisier_tip !== 'application/pdf') return null
  let pagini = 0
  try { pagini = await pdfPageCount(Buffer.from(bytes)) } catch { return null }
  if (pagini <= 1) return null
  const segmente = await detecteazaDocumenteMultiple(bytes)
  if (!segmente || segmente.length <= 1) return null

  const baza = file.fisier_nume.replace(/\.[^.]+$/, '')
  let create = 0
  for (const seg of segmente) {
    const buc = new Uint8Array(await extractPageRange(Buffer.from(bytes), seg.pageStart, seg.pageEnd))
    const hash = crypto.createHash('sha256').update(buc).digest('hex')
    const nume = `${baza} · factura ${create + 1} (pag. ${seg.pageStart}${seg.pageEnd > seg.pageStart ? `-${seg.pageEnd}` : ''}).pdf`
    const path = `_watch-global/${hash.slice(0, 12)}_${safeName(nume)}`
    const { error: upErr } = await sb.storage.from('documente').upload(path, buc, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`Împărțirea pachetului a eșuat: ${upErr.message}`)
    const { error: insErr } = await sb.from('inbox_watch_files').insert({
      fisier_path: path, fisier_nume: nume, fisier_tip: 'application/pdf', fisier_marime: buc.length,
      document_hash: hash, status: 'pending',
    })
    if (insErr && !/duplicate key|unique/i.test(insErr.message)) throw new Error(`Împărțirea pachetului a eșuat: ${insErr.message}`)
    create++
  }
  return create
}

async function proceseaza(sb: Sb, file: Rand, luna: string, firmaImplicita: string) {
  const { data: blob, error: downloadError } = await sb.storage.from('documente').download(file.fisier_path)
  if (downloadError || !blob) {
    await sb.from('inbox_watch_files').update({ status: 'eroare', error_message: downloadError?.message || 'Fișierul nu a putut fi citit', synced_at: new Date().toISOString() }).eq('id', file.id)
    return { fisier: file.fisier_nume, status: 'eroare', firma: null as string | null }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())

  try {
    const bucati = await imparteInCoada(sb, file, bytes)
    if (bucati) {
      await sb.from('inbox_watch_files').update({
        status: 'imported',
        error_message: `Pachet împărțit în ${bucati} facturi separate — fiecare apare separat și se procesează individual.`,
        synced_at: new Date().toISOString(),
      }).eq('id', file.id)
      await sb.storage.from('documente').remove([file.fisier_path])
      return { fisier: file.fisier_nume, status: 'impartit', firma: null, bucati }
    }

    const r = await importInboxDocument({
      sb, bytes, mediaType: file.fisier_tip, originalName: file.fisier_nume,
      firmaId: firmaImplicita, lunaId: '', luna,
      sourceLabel: 'Folder local (Personal Computer)', requireDetectedFirm: true,
    })
    const status = r.skipped ? 'nedetectat' : r.duplicate ? 'duplicat' : 'imported'
    await sb.from('inbox_watch_files').update({
      status,
      error_message: r.skipped ? r.skipReason || null : null,
      firma_id: r.doc?.firma_id || null,
      luna_id: r.doc?.luna_id || null,
      document_id: r.doc?.id || null,
      synced_at: new Date().toISOString(),
    }).eq('id', file.id)
    if (status !== 'nedetectat') await sb.storage.from('documente').remove([file.fisier_path])
    return { fisier: file.fisier_nume, status, firma: r.targetFirma, asociat: !!r.doc?.tranzactie_id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import eșuat'
    await sb.from('inbox_watch_files').update({ status: 'eroare', error_message: message, synced_at: new Date().toISOString() }).eq('id', file.id)
    return { fisier: file.fisier_nume, status: 'eroare', firma: null }
  }
}

// POST: proceseaza fisierele "pending" din coada (cele mai vechi intai) cat permite bugetul de timp.
// Body optional: { reincearca: id } -> pune un fisier cu eroare inapoi in coada.
// Fisierele cu eroare NU se reiau automat (altfel un fisier problematic ar consuma la nesfarsit
// fiecare sincronizare si le-ar bloca pe celelalte).
export async function POST(req: NextRequest) {
  const start = Date.now()
  const body = await req.json().catch(() => ({}))
  const sb = getServiceSupabase()
  const luna = currentWorkMonthKey()

  if (body?.reincearca) {
    // si "nedetectat": o factura fara firma pe ea poate fi atribuita dupa plata, odata ce extrasul e importat
    await sb.from('inbox_watch_files').update({ status: 'pending', error_message: null }).eq('id', String(body.reincearca)).in('status', ['eroare', 'nedetectat'])
  }

  const { data: anyFirma } = await sb.from('firme').select('id').eq('activa', true).limit(1).single()
  if (!anyFirma) return NextResponse.json({ error: 'Nu există nicio firmă activă' }, { status: 400 })

  const rezultate: { fisier: string; status: string; firma: string | null; asociat?: boolean; bucati?: number }[] = []
  while (Date.now() - start < BUGET_MS) {
    const { data: next, error } = await sb.from('inbox_watch_files')
      .select('id,fisier_path,fisier_nume,fisier_tip')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const file = next?.[0] as Rand | undefined
    if (!file) break
    rezultate.push(await proceseaza(sb, file, luna, anyFirma.id))
  }

  const { count } = await sb.from('inbox_watch_files').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  return NextResponse.json({
    total: rezultate.length,
    imported: rezultate.filter(r => r.status === 'imported').length,
    asociate: rezultate.filter(r => r.asociat).length,
    duplicate: rezultate.filter(r => r.status === 'duplicat').length,
    nedetectat: rezultate.filter(r => r.status === 'nedetectat').length,
    eroare: rezultate.filter(r => r.status === 'eroare').length,
    impartite: rezultate.filter(r => r.status === 'impartit').length,
    ramase: count || 0,
    rezultate,
  })
}
