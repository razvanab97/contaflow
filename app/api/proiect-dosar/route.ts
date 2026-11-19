import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getDosarConfig, tipValid, type DosarConfig } from '@/lib/proiect-dosar'

export const dynamic = 'force-dynamic'

// Dosarul proiectului AB Textile: sectiunile de documente pe tot proiectul (Angajati / Activitate / Social),
// fiecare un repository de fisiere in `documente` cu modul 'dosar_*', luna_id null, firma = proiectul.
// `furnizor` = numele/titlul documentului, `data_document` = data lui, `tip_document` = tipul (din config, pentru
// bifa „ce cere vizita”). Fisierele stau in <firmaId>/dosar/<sectiune>/. Sectiunea vine din ?sectiune=.
// La Activitate se pot aduce copii ale balantelor/extraselor din firma AB Textile (POST actiune=copiaza-din-firma).

const COLOANE = 'id,fisier_nume,fisier_tip,fisier_marime,furnizor,data_document,tip_document,fisier_path,created_at'
const TIPURI_FISIER = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])

const prefix = (firmaId: string, sectiune: string) => `${firmaId}/dosar/${sectiune}/`
const numeSigur = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-90)
const dataValida = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null
const numeValid = (c: unknown) => String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, 150)
const azi = () => new Date().toISOString().slice(0, 10)

// Numele/titlul documentului ghicit din numele fisierului, doar ca punct de plecare (se corecteaza din lista).
function numeDinFisier(nume: string) {
  const fara = nume.replace(/\.[a-z0-9]+$/i, '').replace(/[_.-]+/g, ' ')
  return (fara.replace(/\s+/g, ' ').trim() || nume).slice(0, 120)
}

function antet(nume: string, tip: string, inline: boolean) {
  const ascii = nume.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  return { 'Content-Type': tip || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nume)}` }
}

// Config-ul sectiunii din ?sectiune= (altfel 400).
function cerSectiune(req: NextRequest): { cfg: DosarConfig } | { error: NextResponse } {
  const cfg = getDosarConfig(req.nextUrl.searchParams.get('sectiune'))
  if (!cfg) return { error: NextResponse.json({ error: 'Secțiune necunoscută' }, { status: 400 }) }
  return { cfg }
}

export async function GET(req: NextRequest) {
  const s = cerSectiune(req); if ('error' in s) return s.error
  const { cfg } = s
  const sb = getServiceSupabase()
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const id = req.nextUrl.searchParams.get('download')
  if (id) {
    const { data: d } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', id).eq('firma_id', firmaId).eq('modul', cfg.modul).maybeSingle()
    if (!d?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    const { data: file, error } = await sb.storage.from('documente').download(d.fisier_path)
    if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
    return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: antet(d.fisier_nume || 'document', d.fisier_tip || file.type, req.nextUrl.searchParams.get('preview') === '1') })
  }

  const { data, error } = await sb.from('documente').select(COLOANE).eq('firma_id', firmaId).eq('modul', cfg.modul)
    .order('data_document', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documente: data || [] })
}

// Fisierele mari (Vercel refuza cererile peste 4,5 MB) se urca direct din browser in storage (URL semnat),
// apoi POST JSON le inregistreaza.
export async function PUT(req: NextRequest) {
  const s = cerSectiune(req); if ('error' in s) return s.error
  const { cfg } = s
  const b = await req.json().catch(() => ({})) as { firmaId?: string; fisiere?: { nume: string; tip: string; marime: number }[] }
  if (!b.firmaId || !b.fisiere?.length) return NextResponse.json({ error: 'Alege cel puțin un fișier' }, { status: 400 })
  const sb = getServiceSupabase()
  const out = []
  for (const f of b.fisiere.slice(0, 30)) {
    if (!TIPURI_FISIER.has(f.tip)) { out.push({ nume: f.nume, eroare: 'doar PDF, imagini, Word sau Excel' }); continue }
    if (f.marime > 50 * 1024 * 1024) { out.push({ nume: f.nume, eroare: 'mai mare de 50 MB' }); continue }
    const path = `${prefix(b.firmaId, cfg.sectiune)}${Date.now()}_${numeSigur(f.nume)}`
    const { data, error } = await sb.storage.from('documente').createSignedUploadUrl(path)
    out.push(error || !data ? { nume: f.nume, eroare: error?.message || 'nu s-a putut pregăti încărcarea' } : { nume: f.nume, path, url: data.signedUrl })
  }
  return NextResponse.json({ fisiere: out })
}

export async function POST(req: NextRequest) {
  const s = cerSectiune(req); if ('error' in s) return s.error
  const { cfg } = s
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    if (b.actiune === 'copiaza-din-firma') return copiazaDinFirma(cfg, b)
    return inregistreaza(cfg, b)
  }
  // Upload direct (fisiere mici) prin formData
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const nume = fd.get('nume') != null ? numeValid(fd.get('nume')) : ''
  const dataAleasa = fd.get('data') != null ? dataValida(fd.get('data')) : null
  const tip = tipValid(cfg, fd.get('tip') as string | null)
  const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (!firmaId || !files.length) return NextResponse.json({ error: 'Alege cel puțin un fișier' }, { status: 400 })
  const sb = getServiceSupabase()
  const adaugate = [], erori: string[] = []
  for (const file of files.slice(0, 30)) {
    if (!TIPURI_FISIER.has(file.type)) { erori.push(`${file.name}: tip de fișier neacceptat`); continue }
    if (file.size > 20 * 1024 * 1024) { erori.push(`${file.name}: mai mare de 20 MB`); continue }
    const path = `${prefix(firmaId, cfg.sectiune)}${Date.now()}_${numeSigur(file.name)}`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
    if (upErr) { erori.push(`${file.name}: ${upErr.message}`); continue }
    const { data, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: cfg.modul, tip_document: tip,
      furnizor: nume || numeDinFisier(file.name), data_document: dataAleasa || azi(),
      fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, fisier_marime: file.size, in_zip: false,
    }).select(COLOANE).single()
    if (error) { await sb.storage.from('documente').remove([path]); erori.push(`${file.name}: ${error.message}`); continue }
    adaugate.push(data)
  }
  return NextResponse.json({ documente: adaugate, erori }, { status: adaugate.length ? 200 : 400 })
}

async function inregistreaza(cfg: DosarConfig, b: Record<string, unknown>) {
  const firmaId = String(b.firmaId || '')
  const incarcate = (b.incarcate as { path: string; nume: string; tip: string; marime: number }[]) || []
  if (!firmaId || !incarcate.length) return NextResponse.json({ error: 'Nimic de înregistrat' }, { status: 400 })
  const nume = b.nume != null ? numeValid(b.nume) : ''
  const dataAleasa = b.data != null ? dataValida(b.data) : null
  const tip = tipValid(cfg, b.tip as string | null)
  const sb = getServiceSupabase()
  const adaugate = [], erori: string[] = []
  for (const f of incarcate) {
    if (!f.path?.startsWith(prefix(firmaId, cfg.sectiune))) { erori.push(`${f.nume}: cale invalidă`); continue }
    const { data, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: cfg.modul, tip_document: tip,
      furnizor: nume || numeDinFisier(f.nume), data_document: dataAleasa || azi(),
      fisier_path: f.path, fisier_nume: f.nume, fisier_tip: f.tip, fisier_marime: f.marime, in_zip: false,
    }).select(COLOANE).single()
    if (error) { await sb.storage.from('documente').remove([f.path]); erori.push(`${f.nume}: ${error.message}`); continue }
    adaugate.push(data)
  }
  return NextResponse.json({ documente: adaugate, erori }, { status: adaugate.length ? 200 : 400 })
}

// Aduce copii ale documentelor cerute si la vizita (balante + extrase) din firma AB Textile in proiect.
// Copiere server-to-server in storage (fara sa treaca fisierele prin Vercel). Sare peste ce e deja copiat
// (acelasi nume + tip in sectiune), ca sa poata fi apasat de mai multe ori fara duplicate.
async function copiazaDinFirma(cfg: DosarConfig, b: Record<string, unknown>) {
  const firmaId = String(b.firmaId || '')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  if (!cfg.copiazaDinFirma) return NextResponse.json({ error: 'Secțiunea nu suportă copierea din firmă' }, { status: 400 })
  const sb = getServiceSupabase()

  const { data: firma } = await sb.from('firme').select('id,nume').eq('slug', cfg.copiazaDinFirma.slugFirma).maybeSingle()
  if (!firma) return NextResponse.json({ error: 'Firma sursă nu a fost găsită' }, { status: 404 })

  // Ce exista deja in sectiune (dupa tip + nume + marime), ca sa nu copiem de doua ori acelasi fisier, dar sa
  // nu pierdem doua documente distincte cu acelasi nume (se deosebesc prin marime).
  const cheie = (tip: string, nume: string | null, marime: number | null) => `${tip}::${nume}::${marime ?? ''}`
  const { data: existente } = await sb.from('documente').select('fisier_nume,tip_document,fisier_marime').eq('firma_id', firmaId).eq('modul', cfg.modul)
  const amDeja = new Set((existente || []).map(d => cheie(d.tip_document, d.fisier_nume, d.fisier_marime)))

  let copiate = 0, sarite = 0; const erori: string[] = []
  for (const m of cfg.copiazaDinFirma.mapari) {
    const { data: surse } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip,fisier_marime,data_document')
      .eq('firma_id', firma.id).eq('modul', m.modul).not('fisier_path', 'is', null).limit(500)
    for (const d of surse || []) {
      if (!d.fisier_path) continue
      if (amDeja.has(cheie(m.tip, d.fisier_nume, d.fisier_marime))) { sarite++; continue }
      const dest = `${prefix(firmaId, cfg.sectiune)}${Date.now()}_${numeSigur(d.fisier_nume || 'document')}`
      const { error: copyErr } = await sb.storage.from('documente').copy(d.fisier_path, dest)
      if (copyErr) { erori.push(`${d.fisier_nume}: ${copyErr.message}`); continue }
      const { error } = await sb.from('documente').insert({
        firma_id: firmaId, luna_id: null, modul: cfg.modul, tip_document: m.tip,
        furnizor: d.fisier_nume || m.eticheta, data_document: d.data_document || azi(),
        fisier_path: dest, fisier_nume: d.fisier_nume, fisier_tip: d.fisier_tip, fisier_marime: d.fisier_marime, in_zip: false,
      })
      if (error) { await sb.storage.from('documente').remove([dest]); erori.push(`${d.fisier_nume}: ${error.message}`); continue }
      amDeja.add(cheie(m.tip, d.fisier_nume, d.fisier_marime)); copiate++
    }
  }
  return NextResponse.json({ copiate, sarite, erori, firma: firma.nume })
}

// Numele/titlul, data, tipul documentului, redenumirea fisierului
export async function PATCH(req: NextRequest) {
  const s = cerSectiune(req); if ('error' in s) return s.error
  const { cfg } = s
  const b = await req.json().catch(() => ({})) as Record<string, string | null>
  if (!b.firmaId || !b.id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const patch: Record<string, string | null> = {}
  if (typeof b.fisier_nume === 'string' && b.fisier_nume.trim()) patch.fisier_nume = b.fisier_nume.trim().slice(0, 200)
  if (b.nume !== undefined) patch.furnizor = numeValid(b.nume)
  if (b.data_document !== undefined) patch.data_document = dataValida(b.data_document)
  if (b.tip !== undefined) patch.tip_document = tipValid(cfg, b.tip)
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nimic de modificat' }, { status: 400 })
  const { data, error } = await getServiceSupabase().from('documente').update(patch).eq('id', b.id).eq('firma_id', b.firmaId).eq('modul', cfg.modul).select(COLOANE).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data })
}

export async function DELETE(req: NextRequest) {
  const s = cerSectiune(req); if ('error' in s) return s.error
  const { cfg } = s
  const firmaId = req.nextUrl.searchParams.get('firmaId'), id = req.nextUrl.searchParams.get('id')
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: d } = await sb.from('documente').select('fisier_path').eq('id', id).eq('firma_id', firmaId).eq('modul', cfg.modul).maybeSingle()
  if (!d) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
  const { error } = await sb.from('documente').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (d.fisier_path) await sb.storage.from('documente').remove([d.fisier_path])
  return NextResponse.json({ ok: true })
}
