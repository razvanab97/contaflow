import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { codNou, statusActValid, stareZonaValida, zonaValida, tipDocActValid, type StatusAct } from '@/lib/proiect-social'

export const dynamic = 'force-dynamic'

// Modulul „Activități sociale" al proiectului AB Textile: activitățile create în fiecare zonă
// (AS-NNN/AN), ciclul de viață al zonelor pe an și documentele atașate unei activități (în tabelul
// `documente`, modul 'activitati_sociale', `activitate_sociala_id` = activitatea).
// Zonele (activitățile din plan) sunt fixe în lib/proiect-social.ts — aici nu se inventează nimic.

const MODUL = 'activitati_sociale'
const COL_ACT = 'id,zona,cod,denumire,an,perioada,obiectiv,beneficiari_estimat,beneficiari_realizat,responsabil,parteneri,status,rezultate,validat_la,created_at'
const COL_DOC = 'id,fisier_nume,fisier_tip,fisier_marime,furnizor,data_document,tip_document,fisier_path,activitate_sociala_id,created_at'
const TIPURI_FISIER = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])

const prefix = (firmaId: string, actId: string) => `${firmaId}/activitati-sociale/${actId}/`
const numeSigur = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-90)
const azi = () => new Date().toISOString().slice(0, 10)
const txt = (v: unknown, max = 500) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null }
const dataValida = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null
const intPoz = (v: unknown): number | null => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null }
const anValid = (v: unknown): number | null => { const n = Math.trunc(Number(v)); return n >= 2024 && n <= 2035 ? n : null }
// Tabelele pot lipsi până se rulează migrarea — tratăm „relația nu există" ca listă goală.
const tabelLipsa = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || /does not exist|not exist|schema cache/i.test(e.message || ''))

function antet(nume: string, tip: string, inline: boolean) {
  const ascii = nume.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  return { 'Content-Type': tip || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nume)}` }
}

export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  // Descărcare / preview document
  const id = req.nextUrl.searchParams.get('download')
  if (id) {
    const { data: d } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', id).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!d?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    const { data: file, error } = await sb.storage.from('documente').download(d.fisier_path)
    if (error || !file) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
    return new NextResponse(Buffer.from(await file.arrayBuffer()), { headers: antet(d.fisier_nume || 'document', d.fisier_tip || file.type, req.nextUrl.searchParams.get('preview') === '1') })
  }

  const [a, z, dd] = await Promise.all([
    sb.from('activitati_sociale').select(COL_ACT).eq('firma_id', firmaId).order('an', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('zone_sociale_an').select('zona,an,status,nota').eq('firma_id', firmaId),
    sb.from('documente').select(COL_DOC).eq('firma_id', firmaId).eq('modul', MODUL).not('activitate_sociala_id', 'is', null).order('created_at', { ascending: false }),
  ])
  if (a.error && !tabelLipsa(a.error)) return NextResponse.json({ error: a.error.message }, { status: 500 })
  return NextResponse.json({
    activitati: a.data || [],
    zoneStari: z.data || [],
    documente: dd.data || [],
    migrat: !tabelLipsa(a.error),
  })
}

// URL-uri de încărcare semnate (fișiere mari, direct din browser în storage) pentru o activitate.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { firmaId?: string; activitateId?: string; fisiere?: { nume: string; tip: string; marime: number }[] }
  if (!b.firmaId || !b.activitateId || !b.fisiere?.length) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', b.activitateId).eq('firma_id', b.firmaId).maybeSingle()
  if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
  const out = []
  for (const f of b.fisiere.slice(0, 30)) {
    if (!TIPURI_FISIER.has(f.tip)) { out.push({ nume: f.nume, eroare: 'doar PDF, imagini, Word sau Excel' }); continue }
    if (f.marime > 50 * 1024 * 1024) { out.push({ nume: f.nume, eroare: 'mai mare de 50 MB' }); continue }
    const path = `${prefix(b.firmaId, b.activitateId)}${Date.now()}_${numeSigur(f.nume)}`
    const { data, error } = await sb.storage.from('documente').createSignedUploadUrl(path)
    out.push(error || !data ? { nume: f.nume, eroare: error?.message || 'nu s-a putut pregăti încărcarea' } : { nume: f.nume, path, url: data.signedUrl })
  }
  return NextResponse.json({ fisiere: out })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const firmaId = String(b.firmaId || '')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })
  const sb = getServiceSupabase()

  if (b.actiune === 'stare-zona') {
    const zona = String(b.zona || ''), an = anValid(b.an), status = stareZonaValida(b.status)
    if (!zonaValida(zona) || !an) return NextResponse.json({ error: 'Zonă sau an invalid' }, { status: 400 })
    const { data, error } = await sb.from('zone_sociale_an').upsert(
      { firma_id: firmaId, zona, an, status, nota: txt(b.nota, 300), updated_at: new Date().toISOString() },
      { onConflict: 'firma_id,zona,an' }).select('zona,an,status,nota').single()
    if (error) return NextResponse.json({ error: tabelLipsa(error) ? 'Rulează migrarea supabase_activitati_sociale.sql' : error.message }, { status: tabelLipsa(error) ? 409 : 500 })
    return NextResponse.json({ stare: data })
  }

  if (b.actiune === 'inregistreaza-doc') {
    const activitateId = String(b.activitateId || '')
    const incarcate = (b.incarcate as { path: string; nume: string; tip: string; marime: number }[]) || []
    if (!activitateId || !incarcate.length) return NextResponse.json({ error: 'Nimic de înregistrat' }, { status: 400 })
    const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
    if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
    const tip = tipDocActValid(b.tip)
    const adaugate = [], erori: string[] = []
    for (const f of incarcate) {
      if (!f.path?.startsWith(prefix(firmaId, activitateId))) { erori.push(`${f.nume}: cale invalidă`); continue }
      const { data, error } = await sb.from('documente').insert({
        firma_id: firmaId, luna_id: null, modul: MODUL, activitate_sociala_id: activitateId,
        tip_document: tip, furnizor: f.nume, data_document: azi(),
        fisier_path: f.path, fisier_nume: f.nume, fisier_tip: f.tip, fisier_marime: f.marime, in_zip: false,
      }).select(COL_DOC).single()
      if (error) { await sb.storage.from('documente').remove([f.path]); erori.push(`${f.nume}: ${error.message}`); continue }
      adaugate.push(data)
    }
    return NextResponse.json({ documente: adaugate, erori }, { status: adaugate.length ? 200 : 400 })
  }

  // Implicit: creează o activitate nouă într-o zonă.
  const zona = String(b.zona || ''), an = anValid(b.an), denumire = txt(b.denumire, 200)
  if (!zonaValida(zona)) return NextResponse.json({ error: 'Zonă invalidă' }, { status: 400 })
  if (!an) return NextResponse.json({ error: 'An invalid' }, { status: 400 })
  if (!denumire) return NextResponse.json({ error: 'Adaugă o denumire' }, { status: 400 })

  const { data: existente, error: eList } = await sb.from('activitati_sociale').select('cod').eq('firma_id', firmaId).eq('an', an)
  if (eList && tabelLipsa(eList)) return NextResponse.json({ error: 'Rulează migrarea supabase_activitati_sociale.sql' }, { status: 409 })
  const cod = codNou(existente || [], an)
  const { data, error } = await sb.from('activitati_sociale').insert({
    firma_id: firmaId, zona, cod, denumire, an,
    perioada: txt(b.perioada, 120), obiectiv: txt(b.obiectiv, 1000),
    beneficiari_estimat: intPoz(b.beneficiari_estimat), responsabil: txt(b.responsabil, 150), parteneri: txt(b.parteneri, 300),
    status: 'planificata',
  }).select(COL_ACT).single()
  if (error) return NextResponse.json({ error: tabelLipsa(error) ? 'Rulează migrarea supabase_activitati_sociale.sql' : error.message }, { status: tabelLipsa(error) ? 409 : 500 })
  return NextResponse.json({ activitate: data })
}

// Modifică o activitate (câmpuri / status). Trecerea la „validata" înregistrează momentul validării.
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const firmaId = String(b.firmaId || ''), id = String(b.id || '')
  if (!firmaId || !id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.denumire !== undefined) { const v = txt(b.denumire, 200); if (!v) return NextResponse.json({ error: 'Denumirea nu poate fi goală' }, { status: 400 }); patch.denumire = v }
  if (b.perioada !== undefined) patch.perioada = txt(b.perioada, 120)
  if (b.obiectiv !== undefined) patch.obiectiv = txt(b.obiectiv, 1000)
  if (b.responsabil !== undefined) patch.responsabil = txt(b.responsabil, 150)
  if (b.parteneri !== undefined) patch.parteneri = txt(b.parteneri, 300)
  if (b.rezultate !== undefined) patch.rezultate = txt(b.rezultate, 2000)
  if (b.beneficiari_estimat !== undefined) patch.beneficiari_estimat = intPoz(b.beneficiari_estimat)
  if (b.beneficiari_realizat !== undefined) patch.beneficiari_realizat = intPoz(b.beneficiari_realizat)
  if (b.an !== undefined) { const a = anValid(b.an); if (a) patch.an = a }
  if (b.status !== undefined) {
    const s: StatusAct = statusActValid(b.status)
    patch.status = s
    patch.validat_la = s === 'validata' ? new Date().toISOString() : null
  }
  const { data, error } = await getServiceSupabase().from('activitati_sociale').update(patch).eq('id', id).eq('firma_id', firmaId).select(COL_ACT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activitate: data })
}

export async function DELETE(req: NextRequest) {
  const sb = getServiceSupabase()
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  // Șterge un singur document al unei activități.
  const doc = req.nextUrl.searchParams.get('doc')
  if (doc) {
    const { data: d } = await sb.from('documente').select('fisier_path').eq('id', doc).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!d) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    await sb.from('documente').delete().eq('id', doc)
    if (d.fisier_path) await sb.storage.from('documente').remove([d.fisier_path])
    return NextResponse.json({ ok: true })
  }

  // Șterge o activitate (+ documentele ei + fișierele din storage).
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', id).eq('firma_id', firmaId).maybeSingle()
  if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
  const { data: docs } = await sb.from('documente').select('id,fisier_path').eq('firma_id', firmaId).eq('modul', MODUL).eq('activitate_sociala_id', id)
  const cai = (docs || []).map(d => d.fisier_path).filter(Boolean) as string[]
  if (docs?.length) await sb.from('documente').delete().eq('activitate_sociala_id', id)
  if (cai.length) await sb.storage.from('documente').remove(cai)
  const { error } = await sb.from('activitati_sociale').delete().eq('id', id).eq('firma_id', firmaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
