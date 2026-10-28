import { createHash, randomUUID } from 'node:crypto'
import { getServiceSupabase } from '@/lib/supabase/server'
import { readWorkflow, writeWorkflow } from '@/lib/proiect-workflow-store'
import { blockedBy, type Asset, type Step, type SyncSrl } from '@/lib/proiect-workflow'

// PROIECT AB Textile e derulat de AB Textile SRL: o parte din ce se aduna pentru proiect (stat de plata, pontaj,
// centralizator, extrase, plata contributiilor) exista deja in contabilitatea firmei si invers. Aici se completeaza
// automat partea goala din cealalta, pe aceeasi luna de lucru, ca acelasi document sa nu fie incarcat de doua ori.
//
//  - Documente (stat, pontaj, centralizator): daca o parte nu are nimic de tipul respectiv, primeste copia celeilalte.
//    Daca ambele au ceva (chiar si fisiere diferite), nu se atinge nimic - nu stim care e cel bun.
//  - Extrase: extrasele din AB Textile SRL ajung si in proiect (doar in acest sens - extrasul SRL se incarca prin
//    importul care citeste tranzactiile); un extras identic (acelasi continut) nu se copiaza a doua oara.
//  - Plata contributiilor: „CAS + CASS angajati” (SRL) <-> „Plata salariilor si contributiilor” (proiect), cu
//    memorarea starii de la ultima sincronizare, ca o schimbare facuta de om intr-o parte sa treaca in cealalta.
// Registrul „ce s-a copiat” sta in starea lunii din proiect (Workflow.sync): un document copiat si sters apoi de om
// nu mai revine, iar o copie nu se copiaza inapoi.

export const SLUG_PROIECT = 'proiect-ab-textile'
export const SLUG_SRL = 'ab-textile'
const CHEIE_CAS_CASS = 'impozite.cas_cass'
const SURSA_SRL = 'AB Textile SRL'
const MAX_BYTES = 4 * 1024 * 1024 // limita de incarcare a documentelor din proiect
const TIPURI_PROIECT = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const PLATIT_IN_PROIECT: Step[] = ['executat', 'trimis', 'acceptat']
const INAINTE_DE_EXECUTAT: Step[] = ['lipsa', 'primit', 'semnat', 'initiat', 'avizat']

const PERECHI = [
  { srlTip: 'stat_plata', task: 'stat', eticheta: 'Stat de plată' },
  { srlTip: 'pontaj', task: 'pontaj', eticheta: 'Pontaj' },
  { srlTip: 'centralizator', task: 'centralizator', eticheta: 'Centralizator contribuții' },
] as const

type Sb = ReturnType<typeof getServiceSupabase>
export interface RezultatSincronizare { copiate: string[]; platite: string[]; sarite: string[] }
const gol = (): RezultatSincronizare => ({ copiate: [], platite: [], sarite: [] })

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' }
const numeSigur = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'document'

async function descarca(sb: Sb, bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await sb.storage.from(bucket).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

export async function sincronizeazaProiectSrl(sb: Sb, luna: string): Promise<RezultatSincronizare> {
  const rez = gol()
  const { data: firme } = await sb.from('firme').select('id,slug').in('slug', [SLUG_PROIECT, SLUG_SRL])
  const proiect = firme?.find(f => f.slug === SLUG_PROIECT), srl = firme?.find(f => f.slug === SLUG_SRL)
  if (!proiect || !srl) return rez
  const data = `${luna}-01`
  const [{ data: lunaProiect }, { data: lunaSrl }] = await Promise.all([
    sb.from('luni_contabile').select('id').eq('firma_id', proiect.id).eq('luna', data).maybeSingle(),
    sb.from('luni_contabile').select('id').eq('firma_id', srl.id).eq('luna', data).maybeSingle(),
  ])
  if (!lunaProiect || !lunaSrl) return rez

  // Luna din proiect se initializeaza la prima deschidere (rutina cu termene); pana atunci nu o scriem noi.
  const prefix = `${proiect.id}/workflow/month-${lunaProiect.id}`
  const stare = await readWorkflow(prefix)
  if (!stare.version) return rez

  const reg: SyncSrl = { copiat: { ...(stare.sync?.copiat || {}) }, ...(stare.sync?.impozit ? { impozit: { ...stare.sync.impozit } } : {}) }
  const copii = new Set(Object.values(reg.copiat))
  const assets: Asset[] = [...stare.assets]
  const taskuri = { ...stare.tasks }
  const anulari: (() => Promise<void>)[] = []
  let modificat = false

  const { data: docsSrl } = await sb.from('documente')
    .select('id,tip_document,fisier_path,fisier_nume,fisier_tip,fisier_marime,created_at')
    .eq('firma_id', srl.id).eq('luna_id', lunaSrl.id).eq('modul', 'acte_contabile')
    .in('tip_document', PERECHI.map(p => p.srlTip)).order('created_at', { ascending: false })

  // ---- Documente: stat de plata, pontaj, centralizator ----
  for (const p of PERECHI) {
    const dinSrl = (docsSrl || []).filter(d => d.tip_document === p.srlTip)
    const dinProiect = assets.filter(a => a.task === p.task)
    if (!dinProiect.length) {
      const sursa = dinSrl.find(d => !reg.copiat[`srl:${d.id}`] && !copii.has(d.id))
      if (!sursa) continue
      const tip = sursa.fisier_tip || ''
      if (!TIPURI_PROIECT.includes(tip)) { rez.sarite.push(`${p.eticheta}: „${sursa.fisier_nume}” nu e PDF/Word/imagine, nu se poate copia în proiect`); continue }
      const bytes = await descarca(sb, 'documente', sursa.fisier_path)
      if (!bytes) { rez.sarite.push(`${p.eticheta}: fișierul din AB Textile SRL nu a putut fi citit`); continue }
      if (bytes.length > MAX_BYTES) { rez.sarite.push(`${p.eticheta}: fișierul are peste 4 MB, limita pentru proiect`); continue }
      const asset: Asset = { id: randomUUID(), task: p.task, name: String(sursa.fisier_nume).slice(0, 180), type: tip, createdAt: new Date().toISOString(), kind: 'upload', from: SURSA_SRL }
      const copie = await adaugaInProiect(sb, { prefix, firmaId: proiect.id, lunaId: lunaProiect.id, asset, bytes })
      if (!copie) { rez.sarite.push(`${p.eticheta}: copia în proiect nu s-a putut salva`); continue }
      anulari.push(copie)
      assets.push(asset); reg.copiat[`srl:${sursa.id}`] = asset.id; copii.add(asset.id); modificat = true
      rez.copiate.push(`${p.eticheta}: din AB Textile SRL în proiect`)
    } else if (!dinSrl.length) {
      const sursa = dinProiect.find(a => !reg.copiat[`proj:${a.id}`] && !copii.has(a.id))
      if (!sursa) continue
      const bytes = await descarca(sb, 'documente', `${prefix}/files/${sursa.id}`)
      if (!bytes) { rez.sarite.push(`${p.eticheta}: fișierul din proiect nu a putut fi citit`); continue }
      const idNou = randomUUID()
      const path = `${srl.id}/${lunaSrl.id}/angajati/${numeSigur(sursa.name)}_${Date.now()}.${EXT[sursa.type] || 'pdf'}`
      const { error: upErr } = await sb.storage.from('documente').upload(path, bytes, { contentType: sursa.type, upsert: false })
      if (upErr) { rez.sarite.push(`${p.eticheta}: copia în AB Textile SRL nu s-a putut încărca`); continue }
      const { error: dbErr } = await sb.from('documente').insert({
        id: idNou, firma_id: srl.id, luna_id: lunaSrl.id, modul: 'acte_contabile', tip_document: p.srlTip,
        furnizor: 'Copiat automat din PROIECT AB Textile', fisier_path: path, fisier_nume: sursa.name, fisier_tip: sursa.type, fisier_marime: bytes.length, in_zip: true,
      })
      if (dbErr) { await sb.storage.from('documente').remove([path]); rez.sarite.push(`${p.eticheta}: copia în AB Textile SRL nu s-a putut înregistra`); continue }
      anulari.push(async () => { await sb.from('documente').delete().eq('id', idNou); await sb.storage.from('documente').remove([path]) })
      reg.copiat[`proj:${sursa.id}`] = idNou; copii.add(idNou); modificat = true
      rez.copiate.push(`${p.eticheta}: din proiect în AB Textile SRL`)
    }
  }

  // ---- Extrase bancare: AB Textile SRL -> proiect (cele identice nu se dubleaza) ----
  const { data: extrase } = await sb.from('extrase').select('id,pdf_path,pdf_nume').eq('luna_id', lunaSrl.id).not('pdf_path', 'is', null)
  const noi = (extrase || []).filter(e => !reg.copiat[`extras:${e.id}`])
  if (noi.length) {
    const amprente = new Map<string, string>()
    for (const a of assets.filter(x => x.task === 'extras')) {
      const b = await descarca(sb, 'documente', `${prefix}/files/${a.id}`)
      if (b) amprente.set(sha(b), a.id)
    }
    for (const e of noi) {
      const bytes = await descarca(sb, 'extrase-pdf', e.pdf_path as string)
      if (!bytes) { rez.sarite.push(`Extras ${e.pdf_nume || ''}: fișierul nu a putut fi citit`); continue }
      const h = sha(bytes), existent = amprente.get(h)
      if (existent) { reg.copiat[`extras:${e.id}`] = existent; modificat = true; continue }
      if (bytes.length > MAX_BYTES) { rez.sarite.push(`Extras ${e.pdf_nume || ''}: fișierul are peste 4 MB, limita pentru proiect`); continue }
      const asset: Asset = { id: randomUUID(), task: 'extras', name: String(e.pdf_nume || 'Extras de cont.pdf').slice(0, 180), type: 'application/pdf', createdAt: new Date().toISOString(), kind: 'upload', from: SURSA_SRL }
      const copie = await adaugaInProiect(sb, { prefix, firmaId: proiect.id, lunaId: lunaProiect.id, asset, bytes })
      if (!copie) { rez.sarite.push(`Extras ${e.pdf_nume || ''}: copia în proiect nu s-a putut salva`); continue }
      anulari.push(copie)
      assets.push(asset); amprente.set(h, asset.id); reg.copiat[`extras:${e.id}`] = asset.id; copii.add(asset.id); modificat = true
      rez.copiate.push(`Extras de cont ${e.pdf_nume || ''}: din AB Textile SRL în proiect`)
    }
  }

  // ---- Plata contributiilor: CAS + CASS (SRL) <-> Plata salariilor si contributiilor (proiect) ----
  const { data: impRow } = await sb.from('impozite_stari').select('suma,scadenta,platit').eq('luna_id', lunaSrl.id).eq('tip_key', CHEIE_CAS_CASS).maybeSingle()
  const srlPlatit = !!impRow?.platit
  const statusSalarii = taskuri.salarii?.status
  const proiectPlatit = !!statusSalarii && PLATIT_IN_PROIECT.includes(statusSalarii)
  const snap = reg.impozit
  // Ce s-a schimbat de la ultima sincronizare (prima data: „platit” inseamna schimbat fata de „neplatit”).
  const schimbatSrl = snap ? srlPlatit !== snap.srl : srlPlatit
  const schimbatProiect = snap ? proiectPlatit !== snap.proiect : proiectPlatit
  const dinSrl = schimbatSrl && !schimbatProiect
  const dinProiect = schimbatProiect && !schimbatSrl
  let propagat = false
  if (dinSrl && taskuri.salarii) {
    const t = taskuri.salarii
    if (srlPlatit && INAINTE_DE_EXECUTAT.includes(t.status)) {
      const blocat = blockedBy('salarii', { ...stare, tasks: taskuri })
      if (blocat.length) rez.sarite.push(`Plata salariilor și contribuțiilor nu a putut fi marcată din AB Textile SRL: întâi ${blocat.join(', ')}`)
      else {
        const nota = 'Marcat automat: CAS + CASS e plătit în AB Textile SRL.'
        reg.impozit = { srl: true, proiect: true, statusAnterior: t.status }
        taskuri.salarii = { ...t, status: 'executat', note: t.note ? `${t.note}\n${nota}` : nota }
        modificat = propagat = true
        rez.platite.push('Plata salariilor și contribuțiilor: marcată „executată” (CAS + CASS plătit în AB Textile SRL)')
      }
    } else if (!srlPlatit && t.status === 'executat' && t.note.includes('Marcat automat: CAS + CASS')) {
      taskuri.salarii = { ...t, status: snap?.statusAnterior || 'avizat', note: t.note.split('\n').filter(l => !l.startsWith('Marcat automat: CAS + CASS')).join('\n') }
      reg.impozit = { srl: false, proiect: false }
      modificat = propagat = true
      rez.platite.push('Plata salariilor și contribuțiilor: readusă la starea anterioară (CAS + CASS nu mai e plătit în AB Textile SRL)')
    }
  } else if (dinProiect) {
    const acum = new Date().toISOString()
    const { error: e1 } = await sb.from('impozite_stari').upsert({ luna_id: lunaSrl.id, tip_key: CHEIE_CAS_CASS, suma: impRow?.suma ?? null, scadenta: impRow?.scadenta ?? null, platit: proiectPlatit, updated_at: acum }, { onConflict: 'luna_id,tip_key' })
    const { error: e2 } = e1 ? { error: e1 } : await sb.from('task_stari').upsert({ luna_id: lunaSrl.id, task_key: CHEIE_CAS_CASS, completat: proiectPlatit, updated_at: acum }, { onConflict: 'luna_id,task_key' })
    if (e1 || e2) rez.sarite.push('CAS + CASS din AB Textile SRL nu a putut fi actualizat')
    else {
      reg.impozit = { srl: proiectPlatit, proiect: proiectPlatit, ...(snap?.statusAnterior ? { statusAnterior: snap.statusAnterior } : {}) }
      modificat = propagat = true
      rez.platite.push(`CAS + CASS (AB Textile SRL): marcat ${proiectPlatit ? 'plătit' : 'neplătit'} după Plata salariilor și contribuțiilor din proiect`)
    }
  }
  // Fara nimic de propagat (nimic nou, sau ambele s-au schimbat deodata): starea de referinta se aliniaza la cea de acum,
  // dar doar daca exista ceva de urmarit - altfel nu scriem o versiune noua a lunii degeaba.
  if (!propagat && !dinSrl && !dinProiect && (srlPlatit || proiectPlatit || snap) && (!snap || snap.srl !== srlPlatit || snap.proiect !== proiectPlatit)) {
    reg.impozit = { srl: srlPlatit, proiect: proiectPlatit, ...(snap?.statusAnterior ? { statusAnterior: snap.statusAnterior } : {}) }
    modificat = true
  }

  if (modificat) {
    try { await writeWorkflow(prefix, { ...stare, assets, tasks: taskuri, sync: reg }, stare.version) }
    catch (e) {
      // starea lunii s-a schimbat intre timp (alta fereastra / alta sincronizare): desfacem tot ce am creat si se reia la urmatoarea deschidere
      for (const a of anulari) await a().catch(() => {})
      rez.sarite.push('Starea lunii s-a schimbat între timp; sincronizarea se reia la următoarea deschidere')
      rez.copiate = []; rez.platite = []
      void e
    }
  }
  return rez
}

async function adaugaInProiect(sb: Sb, a: { prefix: string; firmaId: string; lunaId: string; asset: Asset; bytes: Buffer }): Promise<(() => Promise<void>) | null> {
  const path = `${a.prefix}/files/${a.asset.id}`
  const { error } = await sb.storage.from('documente').upload(path, a.bytes, { contentType: a.asset.type, upsert: false })
  if (error) return null
  const { error: dbErr } = await sb.from('documente').insert({
    id: a.asset.id, firma_id: a.firmaId, luna_id: a.lunaId, achizitie_id: null, modul: 'obligatii', tip_document: a.asset.task,
    fisier_path: path, fisier_nume: a.asset.name, fisier_tip: a.asset.type, fisier_marime: a.bytes.length, in_zip: true,
  })
  if (dbErr) { await sb.storage.from('documente').remove([path]); return null }
  return async () => { await sb.from('documente').delete().eq('id', a.asset.id); await sb.storage.from('documente').remove([path]) }
}
