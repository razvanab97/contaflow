import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Contracte colaboratori (sectiune pe firma, doar la firmele reale - nu la proiect): contractele primite de la
// colaboratori, fiecare salvat cu NUMELE colaboratorului si DATA contractului. Sunt randuri in `documente` cu
// modul 'contracte_colaboratori', fara luna (luna_id null), fisierele in <firmaId>/contracte-colaboratori/.
// Numele colaboratorului sta in `furnizor` (apare asa si in cautarea globala a firmei); data in `data_document`.

const MODUL = 'contracte_colaboratori'
const prefix = (firmaId: string) => `${firmaId}/contracte-colaboratori/`
const COLOANE = 'id,fisier_nume,fisier_tip,fisier_marime,furnizor,data_document,fisier_path,created_at'
const TIPURI_FISIER = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'])

const numeSigur = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-90)
const dataValida = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null
const colaboratorValid = (c: unknown) => String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, 150)
const azi = () => new Date().toISOString().slice(0, 10)

// Numele colaboratorului ghicit din numele fisierului (ex. "Contract_Popescu_Ion_2026.pdf" -> "Popescu Ion"),
// doar ca punct de plecare - se poate corecta direct in lista.
function colaboratorDinNume(nume: string) {
  const fara = nume.replace(/\.[a-z0-9]+$/i, '').replace(/[_.-]+/g, ' ')
  const curat = fara.replace(/\b(contract|colaborare|colaborator|prestari|servicii|psi|ssm|semnat|scanat|scan|final|copie|v\d+|\d{4})\b/gi, ' ').replace(/\s+/g, ' ').trim()
  return (curat || fara.trim()).slice(0, 120)
}

function antet(nume: string, tip: string, inline: boolean) {
  const ascii = nume.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  return { 'Content-Type': tip || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nume)}` }
}

export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const id = req.nextUrl.searchParams.get('download')
  if (id) {
    const { data: d } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', id).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!d?.fisier_path) return NextResponse.json({ error: 'Contractul nu a fost găsit' }, { status: 404 })
    const { data: file, error } = await sb.storage.from('documente').download(d.fisier_path)
    if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
    return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: antet(d.fisier_nume || 'contract', d.fisier_tip || file.type, req.nextUrl.searchParams.get('preview') === '1') })
  }

  const { data, error } = await sb.from('documente').select(COLOANE).eq('firma_id', firmaId).eq('modul', MODUL).order('data_document', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contracte: data || [] })
}

// Fisierele mari (Vercel refuza cererile peste 4,5 MB) se urca direct din browser in storage:
// PUT {firmaId, fisiere:[{nume,tip,marime}]} -> URL-uri semnate de upload; apoi POST JSON {firmaId, incarcate:[...]} le inregistreaza.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { firmaId?: string; fisiere?: { nume: string; tip: string; marime: number }[] }
  if (!b.firmaId || !b.fisiere?.length) return NextResponse.json({ error: 'Alege cel puțin un fișier' }, { status: 400 })
  const sb = getServiceSupabase()
  const out = []
  for (const f of b.fisiere.slice(0, 30)) {
    if (!TIPURI_FISIER.has(f.tip)) { out.push({ nume: f.nume, eroare: 'doar PDF, imagini sau Word' }); continue }
    if (f.marime > 50 * 1024 * 1024) { out.push({ nume: f.nume, eroare: 'mai mare de 50 MB' }); continue }
    const path = `${prefix(b.firmaId)}${Date.now()}_${numeSigur(f.nume)}`
    const { data, error } = await sb.storage.from('documente').createSignedUploadUrl(path)
    out.push(error || !data ? { nume: f.nume, eroare: error?.message || 'nu s-a putut pregăti încărcarea' } : { nume: f.nume, path, url: data.signedUrl })
  }
  return NextResponse.json({ fisiere: out })
}

// Unul sau mai multe fisiere odata; numele colaboratorului/data se pot da pentru tot lotul, altfel numele se
// ghiceste din fisier si data e cea de azi (ambele se pot corecta apoi din lista).
export async function POST(req: NextRequest) {
  if ((req.headers.get('content-type') || '').includes('application/json')) return inregistreaza(req)
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const colAles = fd.get('colaborator') != null ? colaboratorValid(fd.get('colaborator')) : ''
  const dataAleasa = fd.get('data') != null ? dataValida(fd.get('data')) : null
  const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (!firmaId || !files.length) return NextResponse.json({ error: 'Alege cel puțin un fișier' }, { status: 400 })
  const sb = getServiceSupabase()
  const adaugate = [], erori: string[] = []
  for (const file of files.slice(0, 30)) {
    if (!TIPURI_FISIER.has(file.type)) { erori.push(`${file.name}: doar PDF, imagini sau Word`); continue }
    if (file.size > 20 * 1024 * 1024) { erori.push(`${file.name}: mai mare de 20 MB`); continue }
    const path = `${prefix(firmaId)}${Date.now()}_${numeSigur(file.name)}`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
    if (upErr) { erori.push(`${file.name}: ${upErr.message}`); continue }
    const { data, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: MODUL, tip_document: 'contract_colaborator',
      furnizor: colAles || colaboratorDinNume(file.name), data_document: dataAleasa || azi(),
      fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, fisier_marime: file.size, in_zip: false,
    }).select(COLOANE).single()
    if (error) { await sb.storage.from('documente').remove([path]); erori.push(`${file.name}: ${error.message}`); continue }
    adaugate.push(data)
  }
  return NextResponse.json({ contracte: adaugate, erori }, { status: adaugate.length ? 200 : 400 })
}

async function inregistreaza(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { firmaId?: string; colaborator?: string; data?: string; incarcate?: { path: string; nume: string; tip: string; marime: number }[] }
  if (!b.firmaId || !b.incarcate?.length) return NextResponse.json({ error: 'Nimic de înregistrat' }, { status: 400 })
  const colAles = b.colaborator != null ? colaboratorValid(b.colaborator) : ''
  const dataAleasa = b.data != null ? dataValida(b.data) : null
  const sb = getServiceSupabase()
  const adaugate = [], erori: string[] = []
  for (const f of b.incarcate) {
    if (!f.path.startsWith(prefix(b.firmaId))) { erori.push(`${f.nume}: cale invalidă`); continue }
    const { data, error } = await sb.from('documente').insert({
      firma_id: b.firmaId, luna_id: null, modul: MODUL, tip_document: 'contract_colaborator',
      furnizor: colAles || colaboratorDinNume(f.nume), data_document: dataAleasa || azi(),
      fisier_path: f.path, fisier_nume: f.nume, fisier_tip: f.tip, fisier_marime: f.marime, in_zip: false,
    }).select(COLOANE).single()
    if (error) { await sb.storage.from('documente').remove([f.path]); erori.push(`${f.nume}: ${error.message}`); continue }
    adaugate.push(data)
  }
  return NextResponse.json({ contracte: adaugate, erori }, { status: adaugate.length ? 200 : 400 })
}

// Numele colaboratorului, data contractului, redenumirea fisierului
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, string | null>
  if (!b.firmaId || !b.id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const patch: Record<string, string | null> = {}
  if (typeof b.fisier_nume === 'string' && b.fisier_nume.trim()) patch.fisier_nume = b.fisier_nume.trim().slice(0, 200)
  if (b.colaborator !== undefined) patch.furnizor = colaboratorValid(b.colaborator)
  if (b.data_document !== undefined) patch.data_document = dataValida(b.data_document)
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nimic de modificat' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('documente').update(patch).eq('id', b.id).eq('firma_id', b.firmaId).eq('modul', MODUL).select(COLOANE).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contract: data })
}

export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId'), id = req.nextUrl.searchParams.get('id')
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: d } = await sb.from('documente').select('fisier_path').eq('id', id).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
  if (!d) return NextResponse.json({ error: 'Contractul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.storage.from('documente').remove([d.fisier_path])
  return NextResponse.json({ ok: true })
}
