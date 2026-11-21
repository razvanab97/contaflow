import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { codNou, statusActValid, stareZonaValida, zonaValida, tipDocActValid, ZONE_SOCIALE, type StatusAct } from '@/lib/proiect-social'
import { getSablon, caleStorage, VALORI_IMPLICITE } from '@/lib/proiect-social-sabloane'
import { umpleSablon } from '@/lib/docxFill'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Modulul „Activități sociale" al proiectului AB Textile: activitățile create în fiecare zonă
// (AS-NNN/AN), ciclul de viață al zonelor pe an și documentele atașate unei activități (în tabelul
// `documente`, modul 'activitati_sociale', `activitate_sociala_id` = activitatea).
// Zonele (activitățile din plan) sunt fixe în lib/proiect-social.ts — aici nu se inventează nimic.

const MODUL = 'activitati_sociale'
const COL_ACT = 'id,zona,cod,denumire,an,perioada,obiectiv,beneficiari_estimat,beneficiari_realizat,responsabil,parteneri,status,rezultate,validat_la,date_documente,created_at'
const COL_DOC = 'id,fisier_nume,fisier_tip,fisier_marime,furnizor,data_document,tip_document,fisier_path,activitate_sociala_id,beneficiar_social_id,nr_inregistrare,created_at'
const DOCX_TIP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const TIPURI_FISIER = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])

const prefix = (firmaId: string, actId: string) => `${firmaId}/activitati-sociale/${actId}/`
const prefixZona = (firmaId: string, zona: string, an: number) => `${firmaId}/activitati-sociale/zona/${zona}/${an}/` // documente atașate direct unei zone (fără activitate)
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

  // Descarcă un draft (șablon standard) completat cu valorile implicite, fără să-l salveze în sistem
  const draftTip = req.nextUrl.searchParams.get('draft')
  if (draftTip) {
    const sablon = getSablon(draftTip)
    if (!sablon) return NextResponse.json({ error: 'Șablon necunoscut' }, { status: 404 })
    const an = anValid(req.nextUrl.searchParams.get('an')) || new Date().getFullYear()
    const valori: Record<string, string> = { AN: String(an) }
    for (const c of sablon.campuri) if (VALORI_IMPLICITE[c.key]) valori[c.key] = VALORI_IMPLICITE[c.key]
    const t = azi(); valori.DATA = `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`
    const { data: tmpl, error } = await sb.storage.from('documente').download(caleStorage(sablon))
    if (error || !tmpl) return NextResponse.json({ error: 'Șablonul nu a putut fi citit' }, { status: 500 })
    let bytes: Uint8Array
    try { bytes = await umpleSablon(new Uint8Array(await tmpl.arrayBuffer()), valori) } catch { return NextResponse.json({ error: 'Generarea a eșuat' }, { status: 500 }) }
    return new NextResponse(Buffer.from(bytes), { headers: antet(`${sablon.label}.docx`, DOCX_TIP, req.nextUrl.searchParams.get('preview') === '1') })
  }

  // Descarcă documentele ca ZIP: o activitate (zip=activitate&activitateId=Y) sau tot anul (zip=tot&an=Z, pe foldere de zonă/activitate)
  const zipMod = req.nextUrl.searchParams.get('zip')
  if (zipMod) {
    const numeZona = (cod: string) => { const z = ZONE_SOCIALE.find(x => x.cod === cod); return z ? `${z.nr} ${z.titlu}` : cod }
    const sigur = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]+/g, '_').trim().slice(0, 80) || 'document'
    const intrari: { path: string; nume: string; folder: string }[] = []
    let numeZip = 'Documente-sociale'
    if (zipMod === 'activitate') {
      const activitateId = String(req.nextUrl.searchParams.get('activitateId') || '')
      const { data: act } = await sb.from('activitati_sociale').select('cod,denumire').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
      if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
      const { data } = await sb.from('documente').select('fisier_path,fisier_nume').eq('firma_id', firmaId).eq('modul', MODUL).eq('activitate_sociala_id', activitateId).order('created_at', { ascending: true })
      for (const d of data || []) if (d.fisier_path) intrari.push({ path: d.fisier_path, nume: d.fisier_nume || 'document', folder: '' })
      numeZip = sigur(`${act.cod} ${act.denumire}`)
    } else if (zipMod === 'tot') {
      const an = anValid(req.nextUrl.searchParams.get('an')) || new Date().getFullYear()
      const { data: acts } = await sb.from('activitati_sociale').select('id,cod,denumire,zona').eq('firma_id', firmaId).eq('an', an)
      const actMap = new Map((acts || []).map(a => [a.id, a]))
      const actIds = (acts || []).map(a => a.id)
      if (actIds.length) {
        const { data } = await sb.from('documente').select('fisier_path,fisier_nume,activitate_sociala_id').eq('firma_id', firmaId).eq('modul', MODUL).in('activitate_sociala_id', actIds)
        for (const d of data || []) { if (!d.fisier_path) continue; const a = actMap.get(d.activitate_sociala_id as string); intrari.push({ path: d.fisier_path, nume: d.fisier_nume || 'document', folder: a ? `${sigur(numeZona(a.zona))}/${sigur(a.cod + ' ' + a.denumire)}` : 'Activitati' }) }
      }
      const { data: dz } = await sb.from('documente').select('fisier_path,fisier_nume,zona_sociala').eq('firma_id', firmaId).eq('modul', MODUL).is('activitate_sociala_id', null).not('zona_sociala', 'is', null).eq('an_social', an)
      for (const d of dz || []) if (d.fisier_path) intrari.push({ path: d.fisier_path, nume: d.fisier_nume || 'document', folder: sigur(numeZona(d.zona_sociala as string)) })
      numeZip = `Activitati-sociale ${an}`
    } else return NextResponse.json({ error: 'Parametru zip invalid' }, { status: 400 })
    if (!intrari.length) return NextResponse.json({ error: 'Nu există documente de descărcat' }, { status: 404 })
    const zip = new JSZip(); const folosite = new Set<string>()
    for (const it of intrari) {
      const { data: f } = await sb.storage.from('documente').download(it.path)
      if (!f) continue
      let nume = (it.folder ? it.folder + '/' : '') + it.nume
      let i = 2; while (folosite.has(nume)) { const p = nume.lastIndexOf('.'); nume = p > 0 ? `${nume.slice(0, p)} (${i})${nume.slice(p)}` : `${nume} (${i})`; i++ }
      folosite.add(nume); zip.file(nume, await f.arrayBuffer())
    }
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    return new NextResponse(Buffer.from(bytes), { headers: antet(`${numeZip}.zip`, 'application/zip', false) })
  }

  const [a, z, dd, o, b, maxNr, dz] = await Promise.all([
    sb.from('activitati_sociale').select(COL_ACT).eq('firma_id', firmaId).order('an', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('zone_sociale_an').select('zona,an,status,nota').eq('firma_id', firmaId),
    (async () => { // documentele; dacă migrarea coloanelor `stare`/`este_draft` n-a rulat încă, reîncearcă fără ele (nu rupe pagina)
      const q = (col: string) => sb.from('documente').select(col).eq('firma_id', firmaId).eq('modul', MODUL).not('activitate_sociala_id', 'is', null).order('created_at', { ascending: false })
      const r = await q(COL_DOC + ',stare,este_draft')
      return r.error ? await q(COL_DOC) : r
    })(),
    sb.from('zone_sociale').select('zona,ordine').eq('firma_id', firmaId),
    sb.from('beneficiari_sociali').select('id,activitate_id,nume,date,created_at').eq('firma_id', firmaId).order('created_at', { ascending: true }),
    sb.from('documente').select('nr_inregistrare').eq('firma_id', firmaId).eq('modul', MODUL).not('nr_inregistrare', 'is', null).order('nr_inregistrare', { ascending: false }).limit(1),
    (async () => { // documente atașate direct unei zone (fără activitate); dacă migrarea n-a rulat, întoarce gol
      const q = (col: string) => sb.from('documente').select(col).eq('firma_id', firmaId).eq('modul', MODUL).is('activitate_sociala_id', null).not('zona_sociala', 'is', null).order('created_at', { ascending: false })
      let r = await q(COL_DOC + ',zona_sociala,an_social,stare,este_draft')
      if (r.error) r = await q(COL_DOC + ',zona_sociala,an_social,stare') // coloana este_draft lipsește încă
      return r.error ? { data: [] } : r
    })(),
  ])
  if (a.error && !tabelLipsa(a.error)) return NextResponse.json({ error: a.error.message }, { status: 500 })
  return NextResponse.json({
    activitati: a.data || [],
    zoneStari: z.data || [],
    documente: dd.data || [],
    documenteZona: dz.data || [],
    zoneOrdine: o.data || [],
    beneficiari: b.data || [],
    urmatorNr: ((maxNr.data?.[0]?.nr_inregistrare as number) || 0) + 1,
    migrat: !tabelLipsa(a.error),
  })
}

// URL-uri de încărcare semnate (fișiere mari, direct din browser în storage) pentru o activitate SAU o zonă.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { firmaId?: string; activitateId?: string; zona?: string; an?: number; fisiere?: { nume: string; tip: string; marime: number }[] }
  if (!b.firmaId || !b.fisiere?.length) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const sb = getServiceSupabase()
  let pfx: string
  if (b.activitateId) {
    const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', b.activitateId).eq('firma_id', b.firmaId).maybeSingle()
    if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
    pfx = prefix(b.firmaId, b.activitateId)
  } else if (b.zona && zonaValida(b.zona) && anValid(b.an)) {
    pfx = prefixZona(b.firmaId, b.zona, anValid(b.an)!)
  } else return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  const out = []
  for (const f of b.fisiere.slice(0, 30)) {
    if (!TIPURI_FISIER.has(f.tip)) { out.push({ nume: f.nume, eroare: 'doar PDF, imagini, Word sau Excel' }); continue }
    if (f.marime > 50 * 1024 * 1024) { out.push({ nume: f.nume, eroare: 'mai mare de 50 MB' }); continue }
    const path = `${pfx}${Date.now()}_${numeSigur(f.nume)}`
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
    if (error) {
      // 23514 = check constraint (vechea constrângere nu cunoaște încă 'in_lucru')
      const migrare = tabelLipsa(error) || error.code === '23514' || /status_check|constraint/i.test(error.message || '')
      return NextResponse.json({ error: migrare ? 'Rulează migrarea supabase_activitati_sociale.sql (actualizează stările de zonă)' : error.message }, { status: migrare ? 409 : 500 })
    }
    return NextResponse.json({ stare: data })
  }

  if (b.actiune === 'ordine-zona') {
    const coduri = (Array.isArray(b.ordine) ? b.ordine : []).map(String).filter(zonaValida)
    if (!coduri.length) return NextResponse.json({ error: 'Ordine invalidă' }, { status: 400 })
    const randuri = coduri.map((zona, i) => ({ firma_id: firmaId, zona, ordine: i }))
    const { error } = await sb.from('zone_sociale').upsert(randuri, { onConflict: 'firma_id,zona' })
    if (error) return NextResponse.json({ error: tabelLipsa(error) ? 'Rulează migrarea supabase_activitati_sociale.sql' : error.message }, { status: tabelLipsa(error) ? 409 : 500 })
    return NextResponse.json({ ok: true, ordine: randuri.map(r => ({ zona: r.zona, ordine: r.ordine })) })
  }

  // Adaugă sau modifică un beneficiar al unei activități.
  if (b.actiune === 'beneficiar') {
    const activitateId = String(b.activitateId || ''), id = b.id ? String(b.id) : null
    const nume = txt(b.nume, 150)
    if (!nume) return NextResponse.json({ error: 'Adaugă un nume' }, { status: 400 })
    const dateIn = (b.date && typeof b.date === 'object') ? b.date as Record<string, unknown> : {}
    const date: Record<string, string> = {}
    for (const [k, v] of Object.entries(dateIn)) { if (!/^[A-Z0-9_]{1,30}$/.test(k)) continue; const val = txt(v, 300); if (val) date[k] = val }
    if (id) {
      const { data, error } = await sb.from('beneficiari_sociali').update({ nume, date, updated_at: new Date().toISOString() }).eq('id', id).eq('firma_id', firmaId).select('id,activitate_id,nume,date,created_at').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ beneficiar: data })
    }
    const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
    if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
    const { data, error } = await sb.from('beneficiari_sociali').insert({ firma_id: firmaId, activitate_id: activitateId, nume, date }).select('id,activitate_id,nume,date,created_at').single()
    if (error) return NextResponse.json({ error: tabelLipsa(error) ? 'Rulează migrarea supabase_activitati_sociale.sql' : error.message }, { status: tabelLipsa(error) ? 409 : 500 })
    return NextResponse.json({ beneficiar: data })
  }

  // Salvează datele comune ale documentelor pe o activitate (perioadă, ore, coordonator…).
  if (b.actiune === 'date-documente') {
    const activitateId = String(b.activitateId || '')
    const dateIn = (b.date && typeof b.date === 'object') ? b.date as Record<string, unknown> : {}
    const date: Record<string, string> = {}
    for (const [k, v] of Object.entries(dateIn)) { if (!/^[A-Z0-9_]{1,30}$/.test(k)) continue; const val = txt(v, 300); if (val) date[k] = val }
    const { data, error } = await sb.from('activitati_sociale').update({ date_documente: date, updated_at: new Date().toISOString() }).eq('id', activitateId).eq('firma_id', firmaId).select(COL_ACT).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ activitate: data })
  }

  // Editează numărul de înregistrare al unui document.
  if (b.actiune === 'nr-document') {
    const docId = String(b.docId || ''), nr = (b.nr === null || b.nr === '') ? null : Math.trunc(Number(b.nr))
    if (!docId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    if (nr !== null && (!Number.isFinite(nr) || nr < 0)) return NextResponse.json({ error: 'Număr invalid' }, { status: 400 })
    const { data, error } = await sb.from('documente').update({ nr_inregistrare: nr }).eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ document: data })
  }

  // Starea documentului: „în lucru" (încă se lucrează) ↔ „emis" (final). null/absent = emis.
  if (b.actiune === 'stare-doc') {
    const docId = String(b.docId || '')
    const stare = b.stare === 'in_lucru' ? 'in_lucru' : null
    if (!docId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    const { data, error } = await sb.from('documente').update({ stare }).eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',stare').single()
    if (error) return NextResponse.json({ error: /stare/i.test(error.message || '') ? 'Rulează migrarea (lipsește coloana „stare" din documente)' : error.message }, { status: /stare/i.test(error.message || '') ? 409 : 500 })
    return NextResponse.json({ document: data })
  }

  // Marchează un document ca „draft" (șablon reutilizabil în zonă) ↔ „de moment" (atașament simplu).
  if (b.actiune === 'marcheaza-draft') {
    const docId = String(b.docId || '')
    if (!docId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    const { data, error } = await sb.from('documente').update({ este_draft: !!b.draft }).eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) return NextResponse.json({ error: /este_draft/i.test(error.message || '') ? 'Rulează migrarea (lipsește coloana „este_draft")' : error.message }, { status: /este_draft/i.test(error.message || '') ? 409 : 500 })
    return NextResponse.json({ document: data })
  }

  // „Pune în lucru" un document (draft încărcat): îi completează marcajele %%...%% cu datele zonei/activității și salvează o copie editabilă în zonă.
  if (b.actiune === 'pune-in-lucru-doc') {
    const docId = String(b.docId || '')
    const zonaDoc = String(b.zona || ''), anDoc = anValid(b.an)
    if (!docId || !zonaDoc || !zonaValida(zonaDoc) || !anDoc) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    const { data: sursa } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!sursa?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    const { data: orig, error: dlErr } = await sb.storage.from('documente').download(sursa.fisier_path)
    if (dlErr || !orig) return NextResponse.json({ error: 'Documentul nu a putut fi citit' }, { status: 500 })
    const inBytes = new Uint8Array(await orig.arrayBuffer())
    const esteDocx = /\.docx$/i.test(sursa.fisier_nume || '') || /wordprocessing/.test(sursa.fisier_tip || '')
    // câmpuri comune ale activității zonei (dacă există o activitate) + implicite + agregat
    const { data: act } = await sb.from('activitati_sociale').select('id,date_documente').eq('firma_id', firmaId).eq('zona', zonaDoc).eq('an', anDoc).order('created_at', { ascending: true }).limit(1)
    const comune = (act?.[0]?.date_documente || {}) as Record<string, string>
    const valori: Record<string, string> = { ...VALORI_IMPLICITE, ...comune, AN: String(anDoc) }
    const t = azi(); valori.DATA = `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`
    if (act?.[0]?.id) { const { count } = await sb.from('beneficiari_sociali').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('activitate_id', act[0].id); if (count != null) valori.NR_VOLUNTARI = String(count) }
    let outBytes: Uint8Array = inBytes
    if (esteDocx) { try { outBytes = await umpleSablon(inBytes, valori) } catch { outBytes = inBytes } }
    const path = `${prefixZona(firmaId, zonaDoc, anDoc)}${Date.now()}_pus_in_lucru.docx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(outBytes), { contentType: sursa.fisier_tip || DOCX_TIP })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const nume = (sursa.fisier_nume || 'document').replace(/\.docx$/i, '') + ' (în lucru).docx'
    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: MODUL, activitate_sociala_id: null, zona_sociala: zonaDoc, an_social: anDoc, este_draft: false,
      tip_document: 'dovada', furnizor: nume, data_document: t, fisier_path: path, fisier_nume: nume, fisier_tip: sursa.fisier_tip || DOCX_TIP, fisier_marime: outBytes.length, in_zip: false,
    }).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ document: doc })
  }

  // Generează un document dintr-un șablon (umplut cu date + nr. de înregistrare automat).
  if (b.actiune === 'genereaza') {
    const activitateId = String(b.activitateId || ''), tip = String(b.tip || '')
    const sablon = getSablon(tip)
    if (!sablon) return NextResponse.json({ error: 'Șablon necunoscut' }, { status: 400 })
    const { data: act } = await sb.from('activitati_sociale').select('id,an,date_documente').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
    if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })

    // câmpuri = datele comune ale activității, altfel valorile implicite
    const comune = (act.date_documente || {}) as Record<string, string>
    const valori: Record<string, string> = {}
    for (const c of sablon.campuri) {
      if (comune[c.key]) valori[c.key] = comune[c.key]
      else if (VALORI_IMPLICITE[c.key]) valori[c.key] = VALORI_IMPLICITE[c.key]
    }
    if (!valori.AN) valori.AN = String(act.an)
    let beneficiarId: string | null = null, titluPersoana = ''
    if (sablon.nivel === 'beneficiar') {
      beneficiarId = String(b.beneficiarId || '')
      const { data: ben } = await sb.from('beneficiari_sociali').select('id,nume,date').eq('id', beneficiarId).eq('firma_id', firmaId).maybeSingle()
      if (!ben) return NextResponse.json({ error: 'Beneficiarul nu a fost găsit' }, { status: 404 })
      Object.assign(valori, (ben.date || {}) as Record<string, string>) // datele personale au prioritate
      if (!valori.NUME) valori.NUME = ben.nume
      valori.CONFIRMARE = ben.nume
      titluPersoana = ben.nume
    }

    // document existent pentru (activitate, beneficiar, tip) → îl actualizăm în loc (păstrăm numărul)
    let existQ = sb.from('documente').select('id,nr_inregistrare,fisier_path').eq('firma_id', firmaId).eq('modul', MODUL).eq('activitate_sociala_id', activitateId).eq('tip_document', tip)
    existQ = beneficiarId ? existQ.eq('beneficiar_social_id', beneficiarId) : existQ.is('beneficiar_social_id', null)
    const { data: exist } = await existQ.maybeSingle()

    let nr: number
    if (b.nr != null && b.nr !== '') { nr = Math.trunc(Number(b.nr)); if (!Number.isFinite(nr) || nr < 0) return NextResponse.json({ error: 'Număr invalid' }, { status: 400 }) }
    else if (exist?.nr_inregistrare != null) nr = exist.nr_inregistrare as number
    else { const { data: mx } = await sb.from('documente').select('nr_inregistrare').eq('firma_id', firmaId).eq('modul', MODUL).not('nr_inregistrare', 'is', null).order('nr_inregistrare', { ascending: false }).limit(1); nr = ((mx?.[0]?.nr_inregistrare as number) || 0) + 1 }
    // data documentului: aleasă (b.dataDoc) > datele comune (DATA) > azi
    const iso = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null
    const dataIso = iso(b.dataDoc) || iso(comune.DATA) || azi()
    valori.NR_INREG = String(nr)
    valori.DATA = `${dataIso.slice(8, 10)}.${dataIso.slice(5, 7)}.${dataIso.slice(0, 4)}`

    const { data: tmpl, error: dlErr } = await sb.storage.from('documente').download(caleStorage(sablon))
    if (dlErr || !tmpl) return NextResponse.json({ error: 'Șablonul nu a putut fi citit din storage' }, { status: 500 })
    let bytes: Uint8Array
    try { bytes = await umpleSablon(new Uint8Array(await tmpl.arrayBuffer()), valori) } catch (e) { return NextResponse.json({ error: `Generarea a eșuat: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 }) }

    const path = `${firmaId}/activitati-sociale/${activitateId}/generat/${Date.now()}_${sablon.tip}.docx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(bytes), { contentType: DOCX_TIP })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const camp = {
      nr_inregistrare: nr, tip_document: tip, furnizor: `${sablon.label}${titluPersoana ? ' · ' + titluPersoana : ''}`,
      data_document: dataIso, fisier_path: path, fisier_nume: `${sablon.label}${titluPersoana ? ' - ' + titluPersoana : ''} - nr ${nr}.docx`,
      fisier_tip: DOCX_TIP, fisier_marime: bytes.length,
    }
    if (exist) {
      const { data: doc, error } = await sb.from('documente').update(camp).eq('id', exist.id).select(COL_DOC).single()
      if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }) }
      if (exist.fisier_path && exist.fisier_path !== path) await sb.storage.from('documente').remove([exist.fisier_path])
      return NextResponse.json({ document: doc, nr, actualizat: true })
    }
    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: MODUL, activitate_sociala_id: activitateId, beneficiar_social_id: beneficiarId, in_zip: false, ...camp,
    }).select(COL_DOC).single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ document: doc, nr })
  }

  // Generează un document editabil dintr-un șablon, direct într-o zonă (fără activitate/beneficiar).
  // Se completează AN + DATA (azi) + valorile implicite (coordonator, locul…); restul marcajelor rămân linii de completat în Word.
  if (b.actiune === 'genereaza-zona') {
    const zonaDoc = String(b.zona || ''), anDoc = anValid(b.an), tip = String(b.tip || '')
    const sablon = getSablon(tip)
    if (!sablon) return NextResponse.json({ error: 'Șablon necunoscut' }, { status: 400 })
    if (!zonaDoc || !zonaValida(zonaDoc) || !anDoc) return NextResponse.json({ error: 'Zonă sau an invalid' }, { status: 400 })
    const valori: Record<string, string> = { AN: String(anDoc) }
    for (const c of sablon.campuri) if (VALORI_IMPLICITE[c.key]) valori[c.key] = VALORI_IMPLICITE[c.key]
    const t = azi()
    valori.DATA = `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`
    const { data: tmpl, error: dlErr } = await sb.storage.from('documente').download(caleStorage(sablon))
    if (dlErr || !tmpl) return NextResponse.json({ error: 'Șablonul nu a putut fi citit din storage' }, { status: 500 })
    let bytes: Uint8Array
    try { bytes = await umpleSablon(new Uint8Array(await tmpl.arrayBuffer()), valori) } catch (e) { return NextResponse.json({ error: `Generarea a eșuat: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 }) }
    const path = `${prefixZona(firmaId, zonaDoc, anDoc)}${Date.now()}_${sablon.tip}.docx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(bytes), { contentType: DOCX_TIP })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: MODUL, activitate_sociala_id: null, zona_sociala: zonaDoc, an_social: anDoc,
      tip_document: tip, furnizor: sablon.label, data_document: t,
      fisier_path: path, fisier_nume: `${sablon.label}.docx`, fisier_tip: DOCX_TIP, fisier_marime: bytes.length, in_zip: false,
    }).select(COL_DOC + ',zona_sociala,an_social').single() // include zona/an ca documentul nou să treacă filtrul din UI
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: /zona_sociala|an_social/i.test(error.message) ? 'Rulează migrarea (coloane zonă lipsă)' : error.message }, { status: /zona_sociala|an_social/i.test(error.message) ? 409 : 500 }) }
    return NextResponse.json({ document: doc })
  }

  if (b.actiune === 'inregistreaza-doc') {
    const activitateId = String(b.activitateId || '')
    const zonaDoc = String(b.zona || ''), anDoc = anValid(b.an)
    const incarcate = (b.incarcate as { path: string; nume: string; tip: string; marime: number }[]) || []
    if (!incarcate.length) return NextResponse.json({ error: 'Nimic de înregistrat' }, { status: 400 })
    // scope: o activitate (activitateId) SAU o zonă (zona + an, document atașat direct zonei)
    let pfx: string, coloane: Record<string, unknown>
    if (activitateId) {
      const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
      if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
      pfx = prefix(firmaId, activitateId); coloane = { activitate_sociala_id: activitateId }
    } else if (zonaDoc && zonaValida(zonaDoc) && anDoc) {
      pfx = prefixZona(firmaId, zonaDoc, anDoc); coloane = { activitate_sociala_id: null, zona_sociala: zonaDoc, an_social: anDoc }
    } else return NextResponse.json({ error: 'Lipsește activitatea sau zona' }, { status: 400 })
    const tip = tipDocActValid(b.tip)
    const selCols = activitateId ? COL_DOC : COL_DOC + ',zona_sociala,an_social' // doc de zonă → întoarce și zona/an, ca să treacă filtrul din UI
    const adaugate = [], erori: string[] = []
    for (const f of incarcate) {
      if (!f.path?.startsWith(pfx)) { erori.push(`${f.nume}: cale invalidă`); continue }
      const { data, error } = await sb.from('documente').insert({
        firma_id: firmaId, luna_id: null, modul: MODUL, ...coloane,
        tip_document: tip, furnizor: f.nume, data_document: azi(),
        fisier_path: f.path, fisier_nume: f.nume, fisier_tip: f.tip, fisier_marime: f.marime, in_zip: false,
      }).select(selCols).single()
      if (error) { await sb.storage.from('documente').remove([f.path]); erori.push(`${f.nume}: ${/zona_sociala|an_social/i.test(error.message) ? 'rulează migrarea (coloane zonă lipsă)' : error.message}`); continue }
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

  // Șterge un beneficiar (documentele lui generate rămân în activitate).
  const beneficiar = req.nextUrl.searchParams.get('beneficiar')
  if (beneficiar) {
    const { error } = await sb.from('beneficiari_sociali').delete().eq('id', beneficiar).eq('firma_id', firmaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Șterge o activitate (+ documentele ei + beneficiarii + fișierele din storage).
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
