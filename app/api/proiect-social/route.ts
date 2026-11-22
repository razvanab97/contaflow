import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { codNou, statusActValid, stareZonaValida, zonaValida, tipDocActValid, ZONE_SOCIALE, type StatusAct } from '@/lib/proiect-social'
import { getSablon, caleStorage, VALORI_IMPLICITE, TIP_LUCRU } from '@/lib/proiect-social-sabloane'
import { umpleSablon } from '@/lib/docxFill'
import { extrageContextBlanks, umpleBlanks } from '@/lib/docxBlanks'
import { analizeazaDocument } from '@/lib/ai/pregateste-doc'
import { extragePerioadaPostari } from '@/lib/ai/perioada-postari'
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
// aritmetică de date (ISO) pentru „Decizia cu 7 zile înainte / Raportul la o lună după"
const minusZile = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
const plusLuni = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); const zi = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const ultima = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(zi, ultima)); return d.toISOString().slice(0, 10) }
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
function perioadaRo(prima: string, ultima: string | null): string {
  const f = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d } }
  const a = f(prima), b = ultima ? f(ultima) : null
  if (!b || prima === ultima) return `${a.d} ${LUNI_RO[a.m - 1]} ${a.y}`
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${LUNI_RO[a.m - 1]} ${a.y}`
  if (a.y === b.y) return `${a.d} ${LUNI_RO[a.m - 1]} – ${b.d} ${LUNI_RO[b.m - 1]} ${a.y}`
  return `${a.d} ${LUNI_RO[a.m - 1]} ${a.y} – ${b.d} ${LUNI_RO[b.m - 1]} ${b.y}`
}
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
    (async () => { // beneficiari; dacă migrarea coloanei `finalizat` n-a rulat încă, reîncearcă fără ea
      const q = (col: string) => sb.from('beneficiari_sociali').select(col).eq('firma_id', firmaId).order('created_at', { ascending: true })
      const r = await q('id,activitate_id,nume,date,finalizat,created_at')
      return r.error ? await q('id,activitate_id,nume,date,created_at') : r
    })(),
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

  // Marchează o persoană (voluntar/beneficiar) ca „finalizat" ↔ nefinalizat. Indicatorul zonelor pe
  // persoane numără cei finalizați, fără validarea activității.
  if (b.actiune === 'beneficiar-finalizat') {
    const id = String(b.id || '')
    if (!id) return NextResponse.json({ error: 'Beneficiar lipsă' }, { status: 400 })
    const { data, error } = await sb.from('beneficiari_sociali').update({ finalizat: !!b.finalizat, updated_at: new Date().toISOString() }).eq('id', id).eq('firma_id', firmaId).select('id,activitate_id,nume,date,finalizat,created_at').single()
    if (error) return NextResponse.json({ error: /finalizat/i.test(error.message || '') ? 'Rulează migrarea (lipsește coloana „finalizat" din beneficiari)' : error.message }, { status: /finalizat/i.test(error.message || '') ? 409 : 500 })
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

  // Setează data unui act pus în lucru (înainte de „Pregătește", ca să iasă în ordinea corectă în registru).
  if (b.actiune === 'data-doc') {
    const docId = String(b.docId || ''), dataNoua = b.data ? dataValida(b.data) : null
    if (!docId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    if (b.data && !dataNoua) return NextResponse.json({ error: 'Dată invalidă' }, { status: 400 })
    const { data: d, error } = await sb.from('documente').update({ data_document: dataNoua }).eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ document: d })
  }

  // „↩ Dă înapoi": restaurează un act la starea de dinaintea ultimei pregătiri/completări (fișier + nr. + dată).
  // `anterior` vine exact din răspunsul lui pregateste-doc / completeaza-manual.
  if (b.actiune === 'restaureaza-doc') {
    const docId = String(b.docId || '')
    const a = (b.anterior && typeof b.anterior === 'object') ? b.anterior as Record<string, unknown> : null
    const path = a ? String(a.path || '') : ''
    if (!docId || !path) return NextResponse.json({ error: 'Nimic de restaurat' }, { status: 400 })
    if (!path.startsWith(`${firmaId}/`)) return NextResponse.json({ error: 'Cale invalidă' }, { status: 400 }) // siguranță: doar în folderul firmei
    const { data: doc } = await sb.from('documente').select('fisier_path').eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!doc) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    const { data: f } = await sb.storage.from('documente').download(path) // versiunea anterioară trebuie să existe
    if (!f) return NextResponse.json({ error: 'Versiunea anterioară nu mai există' }, { status: 410 })
    const nr = (a!.nr === null || a!.nr === undefined || a!.nr === '') ? null : Math.trunc(Number(a!.nr))
    const dataDoc = a!.data ? dataValida(a!.data) : null
    const { data: docNou, error } = await sb.from('documente').update({
      fisier_path: path, fisier_nume: String(a!.nume || 'document (în lucru).docx'),
      fisier_marime: (a!.marime == null ? f.size : Math.trunc(Number(a!.marime))) || f.size, fisier_tip: DOCX_TIP,
      nr_inregistrare: Number.isFinite(nr as number) ? nr : null, data_document: dataDoc,
    }).eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (doc.fisier_path && doc.fisier_path !== path) await sb.storage.from('documente').remove([doc.fisier_path]) // ștergem versiunea abandonată
    return NextResponse.json({ document: docNou })
  }

  // „Resetează ca să plecăm de la 0": nr_inregistrare = null. Implicit tot registrul firmei; cu
  // `activitateId`, doar o activitate. Apoi se renumerotează de la 1 pe măsură ce apeși „Pregătește".
  if (b.actiune === 'reseteaza-numerotare') {
    const activitateId = b.activitateId ? String(b.activitateId) : ''
    let q = sb.from('documente').update({ nr_inregistrare: null }).eq('firma_id', firmaId).eq('modul', MODUL).not('nr_inregistrare', 'is', null)
    if (activitateId) q = q.eq('activitate_sociala_id', activitateId)
    const { data, error } = await q.select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, resetate: data?.length || 0 })
  }

  // „Date din postări": AI citește Anexele (PDF cu capturi de postări) și propune perioada de implementare,
  // din care calculează data Deciziei (prima postare − 7 zile) și a Raportului (ultima postare + 1 lună).
  // NU aplică — doar propune; clientul confirmă cu `aplica-date-postari`.
  if (b.actiune === 'date-din-postari') {
    const activitateId = b.activitateId ? String(b.activitateId) : ''
    const zona = String(b.zona || ''), an0 = anValid(b.an)
    const pdfDocId = b.pdfDocId ? String(b.pdfDocId) : ''
    const col = 'id,fisier_nume,fisier_tip,fisier_path,furnizor,tip_document,este_draft'
    const baseQ = () => { let q = sb.from('documente').select(col).eq('firma_id', firmaId).eq('modul', MODUL); if (activitateId) q = q.eq('activitate_sociala_id', activitateId); else q = q.is('activitate_sociala_id', null).eq('zona_sociala', zona).eq('an_social', an0 as number); return q }
    if (!activitateId && !(zona && zonaValida(zona) && an0)) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    const { data: docs } = await baseQ()
    const lista = (docs || []) as { id: string; fisier_nume: string | null; fisier_tip: string | null; fisier_path: string | null; furnizor: string | null; tip_document: string | null; este_draft: boolean | null }[]
    const estePdf = (d: typeof lista[number]) => /pdf/.test(d.fisier_tip || '') || /\.pdf$/i.test(d.fisier_nume || '')
    const esteDocx = (d: typeof lista[number]) => /\.docx$/i.test(d.fisier_nume || '') || /wordprocessing/.test(d.fisier_tip || '')
    const numeDoc = (d: typeof lista[number]) => (d.furnizor || '') + ' ' + (d.fisier_nume || '')
    const pdfuri = lista.filter(estePdf)
    let anexa = pdfDocId ? pdfuri.find(d => d.id === pdfDocId) : undefined
    if (!anexa) anexa = pdfuri.find(d => /anex|postar|captur|statisti/i.test(numeDoc(d))) || pdfuri[0]
    if (!anexa || !anexa.fisier_path) return NextResponse.json({ error: 'Nu am găsit un PDF cu anexele (capturi de postări). Încarcă-l întâi în această zonă/activitate.' }, { status: 400 })
    // Decizia/Raportul: docx non-draft care conține „deciz"/„raport"; preferăm copia pusă în lucru (editabilă)
    const pick = (re: RegExp) => { const c = lista.filter(d => esteDocx(d) && !d.este_draft && re.test(numeDoc(d))); return c.find(d => d.tip_document === TIP_LUCRU) || c[0] }
    const decizie = pick(/deciz/i)
    const raport = pick(/raport/i)
    const anexaPath = anexa.fisier_path
    let anc = an0
    if (!anc && activitateId) { const { data: act } = await sb.from('activitati_sociale').select('an').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle(); anc = (act?.an as number) || null }
    const { data: file, error: dlErr } = await sb.storage.from('documente').download(anexaPath)
    if (dlErr || !file) return NextResponse.json({ error: 'Nu am putut citi anexele' }, { status: 500 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length > 20 * 1024 * 1024) return NextResponse.json({ error: 'Anexele sunt prea mari (max 20 MB) pentru citire automată.' }, { status: 400 })
    const rez = await extragePerioadaPostari(bytes, anexa.fisier_tip || 'application/pdf', anc || undefined)
    if (!rez || !rez.prima) return NextResponse.json({ error: 'Nu am găsit datele postărilor în anexe. Verifică dacă se văd datele de publicare.', nota: rez?.nota || '' }, { status: 422 })
    return NextResponse.json({
      prima: rez.prima, ultima: rez.ultima, dateGasite: rez.dateGasite, nota: rez.nota,
      perioadaText: perioadaRo(rez.prima, rez.ultima),
      decizieData: minusZile(rez.prima, 7), raportData: plusLuni(rez.ultima || rez.prima, 1),
      decizieDocId: decizie?.id || null, decizieNume: decizie ? (decizie.furnizor || decizie.fisier_nume) : null,
      raportDocId: raport?.id || null, raportNume: raport ? (raport.furnizor || raport.fisier_nume) : null,
      anexaNume: anexa.furnizor || anexa.fisier_nume,
    })
  }

  // Aplică datele propuse de „date-din-postari" (după confirmare): setează data pe Decizie și pe Raport,
  // iar perioada (text) pe activitate (dacă există), ca să intre în raport la „Pregătește".
  if (b.actiune === 'aplica-date-postari') {
    const decizieDocId = b.decizieDocId ? String(b.decizieDocId) : ''
    const raportDocId = b.raportDocId ? String(b.raportDocId) : ''
    const decizieData = b.decizieData ? dataValida(b.decizieData) : null
    const raportData = b.raportData ? dataValida(b.raportData) : null
    const activitateId = b.activitateId ? String(b.activitateId) : ''
    const perioadaText = txt(b.perioadaText, 200)
    const out: Record<string, unknown> = {}
    if (decizieDocId && decizieData) {
      const { data } = await sb.from('documente').update({ data_document: decizieData }).eq('id', decizieDocId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
      out.decizie = data
    }
    if (raportDocId && raportData) {
      const { data } = await sb.from('documente').update({ data_document: raportData }).eq('id', raportDocId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
      out.raport = data
    }
    if (activitateId && perioadaText) {
      const { data: act } = await sb.from('activitati_sociale').select('date_documente').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
      if (act) { const dd = (act.date_documente || {}) as Record<string, string>; dd.PERIOADA = perioadaText; await sb.from('activitati_sociale').update({ date_documente: dd, updated_at: new Date().toISOString() }).eq('id', activitateId).eq('firma_id', firmaId); out.perioada = perioadaText }
    }
    if (!out.decizie && !out.raport) return NextResponse.json({ error: 'Nu am găsit Decizia sau Raportul de actualizat.' }, { status: 404 })
    return NextResponse.json(out)
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

  // Mută un document atașat unei zone în interiorul unei activități (îl leagă de activitate).
  if (b.actiune === 'muta-doc-activitate') {
    const docId = String(b.docId || ''), activitateId = String(b.activitateId || '')
    if (!docId || !activitateId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    const { data: act } = await sb.from('activitati_sociale').select('id').eq('id', activitateId).eq('firma_id', firmaId).maybeSingle()
    if (!act) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
    const { data, error } = await sb.from('documente').update({ activitate_sociala_id: activitateId, zona_sociala: null, an_social: null, este_draft: false })
      .eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ document: data })
  }

  // „Pune în lucru" un document (draft încărcat): îi completează marcajele %%...%% cu datele zonei/activității
  // și salvează o copie editabilă. Dacă se dă `activitateId`, copia intră în REGISTRUL activității (act „în lucru");
  // altfel rămâne un document de zonă (comportamentul vechi).
  if (b.actiune === 'pune-in-lucru-doc') {
    const docId = String(b.docId || '')
    const zonaDoc = String(b.zona || ''), anDoc = anValid(b.an)
    const activitateId = b.activitateId ? String(b.activitateId) : ''
    if (!docId || !zonaDoc || !zonaValida(zonaDoc) || !anDoc) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    const { data: sursa } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip').eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!sursa?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    // activitatea țintă: cea cerută (validată pe firmă) ori, în lipsă, prima activitate a zonei (doar pentru date)
    let act: { id: string; date_documente: unknown } | null = null
    if (activitateId) {
      const { data } = await sb.from('activitati_sociale').select('id,date_documente').eq('id', activitateId).eq('firma_id', firmaId).eq('zona', zonaDoc).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Activitatea nu a fost găsită' }, { status: 404 })
      act = data
    } else {
      const { data } = await sb.from('activitati_sociale').select('id,date_documente').eq('firma_id', firmaId).eq('zona', zonaDoc).eq('an', anDoc).order('created_at', { ascending: true }).limit(1)
      act = data?.[0] || null
    }
    const { data: orig, error: dlErr } = await sb.storage.from('documente').download(sursa.fisier_path)
    if (dlErr || !orig) return NextResponse.json({ error: 'Documentul nu a putut fi citit' }, { status: 500 })
    const inBytes = new Uint8Array(await orig.arrayBuffer())
    const esteDocx = /\.docx$/i.test(sursa.fisier_nume || '') || /wordprocessing/.test(sursa.fisier_tip || '')
    const comune = (act?.date_documente || {}) as Record<string, string>
    const valori: Record<string, string> = { ...VALORI_IMPLICITE, ...comune, AN: String(anDoc) }
    const t = azi(); valori.DATA = `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`
    if (act?.id) { const { count } = await sb.from('beneficiari_sociali').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('activitate_id', act.id); if (count != null) valori.NR_VOLUNTARI = String(count) }
    let outBytes: Uint8Array = inBytes
    if (esteDocx) { try { outBytes = await umpleSablon(inBytes, valori) } catch { outBytes = inBytes } }
    const bazaNume = (sursa.fisier_nume || 'document').replace(/\.docx$/i, '')
    const nume = bazaNume + ' (în lucru).docx'
    // numărul de înregistrare NU se dă acum — se atribuie la „Pregătește" (vezi pregateste-doc),
    // după ce setezi data, ca să iasă în ordinea corectă în registru.
    const inRegistru = activitateId && act?.id
    const path = `${inRegistru ? prefix(firmaId, act!.id) : prefixZona(firmaId, zonaDoc, anDoc)}${Date.now()}_pus_in_lucru.docx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(outBytes), { contentType: sursa.fisier_tip || DOCX_TIP })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const camp = inRegistru
      ? { activitate_sociala_id: act!.id, zona_sociala: null, an_social: null, stare: 'in_lucru', tip_document: TIP_LUCRU, nr_inregistrare: null }
      : { activitate_sociala_id: null, zona_sociala: zonaDoc, an_social: anDoc, stare: 'in_lucru', tip_document: TIP_LUCRU }
    const { data: doc, error } = await sb.from('documente').insert({
      firma_id: firmaId, luna_id: null, modul: MODUL, este_draft: false, furnizor: bazaNume, data_document: t,
      fisier_path: path, fisier_nume: nume, fisier_tip: sursa.fisier_tip || DOCX_TIP, fisier_marime: outBytes.length, in_zip: false, ...camp,
    }).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ document: doc })
  }

  // „Pregătește" un document pus în lucru: AI identifică spațiile de completat („______"), le umple pe cele
  // pe care le putem deduce din datele interne (nr., data, voluntari, contracte…) și le raportează pe cele
  // rămase de completat manual (acolo unde n-avem informația internă).
  if (b.actiune === 'pregateste-doc') {
    const docId = String(b.docId || '')
    if (!docId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    const { data: doc } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip,fisier_marime,nr_inregistrare,data_document,activitate_sociala_id').eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!doc?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    if (!(/\.docx$/i.test(doc.fisier_nume || '') || /wordprocessing/.test(doc.fisier_tip || ''))) return NextResponse.json({ error: 'Doar documentele Word (.docx) pot fi pregătite automat' }, { status: 400 })
    const { data: orig, error: dlErr } = await sb.storage.from('documente').download(doc.fisier_path)
    if (dlErr || !orig) return NextResponse.json({ error: 'Documentul nu a putut fi citit' }, { status: 500 })
    const inBytes = new Uint8Array(await orig.arrayBuffer())
    // stare de dinainte de pregătire — pentru „↩ Dă înapoi" (restaurăm fișierul + nr. + data)
    const anterior = { path: doc.fisier_path, nume: doc.fisier_nume, marime: (doc.fisier_marime as number | null) ?? null, nr: (doc.nr_inregistrare as number | null) ?? null, data: (doc.data_document as string | null) ?? null }
    // numărul de înregistrare se dă ACUM, la „Pregătește": următorul liber din registrul firmei
    // (dacă actul n-are deja număr și e într-o activitate). Setezi data întâi → iese în ordinea corectă.
    let nrAtribuit: number | null = null
    if (doc.nr_inregistrare == null && doc.activitate_sociala_id) {
      const { data: mx } = await sb.from('documente').select('nr_inregistrare').eq('firma_id', firmaId).eq('modul', MODUL).not('nr_inregistrare', 'is', null).order('nr_inregistrare', { ascending: false }).limit(1)
      nrAtribuit = ((mx?.[0]?.nr_inregistrare as number) || 0) + 1
      await sb.from('documente').update({ nr_inregistrare: nrAtribuit }).eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL)
      doc.nr_inregistrare = nrAtribuit // ca AI-ul să scrie numărul corect în document
    }
    const { context, total } = await extrageContextBlanks(inBytes)
    if (!total) {
      // n-are spații de completat — doar i-am dat numărul (dacă era cazul); întoarcem starea actuală
      const { data: docFull } = await sb.from('documente').select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).single()
      return NextResponse.json({ document: docFull, completate: 0, total: 0, manuale: [], nrAtribuit, anterior: nrAtribuit != null ? anterior : null, faraSpatii: true })
    }

    // date interne ale activității
    const actId = doc.activitate_sociala_id as string | null
    const roData = (iso?: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''
    const linii: string[] = []
    let act: { denumire?: string; an?: number; perioada?: string; date_documente?: unknown } | null = null
    if (actId) {
      const { data: a } = await sb.from('activitati_sociale').select('denumire,an,perioada,date_documente').eq('id', actId).eq('firma_id', firmaId).maybeSingle()
      act = a
    }
    const comune = (act?.date_documente || {}) as Record<string, string>
    const val = (k: string) => (comune[k] || VALORI_IMPLICITE[k] || '').trim()
    if (act) linii.push(`- Activitate: ${act.denumire || ''}${act.an ? `, anul ${act.an}` : ''}${act.perioada ? `, perioada ${act.perioada}` : ''}`)
    if (val('COORDONATOR')) linii.push(`- Coordonator: ${val('COORDONATOR')}`)
    if (val('LOCUL')) linii.push(`- Locul: ${val('LOCUL')}`)
    if (val('INSTRUIT_DE')) linii.push(`- Instruit de: ${val('INSTRUIT_DE')}`)
    linii.push(`- Numărul de înregistrare al acestui document: ${doc.nr_inregistrare ?? '(neatribuit)'}`)
    linii.push(`- Data documentului (de folosit unde cere „Data"): ${roData(doc.data_document) || roData(azi())}`)
    if (actId) {
      const { data: dec } = await sb.from('documente').select('nr_inregistrare,data_document').eq('firma_id', firmaId).eq('modul', MODUL).eq('activitate_sociala_id', actId).eq('tip_document', 'decizie_organizare').order('created_at', { ascending: true }).limit(1)
      if (dec?.[0]) linii.push(`- Decizia de organizare: nr. ${dec[0].nr_inregistrare ?? '?'}${dec[0].data_document ? ` din ${roData(dec[0].data_document)}` : ''}`)
      const { data: benef } = await sb.from('beneficiari_sociali').select('id,nume,date').eq('firma_id', firmaId).eq('activitate_id', actId).order('created_at', { ascending: true })
      const { data: contracte } = await sb.from('documente').select('beneficiar_social_id,nr_inregistrare,data_document').eq('firma_id', firmaId).eq('modul', MODUL).eq('activitate_sociala_id', actId).eq('tip_document', 'contract_voluntariat')
      const contractPt = new Map((contracte || []).map(c => [c.beneficiar_social_id as string, c]))
      linii.push(`- Număr voluntari înregistrați: ${(benef || []).length}`)
      ;(benef || []).forEach((bn, i) => {
        const d = (bn.date || {}) as Record<string, string>
        const c = contractPt.get(bn.id)
        const buc = [
          `nume: ${bn.nume}`,
          c ? `contract nr. ${c.nr_inregistrare ?? '?'}${c.data_document ? ` din ${roData(c.data_document)}` : ''}` : 'contract: (negăsit)',
          d.PERIOADA ? `perioada: ${d.PERIOADA}` : 'perioada: (necompletată)',
          d.ORE_PROGRAM ? `ore/program: ${d.ORE_PROGRAM}` : 'ore: (necompletate)',
        ]
        linii.push(`  ${i + 1}) ${buc.join(' — ')}`)
      })
    }
    const dateInterne = linii.join('\n')

    const rez = await analizeazaDocument(context, total, dateInterne)
    if (!rez) return NextResponse.json({ error: 'Analiza automată nu a reușit. Încearcă din nou sau completează manual.' }, { status: 502 })
    const umplut = await umpleBlanks(inBytes, rez.completate)
    // renumerotează câmpurile manuale pe documentul rezultat (spațiile auto-completate au dispărut)
    const manuale = rez.manuale.filter(m => umplut.remap[String(m.nr)] != null).map(m => ({ nr: umplut.remap[String(m.nr)], eticheta: m.eticheta }))

    const path = `${prefix(firmaId, actId || 'zona')}${Date.now()}_pregatit.docx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(umplut.bytes), { contentType: DOCX_TIP })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: docNou, error } = await sb.from('documente').update({ fisier_path: path, fisier_marime: umplut.bytes.length, fisier_tip: DOCX_TIP })
      .eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }) }
    // nu ștergem fișierul anterior — rămâne pentru „↩ Dă înapoi"
    return NextResponse.json({ document: docNou, completate: umplut.completate, total, manuale, nrAtribuit, anterior })
  }

  // „Du în document": completează spațiile rămase manuale cu valorile introduse de utilizator în aplicație.
  // `campuri` = [{nr, eticheta, valoare}] cu numerotarea curentă a documentului (de la pregateste-doc/completeaza-manual).
  if (b.actiune === 'completeaza-manual') {
    const docId = String(b.docId || '')
    const campuri = (Array.isArray(b.campuri) ? b.campuri : []) as { nr?: unknown; eticheta?: unknown; valoare?: unknown }[]
    if (!docId) return NextResponse.json({ error: 'Document lipsă' }, { status: 400 })
    if (!campuri.length) return NextResponse.json({ error: 'Nimic de completat' }, { status: 400 })
    const { data: doc } = await sb.from('documente').select('fisier_path,fisier_nume,fisier_tip,fisier_marime,nr_inregistrare,data_document,activitate_sociala_id').eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).maybeSingle()
    if (!doc?.fisier_path) return NextResponse.json({ error: 'Documentul nu a fost găsit' }, { status: 404 })
    if (!(/\.docx$/i.test(doc.fisier_nume || '') || /wordprocessing/.test(doc.fisier_tip || ''))) return NextResponse.json({ error: 'Doar documentele Word (.docx)' }, { status: 400 })
    const { data: orig, error: dlErr } = await sb.storage.from('documente').download(doc.fisier_path)
    if (dlErr || !orig) return NextResponse.json({ error: 'Documentul nu a putut fi citit' }, { status: 500 })
    const inBytes = new Uint8Array(await orig.arrayBuffer())
    // stare de dinainte — pentru „↩ Dă înapoi"
    const anterior = { path: doc.fisier_path, nume: doc.fisier_nume, marime: (doc.fisier_marime as number | null) ?? null, nr: (doc.nr_inregistrare as number | null) ?? null, data: (doc.data_document as string | null) ?? null }
    const valori: Record<string, string> = {}
    for (const c of campuri) {
      const nr = Math.trunc(Number(c.nr)); const val = String(c.valoare ?? '').replace(/\s+/g, ' ').trim()
      if (Number.isFinite(nr) && nr >= 1 && val) valori[String(nr)] = val.slice(0, 300)
    }
    if (!Object.keys(valori).length) return NextResponse.json({ error: 'Completează cel puțin un câmp.' }, { status: 400 })
    const umplut = await umpleBlanks(inBytes, valori)
    const path = `${prefix(firmaId, (doc.activitate_sociala_id as string) || 'zona')}${Date.now()}_completat.docx`
    const { error: upErr } = await sb.storage.from('documente').upload(path, Buffer.from(umplut.bytes), { contentType: DOCX_TIP })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: docNou, error } = await sb.from('documente').update({ fisier_path: path, fisier_marime: umplut.bytes.length, fisier_tip: DOCX_TIP })
      .eq('id', docId).eq('firma_id', firmaId).eq('modul', MODUL).select(COL_DOC + ',zona_sociala,an_social,stare,este_draft').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }) }
    // nu ștergem fișierul anterior — rămâne pentru „↩ Dă înapoi"
    // câmpurile rămase (fără valoare introdusă) — renumerotate pe documentul rezultat
    const manuale = campuri.filter(c => !String(c.valoare ?? '').trim()).map(c => ({ nr: umplut.remap[String(Math.trunc(Number(c.nr)))], eticheta: String(c.eticheta ?? '').slice(0, 120) })).filter(m => m.nr != null)
    return NextResponse.json({ document: docNou, completate: umplut.completate, total: umplut.total, manuale, anterior })
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
