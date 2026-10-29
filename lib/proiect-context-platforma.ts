import type { SupabaseClient } from '@supabase/supabase-js'
import { MODULE_DEFS, getFirmaTotalTasks } from '@/lib/firma-config'
import { STEP_LABELS, TASKS, PROFILE_FIELDS } from '@/lib/proiect-workflow'
import { readWorkflow } from '@/lib/proiect-workflow-store'
import { workMonthLabel, accountingPeriodLabel } from '@/lib/accounting-period'
import { CATEGORII, type Punct } from '@/lib/mail-contabil-tipuri'
import { bugetText, type PlataProiect } from '@/lib/proiect-buget'

// "Intreaba proiectul" - TOT ce exista in platforma pentru AB TEXTILE, ca AI-ul sa nu mai ceara
// utilizatorului sa copieze date care sunt deja in ContaFlow:
//  - PROIECT AB Textile (firma proiect-ab-textile): executia bugetului (buget AA3 minus platile), obligatii recurente pe fiecare luna (scadenta,
//    trimis, documente atasate, sugestii din mail), rutina lunara (pasii din proiect-workflow),
//    achizitiile cu documentele pe etape, toate rapoartele lunare + campurile custom, documentele;
//  - AB TEXTILE S.R.L. (firma ab-textile, contabilitatea firmei): pe luni - progres module,
//    extrase si tranzactii (cu cele nedocumentate), documentele incarcate, facturi neplatite,
//    mailurile contabilului cu punctele nerezolvate.
// Fiecare sursa e citita separat; o tabela lipsa / o eroare nu blocheaza restul.

const LUNI_DETALIATE = 12
const MAX_CARACTERE = 90000

type Row = Record<string, any>
const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataRo = (d: unknown) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('.') : '' }
const scurt = (s: unknown, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const suma = (v: unknown, valuta?: unknown) => v == null || v === '' ? '' : `${lei(Number(v))} ${String(valuta || 'RON').toUpperCase()}`

async function citeste(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  try { const { data, error } = await p; return error ? [] : (data as Row[]) || [] } catch { return [] }
}
async function citestePaginat(load: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = []
  for (let a = 0; a < 20000; a += 1000) {
    const page = await citeste(load(a, a + 999))
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}
const inBucati = async (ids: string[], load: (ids: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += 150) out.push(...await citeste(load(ids.slice(i, i + 150))))
  return out
}

function linieDocument(d: Row): string {
  return [d.tip_document || d.modul, d.furnizor && scurt(String(d.furnizor).split('|')[0], 60), d.numar_document && `nr. ${d.numar_document}`,
    dataRo(d.data_document), suma(d.suma, d.valuta), d.platit === false && d.suma != null ? 'neplătită' : d.platit ? 'plătită' : '', `„${scurt(d.fisier_nume, 70)}”`]
    .filter(Boolean).join(' · ')
}

// ---------------- PROIECT AB Textile ----------------
async function contextProiect(sb: SupabaseClient, firmaId: string): Promise<string> {
  const out: string[] = []
  const luni = (await citeste(sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId).order('luna', { ascending: false })))
  const lunaKey = new Map(luni.map(l => [l.id as string, String(l.luna).slice(0, 7)]))
  const lunaIds = luni.map(l => l.id as string)
  const obligatiiDef = MODULE_DEFS['obligatii-recurente'].tasks

  const [stari, sugObl, docs, achizitii, sugAch, rapoarte, custom] = await Promise.all([
    lunaIds.length ? inBucati(lunaIds, ids => sb.from('obligatii_stari').select('id,luna_id,tip_key,scadenta,trimis,updated_at').in('luna_id', ids)) : Promise.resolve([]),
    lunaIds.length ? inBucati(lunaIds, ids => sb.from('obligatii_sugestii').select('luna_id,tip_key,tip_sugestie,valoare_data,incredere,sursa_subiect,sursa_data,sursa_rezumat,status').in('luna_id', ids).eq('status', 'noua')) : Promise.resolve([]),
    citestePaginat((a, b) => sb.from('documente').select('id,luna_id,modul,tip_document,furnizor,numar_document,data_document,suma,valuta,platit,fisier_nume,achizitie_id,obligatie_stare_id').eq('firma_id', firmaId).order('id').range(a, b)),
    citeste(sb.from('proiect_achizitii').select('*').eq('firma_id', firmaId).order('created_at')),
    citeste(sb.from('achizitii_sugestii').select('achizitie_id,actiune,denumire,valoare,sursa,status_propus,incredere,sursa_subiect,sursa_data,sursa_rezumat').eq('firma_id', firmaId).eq('status', 'noua')),
    citeste(sb.from('proiect_raport_campuri').select('*').eq('firma_id', firmaId).order('updated_at', { ascending: false })),
    citeste(sb.from('proiect_raport_campuri_custom').select('*').eq('firma_id', firmaId)),
  ])

  // Obligatii recurente + rutina lunara, cele mai noi luni primele
  const workflowSettings = await readWorkflow(`${firmaId}/workflow/settings`).catch(() => null)
  if (workflowSettings?.profile) {
    const p = Object.entries(workflowSettings.profile).filter(([, v]) => v).map(([k, v]) => `${PROFILE_FIELDS[k as keyof typeof PROFILE_FIELDS] || k}: ${v}`).join('; ')
    if (p) out.push(`Profil beneficiar (setări proiect): ${p}`)
  }
  const blocLuni: string[] = []
  for (const l of luni.slice(0, LUNI_DETALIATE)) {
    const key = lunaKey.get(l.id)!
    const rand: string[] = [`### ${workMonthLabel(key)} (luna de lucru)`]
    const st = stari.filter(s => s.luna_id === l.id)
    if (st.length) {
      rand.push('Obligații recurente (modulul „Obligații recurente”):')
      for (const def of obligatiiDef) {
        const s = st.find(x => x.tip_key === def.key)
        if (!s) continue
        const nrDoc = docs.filter(d => d.obligatie_stare_id === s.id)
        rand.push(`- ${def.label} → ${def.destinatar || '?'} | scadență ${dataRo(s.scadenta) || '—'} | ${s.trimis ? 'TRIMIS' : 'netrimis'}${nrDoc.length ? ` | documente: ${nrDoc.map(d => `„${scurt(d.fisier_nume, 60)}”`).join(', ')}` : ''}`)
      }
      const sg = sugObl.filter(s => s.luna_id === l.id)
      for (const s of sg) rand.push(`  · sugestie din mail neconfirmată (${s.tip_key}, ${s.tip_sugestie}${s.valoare_data ? ' ' + dataRo(s.valoare_data) : ''}, ${s.incredere}): „${scurt(s.sursa_subiect, 80)}” ${dataRo(s.sursa_data)} — ${scurt(s.sursa_rezumat, 160)}`)
    }
    const wf = await readWorkflow(`${firmaId}/workflow/month-${l.id}`).catch(() => null)
    if (wf?.version) {
      rand.push('Rutina lunară (pașii proiectului):')
      for (const t of TASKS) {
        const s = wf.tasks[t.key]
        if (!s) continue
        rand.push(`- ${t.title} (${t.source}) | ${STEP_LABELS[s.status] || s.status}${s.due ? ` | termen ${dataRo(s.due)}` : ''}${s.note ? ` | notă: ${scurt(s.note, 200)}` : ''}`)
      }
      const fis = wf.assets || []
      if (fis.length) rand.push(`Fișiere în rutină: ${fis.map(a => `${a.task}: „${scurt(a.name, 60)}”`).join('; ')}`)
    }
    const dl = docs.filter(d => d.luna_id === l.id && !d.obligatie_stare_id && !d.achizitie_id)
    if (dl.length) rand.push(`Alte documente încărcate în lună: ${dl.slice(0, 30).map(linieDocument).join(' | ')}${dl.length > 30 ? ` (+${dl.length - 30})` : ''}`)
    if (rand.length > 1) blocLuni.push(rand.join('\n'))
  }
  if (luni.length > LUNI_DETALIATE) blocLuni.push(`(Încă ${luni.length - LUNI_DETALIATE} luni mai vechi, nedetaliate.)`)

  // Achizitii detaliate
  const ach: string[] = []
  for (const a of achizitii) {
    const d = docs.filter(x => x.achizitie_id === a.id)
    const extra = Object.entries(a).filter(([k, v]) => v != null && v !== '' && !['id', 'firma_id', 'luna_id', 'created_at', 'updated_at', 'denumire', 'valoare', 'sursa', 'status', 'scadenta', 'nota', 'linie_buget'].includes(k) && typeof v !== 'object').map(([k, v]) => `${k}: ${scurt(v, 80)}`)
    ach.push(`- ${a.denumire} | ${a.valoare != null ? lei(Number(a.valoare)) + ' lei' : 'fără valoare'} | ${a.sursa || '?'} | linia ${a.linie_buget || '—'} | etapa: ${a.status}${a.scadenta ? ` | termen ${dataRo(a.scadenta)}` : ''}${a.luna_id && lunaKey.get(a.luna_id) ? ` | luna ${workMonthLabel(lunaKey.get(a.luna_id)!)}` : ''}${a.nota ? ` | notă: ${scurt(a.nota, 200)}` : ''}${extra.length ? ` | ${extra.join('; ')}` : ''}`)
    if (d.length) ach.push(`  documente: ${d.map(linieDocument).join(' | ')}`)
    const wf = await readWorkflow(`${firmaId}/workflow/purchase-${a.id}`).catch(() => null)
    if (wf?.version) {
      for (const [kind, f] of Object.entries(wf.forms || {})) {
        const campuri = Object.entries(f.fields || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${scurt(v, 100)}`).join('; ')
        const linii = (f.lines || []).map(x => `${scurt(x.product, 50)} ×${x.qty} ${x.price ? x.price + ' ' + x.currency : ''}${x.supplier ? ' @' + scurt(x.supplier, 40) : ''}`).join('; ')
        ach.push(`  formular ${kind}: ${campuri}${linii ? ` | poziții: ${linii}` : ''}`)
      }
      if (wf.assets?.length) ach.push(`  fișiere: ${wf.assets.map(x => `${x.task}: „${scurt(x.name, 60)}”`).join('; ')}`)
    }
  }
  for (const s of sugAch) ach.push(`  · sugestie din mail neconfirmată (${s.actiune}${s.denumire ? ' ' + s.denumire : ''}${s.status_propus ? ' → ' + s.status_propus : ''}${s.valoare != null ? ', ' + lei(Number(s.valoare)) + ' lei' : ''}, ${s.incredere}): „${scurt(s.sursa_subiect, 80)}” ${dataRo(s.sursa_data)} — ${scurt(s.sursa_rezumat, 160)}`)
  // Executia bugetului: bugetul AA3 minus platile din registrul proiect_plati (tab-ul „Buget și plăți”)
  const plati = await citeste(sb.from('proiect_plati').select('id,linie_cod,data,suma,sursa,descriere,beneficiar').eq('firma_id', firmaId))
  out.push(`## ${bugetText(plati.map(p => ({ ...p, suma: Number(p.suma) })) as PlataProiect[])}`)
  out.push(`## Achiziții (modulul „Achiziții”, detaliat)\n${ach.join('\n') || '(nicio achiziție)'}`)

  // Toate rapoartele lunare
  const rap = rapoarte.map(r => Object.entries(r).filter(([k, v]) => v && !['id', 'firma_id', 'updated_at', 'created_at'].includes(k)).map(([k, v]) => `${k}: ${scurt(typeof v === 'object' ? JSON.stringify(v) : v, 500)}`).join('\n')).join('\n---\n')
  out.push(`## Rapoarte lunare completate în ContaFlow (toate, cel mai nou primul)\n${rap || '(niciunul)'}`)
  if (custom.length) out.push(`Câmpuri suplimentare ale raportului: ${custom.map(c => `${c.eticheta || c.cheie}: ${scurt(c.valoare, 200)}`).join(' | ')}`)
  out.push(`## Pe luni — obligații, rutină, documente\n${blocLuni.join('\n\n') || '(nicio lună deschisă)'}`)
  return out.join('\n\n')
}

// ---------------- AB TEXTILE S.R.L. (contabilitatea firmei) ----------------
async function contextFirma(sb: SupabaseClient, firmaId: string, slug: string): Promise<string> {
  const out: string[] = []
  const [firma] = await citeste(sb.from('firme').select('nume,cui,nr_reg_com,adresa,judet').eq('id', firmaId).limit(1))
  if (firma) out.push(`Date firmă: ${Object.entries(firma).filter(([, v]) => v).map(([k, v]) => `${k}: ${scurt(v, 80)}`).join('; ')}`)
  const luni = await citeste(sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId).order('luna', { ascending: false }))
  const recente = luni.slice(0, LUNI_DETALIATE)
  const ids = recente.map(l => l.id as string)
  const totalTasks = getFirmaTotalTasks(slug)

  const [taskuri, extrase, docs, mailuri] = await Promise.all([
    ids.length ? inBucati(ids, x => sb.from('task_stari').select('luna_id,task_key,completat').in('luna_id', x)) : Promise.resolve([]),
    ids.length ? inBucati(ids, x => sb.from('extrase').select('id,luna_id,valuta,iban,nr_tranzactii,nr_documentate,sold_final').in('luna_id', x)) : Promise.resolve([]),
    citestePaginat((a, b) => sb.from('documente').select('id,luna_id,modul,tip_document,furnizor,numar_document,data_document,suma,valuta,platit,fisier_nume').eq('firma_id', firmaId).order('id').range(a, b)),
    citeste(sb.from('mail_contabil').select('*').eq('firma_id', firmaId).order('created_at', { ascending: false }).limit(20)),
  ])
  const tranzactii = extrase.length ? await inBucati(extrase.map(e => e.id), x => sb.from('tranzactii').select('extras_id,data_tranzactie,tip,suma,valuta,descriere_curatata,descriere,categorie,document_id,note').in('extras_id', x)) : []

  const bloc: string[] = []
  for (const [idx, l] of recente.entries()) {
    const key = String(l.luna).slice(0, 7)
    const rand: string[] = [`### Lucrat în ${workMonthLabel(key)} — perioada ${accountingPeriodLabel(key)}`]
    const t = taskuri.filter(x => x.luna_id === l.id)
    rand.push(`Progres module: ${t.filter(x => x.completat).length}/${totalTasks} sarcini bifate${t.length ? ` (bifate: ${t.filter(x => x.completat).map(x => x.task_key).join(', ') || '—'})` : ''}`)
    const ex = extrase.filter(e => e.luna_id === l.id)
    for (const e of ex) {
      const tx = tranzactii.filter(x => x.extras_id === e.id)
      const tot = (tip: string) => tx.filter(x => x.tip === tip).reduce((s, x) => s + Math.abs(Number(x.suma) || 0), 0)
      const fara = tx.filter(x => !x.document_id && x.note !== 'na')
      rand.push(`Extras ${e.valuta || 'RON'}${e.iban ? ' ' + e.iban : ''}: ${tx.length} tranzacții, încasări ${lei(tot('credit'))}, plăți ${lei(tot('debit'))}${e.sold_final != null ? `, sold final ${lei(Number(e.sold_final))}` : ''}; ${fara.length} fără document`)
      // Ultimele 3 luni: toate tranzactiile; cele mai vechi: doar cele fara document (restul ar umple promptul).
      const complet = idx < 3
      const lista = (complet ? tx : fara).slice().sort((a, b) => String(a.data_tranzactie).localeCompare(String(b.data_tranzactie)))
      const max = complet ? 60 : 25
      for (const x of lista.slice(0, max))
        rand.push(`  - ${dataRo(x.data_tranzactie)} ${x.tip === 'credit' ? '+' : '−'}${suma(Math.abs(Number(x.suma)), x.valuta)} | ${scurt(x.descriere_curatata || x.descriere, 90)}${x.categorie ? ` | ${x.categorie}` : ''} | ${x.document_id ? 'documentată' : x.note === 'na' ? 'ignorată' : 'FĂRĂ DOCUMENT'}`)
      if (lista.length > max) rand.push(`  (+${lista.length - max} tranzacții${complet ? '' : ' fără document'})`)
    }
    if (!ex.length) rand.push('Extras de cont: neîncărcat')
    const dl = docs.filter(d => d.luna_id === l.id)
    if (dl.length) {
      const peModul = new Map<string, Row[]>()
      for (const d of dl) peModul.set(d.modul || 'altele', [...(peModul.get(d.modul || 'altele') || []), d])
      for (const [m, lista] of peModul) rand.push(`Documente ${MODULE_DEFS[m as keyof typeof MODULE_DEFS]?.label || m} (${lista.length}): ${lista.slice(0, 25).map(linieDocument).join(' | ')}${lista.length > 25 ? ` (+${lista.length - 25})` : ''}`)
    }
    bloc.push(rand.join('\n'))
  }
  if (luni.length > LUNI_DETALIATE) bloc.push(`(Încă ${luni.length - LUNI_DETALIATE} luni mai vechi, nedetaliate.)`)

  const neplatite = docs.filter(d => d.platit === false && d.suma != null && Number(d.suma) > 0 && ['facturi-restante', 'inbox-facturi'].includes(d.modul))
  if (neplatite.length) out.push(`Facturi furnizori neplătite: ${neplatite.slice(0, 40).map(linieDocument).join(' | ')}`)

  const m: string[] = []
  for (const mail of mailuri) {
    const puncte = (Array.isArray(mail.puncte) ? mail.puncte : []) as Punct[]
    const deschise = puncte.filter(p => p.status !== 'rezolvat' && !p.rezolvatManual)
    m.push(`- ${dataRo(mail.data_mail || mail.created_at)} „${scurt(mail.subiect, 80)}”: ${puncte.length} puncte, ${deschise.length} nerezolvate${deschise.length ? ' — ' + deschise.map(p => `[${CATEGORII[p.categorie] || p.categorie}, ${p.status}] ${scurt(p.titlu || p.cerere, 100)}${p.suma != null ? ' ' + lei(Number(p.suma)) + ' lei' : ''}`).join('; ') : ''}`)
  }
  if (m.length) out.push(`Mailurile contabilului (modulul „Mail contabil”):\n${m.join('\n')}`)
  out.push(`## Pe luni\n${bloc.join('\n\n') || '(nicio lună contabilă)'}`)
  return out.join('\n\n')
}

export async function contextPlatforma(sb: SupabaseClient, firmaIdProiect: string): Promise<string> {
  const firme = await citeste(sb.from('firme').select('id,slug,nume').in('slug', ['proiect-ab-textile', 'ab-textile']))
  const firmaSrl = firme.find(f => f.slug === 'ab-textile')
  const [proiect, srl] = await Promise.all([
    contextProiect(sb, firmaIdProiect).catch(e => `(eroare la citire: ${e instanceof Error ? e.message : e})`),
    firmaSrl ? contextFirma(sb, firmaSrl.id, firmaSrl.slug).catch(e => `(eroare la citire: ${e instanceof Error ? e.message : e})`) : Promise.resolve('(firma AB TEXTILE nu e în platformă)'),
  ])
  // Fiecare sectiune are plafonul ei, ca o firma cu multe tranzactii sa nu acopere datele proiectului.
  const taie = (t: string) => t.length > MAX_CARACTERE / 2 ? t.slice(0, MAX_CARACTERE / 2) + '\n(… trunchiat — lunile mai vechi sunt în platformă)' : t
  return `DATE DIN PLATFORMA CONTAFLOW (toate modulele, citite acum)

# PROIECT AB Textile — modulele Plan, Raport lunar, Obligații recurente, Achiziții
${taie(proiect)}

# AB TEXTILE S.R.L. — contabilitatea firmei (Extras, Facturi, Angajați, Acte contabile, Bonuri, Impozite, Mail contabil…)
${taie(srl)}`
}
