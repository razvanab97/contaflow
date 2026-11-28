import type Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase/server'
import { getFirmaModules, getFirmaConfig, esteLunaCalendaristica } from '@/lib/firma-config'
import { currentWorkMonthKey, accountingPeriodLabel, workMonthLabel } from '@/lib/accounting-period'
import { getDeFacut } from '@/lib/de-facut'
import { getStareFirma } from '@/lib/sistem-lucru'
import { getRestanteCount } from '@/lib/db'
import { contextPlatforma } from '@/lib/proiect-context-platforma'
import { adaugaMemorie, CATEGORII_MEMORIE } from '@/lib/proiect-memorie'
import { MOTIVE_IGNORARE } from '@/lib/tranzactii-reguli'
import { GET as cautaGET } from '@/app/api/documente/cautare/route'

// Asistentul AI al ContaFlow (pop-up global): uneltele pe care Claude le poate folosi peste toata
// platforma. Uneltele de CITIRE ruleaza direct; cele care MODIFICA ceva nu ruleaza niciodata fara
// confirmarea utilizatorului (vezi CU_CONFIRMARE si /api/asistent).

type Sb = ReturnType<typeof getServiceSupabase>
type Firma = { id: string; slug: string; nume: string; culoare: string }

export const CU_CONFIRMARE = new Set(['bifeaza_sarcina', 'marcheaza_factura', 'memorie_proiect',
  'muta_factura', 'schimba_luna_factura', 'marcheaza_tranzactie', 'pune_memento', 'rezolva_memento'])

const MOTIVE_KEYS = MOTIVE_IGNORARE.map(m => m.key)
const MOTIVE_SET = new Set<string>(MOTIVE_KEYS)

const firmaProp = { type: 'string', description: 'Slug-ul firmei (ex. "ab-textile", "ab-homes-invest", "abxhomes", "proiect-ab-textile"). Vezi lista de firme din instrucțiuni.' }
const lunaProp = { type: 'string', description: 'Luna de lucru, format AAAA-LL (ex. "2026-10" = lucrat în octombrie pentru perioada contabilă septembrie). Implicit: luna de lucru curentă.' }

export const TOOLS: Anthropic.Tool[] = [
  { name: 'de_facut', description: 'Lista „De făcut” pentru TOATE firmele pe luna de lucru: termene impozite, tranzacții nedocumentate, facturi în așteptare, restanțe, mementouri scadente (reminder-e), următorul modul nebifat. Bun ca prim pas la „ce am de făcut?”.',
    input_schema: { type: 'object', properties: { luna: lunaProp }, additionalProperties: false } },
  { name: 'stare_firma', description: 'Situația detaliată a unei firme pe o lună: modulele cu sarcinile bifate/nebifate, extrase, tranzacții fără document, mailuri contabil deschise, impozite.',
    input_schema: { type: 'object', properties: { firma: firmaProp, luna: lunaProp }, required: ['firma'], additionalProperties: false } },
  { name: 'cauta', description: 'Căutare globală în documente, facturi, bonuri, modele și tranzacții bancare — după furnizor, număr de factură, sumă (ex. "300" sau "1125,63"), dată sau text. Fără firmă caută în toate firmele.',
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'Ce cauți (minim 2 caractere).' }, firma: firmaProp }, required: ['text'], additionalProperties: false } },
  { name: 'tranzactii', description: 'Tranzacțiile din extrasele de cont ale unei firme pe o lună (perioada contabilă a lunii de lucru). Poate filtra doar pe cele fără document, după tip sau după text.',
    input_schema: { type: 'object', properties: { firma: firmaProp, luna: lunaProp, doar_fara_document: { type: 'boolean' }, tip: { type: 'string', enum: ['credit', 'debit'] }, text: { type: 'string' } }, required: ['firma'], additionalProperties: false } },
  { name: 'facturi_neplatite', description: 'Facturile de furnizor neplătite ale unei firme (din Facturi restante și Inbox Facturi), cu sumă, dată și ID-ul documentului.',
    input_schema: { type: 'object', properties: { firma: firmaProp }, required: ['firma'], additionalProperties: false } },
  { name: 'proiect', description: 'Tot contextul PROIECT AB Textile (fonduri europene PROSOCIAL): execuția bugetului (cât s-a plătit, cât rămâne pe fiecare linie, plăți care urmează), obligații recurente pe luni, rutina lunii, achiziții cu documente, rapoarte lunare, contabilitatea AB TEXTILE SRL.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'bifeaza_sarcina', description: 'MODIFICĂ: bifează sau debifează o sarcină (task) dintr-un modul al unei firme pe o lună. Cere confirmarea utilizatorului. Folosește cheile exacte din stare_firma.',
    input_schema: { type: 'object', properties: { firma: firmaProp, luna: lunaProp, task_key: { type: 'string' }, completat: { type: 'boolean' } }, required: ['firma', 'task_key', 'completat'], additionalProperties: false } },
  { name: 'marcheaza_factura', description: 'MODIFICĂ: marchează o factură (document) ca plătită sau neplătită. Cere confirmarea utilizatorului. Folosește ID-ul din facturi_neplatite sau cauta.',
    input_schema: { type: 'object', properties: { document_id: { type: 'string' }, platit: { type: 'boolean' }, data_platii: { type: 'string', description: 'AAAA-LL-ZZ, opțional' } }, required: ['document_id', 'platit'], additionalProperties: false } },
  { name: 'memorie_proiect', description: 'MODIFICĂ: adaugă un fapt în Memoria PROIECT AB Textile (ce s-a întâmplat efectiv). Cere confirmarea utilizatorului.',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, categorie: { type: 'string', enum: [...CATEGORII_MEMORIE] }, data: { type: 'string', description: 'AAAA-LL-ZZ, implicit azi' } }, required: ['text'], additionalProperties: false } },
  { name: 'muta_factura', description: 'MODIFICĂ: mută o factură (document) la ALTĂ firmă. Folosește-o când o factură a intrat la firma greșită (ex. utilități emise pe numele unei persoane, repartizate greșit). Reatribuie firma, o pune în luna contabilă potrivită după data facturii și desface plata greșită de pe firma veche (factura rămâne neplătită până se potrivește cu plata corectă a firmei noi). Cere confirmarea. Document_id din cauta/facturi_neplatite.',
    input_schema: { type: 'object', properties: { document_id: { type: 'string' }, firma_destinatie: { ...firmaProp, description: 'Slug-ul firmei la care se mută factura.' } }, required: ['document_id', 'firma_destinatie'], additionalProperties: false } },
  { name: 'schimba_luna_factura', description: 'MODIFICĂ: mută o factură în altă LUNĂ contabilă a ACELEIAȘI firme (nu schimbă firma). Util când factura a intrat în luna greșită. Cere confirmarea.',
    input_schema: { type: 'object', properties: { document_id: { type: 'string' }, luna: { ...lunaProp, description: 'Luna de lucru țintă, AAAA-LL.' } }, required: ['document_id', 'luna'], additionalProperties: false } },
  { name: 'marcheaza_tranzactie', description: 'MODIFICĂ: marchează o tranzacție din extras ca „ignorată” (nu are nevoie de document justificativ — ex. comision, transfer propriu, impozit) sau o readuce „de documentat”. La ignorare poți da și motivul. Cere confirmarea. Tranzactie_id din tranzactii.',
    input_schema: { type: 'object', properties: { tranzactie_id: { type: 'string' }, stare: { type: 'string', enum: ['ignorata', 'de_documentat'] }, motiv: { type: 'string', enum: MOTIVE_KEYS, description: 'Doar la stare=ignorata: motivul ignorării.' } }, required: ['tranzactie_id', 'stare'], additionalProperties: false } },
  { name: 'pune_memento', description: 'MODIFICĂ: salvează un memento (reminder) — ceva de făcut, opțional la o dată (ex. „plătește factura EON pe 02.12”). Apare în lista „De făcut” de pe Dashboard (și la întrebări gen „ce am de făcut/plătit”) până îl rezolvi. Firma opțională. Cere confirmarea.',
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'Ce să-ți amintesc (pe scurt).' }, data: { type: 'string', description: 'AAAA-LL-ZZ, opțional — când e scadent.' }, firma: { ...firmaProp, description: 'Firma la care se leagă mementoul (opțional).' } }, required: ['text'], additionalProperties: false } },
  { name: 'vezi_memento', description: 'Mementourile (reminder-urile) salvate — implicit doar cele nerezolvate, cu text, data scadentă, firmă și ID. Folosește ID-ul la rezolva_memento.',
    input_schema: { type: 'object', properties: { doar_deschise: { type: 'boolean', description: 'Implicit true (doar nerezolvate). false = și cele rezolvate.' }, firma: firmaProp }, additionalProperties: false } },
  { name: 'rezolva_memento', description: 'MODIFICĂ: marchează un memento ca rezolvat (sau îl redeschide). Cere confirmarea. Memento_id din vezi_memento.',
    input_schema: { type: 'object', properties: { memento_id: { type: 'string' }, rezolvat: { type: 'boolean', description: 'Implicit true (rezolvat). false = redeschide.' } }, required: ['memento_id'], additionalProperties: false } },
]

export async function firme(sb: Sb): Promise<Firma[]> {
  const { data } = await sb.from('firme').select('id,slug,nume,culoare').order('nume')
  return ((data || []) as Firma[]).filter(f => getFirmaConfig(f.slug))
}

const lei = (n: unknown) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const lunaValida = (v: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(str(v)) ? str(v) : currentWorkMonthKey()

async function lunaId(sb: Sb, firmaId: string, luna: string) {
  const { data } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId)
  return ((data || []) as { id: string; luna: string }[]).find(l => String(l.luna).startsWith(luna))?.id || null
}

const ziRo = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(str(d))
  ? new Date(str(d) + 'T00:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

// Luna contabila (luna_id) a unei firme in care intra o factura dupa data ei: luna de lucru = luna
// URMATOARE datei facturii (o factura din septembrie tine de contabilitatea lucrata in octombrie),
// cu cadere pe cea mai recenta luna deschisa daca aceea nu exista. Fara data: cea mai recenta luna.
export async function lunaIdPtData(sb: Sb, firmaId: string, dataDocument: string | null): Promise<string | null> {
  const { data } = await sb.from('luni_contabile').select('id,luna').eq('firma_id', firmaId)
  const luni = ((data || []) as { id: string; luna: string }[]).sort((a, b) => String(b.luna).localeCompare(String(a.luna)))
  if (!luni.length) return null
  const m = /^\d{4}-\d{2}-\d{2}$/.test(String(dataDocument || '')) ? String(dataDocument).slice(0, 7) : null
  if (!m) return luni[0].id
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo, 1)) // mo e 1-based -> indexul mo = luna urmatoare
  const workMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return luni.find(l => String(l.luna).startsWith(workMonth))?.id
    || luni.find(l => String(l.luna).slice(0, 7) <= workMonth)?.id
    || luni[0].id
}

// Descrierea pe scurt a unei actiuni care asteapta confirmarea (afisata in pop-up).
export async function descriereActiune(name: string, input: Record<string, unknown>, lista: Firma[]): Promise<string> {
  const f = lista.find(x => x.slug === input.firma)
  if (name === 'bifeaza_sarcina') {
    const task = f ? getFirmaModules(f.slug).flatMap(m => m.tasks.map(t => ({ ...t, modul: m.label }))).find(t => t.key === input.task_key) : null
    return `${input.completat ? 'Bifează' : 'Debifează'} „${task ? `${task.modul} · ${task.label}` : input.task_key}” la ${f?.nume || input.firma}, ${workMonthLabel(lunaValida(input.luna))}`
  }
  if (name === 'marcheaza_factura') {
    const { data } = await getServiceSupabase().from('documente').select('furnizor,numar_document,suma,valuta').eq('id', str(input.document_id)).maybeSingle()
    return `Marchează ${input.platit ? 'PLĂTITĂ' : 'neplătită'} factura ${data ? `${String(data.furnizor || '').split('|')[0]} ${data.numar_document ? 'nr. ' + data.numar_document : ''} · ${lei(data.suma)} ${data.valuta || 'RON'}` : input.document_id}${input.data_platii ? ` (plătită pe ${input.data_platii})` : ''}`
  }
  if (name === 'memorie_proiect') return `Adaugă în Memoria proiectului (${input.categorie || 'Altele'}${input.data ? ', ' + input.data : ''}): „${str(input.text)}”`
  if (name === 'muta_factura') {
    const dest = lista.find(x => x.slug === str(input.firma_destinatie))
    const { data } = await getServiceSupabase().from('documente').select('furnizor,numar_document,suma,valuta,firma_id').eq('id', str(input.document_id)).maybeSingle()
    const veche = data ? lista.find(x => x.id === data.firma_id)?.nume : null
    const et = data ? `${String(data.furnizor || '').split('|')[0]} ${data.numar_document ? 'nr. ' + data.numar_document : ''} · ${lei(data.suma)} ${data.valuta || 'RON'}` : str(input.document_id)
    return `Mută factura ${et} de la ${veche || '—'} la ${dest?.nume || input.firma_destinatie}`
  }
  if (name === 'schimba_luna_factura') {
    const { data } = await getServiceSupabase().from('documente').select('furnizor,numar_document').eq('id', str(input.document_id)).maybeSingle()
    const et = data ? `${String(data.furnizor || '').split('|')[0]}${data.numar_document ? ' nr. ' + data.numar_document : ''}` : str(input.document_id)
    return `Mută factura ${et} în ${workMonthLabel(lunaValida(input.luna))}`
  }
  if (name === 'marcheaza_tranzactie') {
    const { data } = await getServiceSupabase().from('tranzactii').select('data_tranzactie,suma,valuta,descriere_curatata,descriere').eq('id', str(input.tranzactie_id)).maybeSingle()
    const et = data ? `${data.data_tranzactie} · ${lei(data.suma)} ${data.valuta || 'RON'} · ${String(data.descriere_curatata || data.descriere || '').slice(0, 60)}` : str(input.tranzactie_id)
    const motiv = MOTIVE_IGNORARE.find(m => m.key === str(input.motiv))
    return input.stare === 'ignorata'
      ? `Marchează IGNORATĂ (fără document) tranzacția ${et}${motiv ? ` — ${motiv.label}` : ''}`
      : `Readu „de documentat” tranzacția ${et}`
  }
  if (name === 'pune_memento') {
    const fm = lista.find(x => x.slug === str(input.firma))
    return `Pune memento${ziRo(input.data) ? `, scadent ${ziRo(input.data)}` : ''}${fm ? ` (${fm.nume})` : ''}: „${str(input.text)}”`
  }
  if (name === 'rezolva_memento') {
    const { data } = await getServiceSupabase().from('memento').select('text').eq('id', str(input.memento_id)).maybeSingle()
    return `Marchează memento „${data ? String(data.text).slice(0, 80) : str(input.memento_id)}” ${input.rezolvat === false ? 'nerezolvat (redeschis)' : 'rezolvat'}`
  }
  return name
}

export async function executa(name: string, input: Record<string, unknown>, lista: Firma[]): Promise<string> {
  const sb = getServiceSupabase()
  const firma = (cerut = true) => {
    const f = lista.find(x => x.slug === str(input.firma))
    if (!f && cerut) throw new Error(`Firmă necunoscută: "${input.firma}". Firme valide: ${lista.map(x => x.slug).join(', ')}`)
    return f
  }

  switch (name) {
    case 'de_facut': {
      const luna = lunaValida(input.luna)
      const restante: Record<string, number> = {}
      await Promise.all(lista.map(async f => { restante[f.id] = await getRestanteCount(f.id) }))
      const items = await getDeFacut(lista, luna, restante)
      return JSON.stringify({ luna, eticheta: workMonthLabel(luna), items: items.map(i => ({ firma: i.firmaNume, titlu: i.titlu, detaliu: i.detaliu, urgenta: i.urgenta, zile: i.zile, link: i.href })) })
    }
    case 'stare_firma': {
      const f = firma()!, luna = lunaValida(input.luna)
      const id = await lunaId(sb, f.id, luna)
      const stare = await getStareFirma(sb, f, luna)
      const { data: stari } = id ? await sb.from('task_stari').select('task_key,completat').eq('luna_id', id) : { data: [] }
      const bifate = new Set(((stari || []) as { task_key: string; completat: boolean }[]).filter(s => s.completat).map(s => s.task_key))
      const module = getFirmaModules(f.slug, luna).map(m => ({ modul: m.label, link: `/${f.slug}/${luna}/${m.slug}`, sarcini: m.tasks.map(t => ({ task_key: t.key, sarcina: t.label, bifat: bifate.has(t.key) })) }))
      return JSON.stringify({ firma: f.nume, luna, perioada: esteLunaCalendaristica(f.slug) ? workMonthLabel(luna) : accountingPeriodLabel(luna), luna_deschisa: !!id, rezumat: { ...stare, lunaId: undefined }, module })
    }
    case 'cauta': {
      const text = str(input.text)
      if (text.length < 2) throw new Error('Textul de căutare trebuie să aibă minim 2 caractere.')
      const f = firma(false)
      const url = new URL('http://intern/api/documente/cautare'); url.searchParams.set('q', text); if (f) url.searchParams.set('firmaId', f.id)
      const rezultate = await (await cautaGET(new NextRequest(url))).json() as Record<string, unknown>[]
      const numeFirma = (id: unknown) => lista.find(x => x.id === id)?.nume
      return JSON.stringify({ total: rezultate.length, rezultate: rezultate.slice(0, 25).map(r => ({ id: r.id, firma: numeFirma(r.firmaId), nume: r.fisierNume, furnizor: r.furnizor, numar: r.numarDocument, suma: r.suma, valuta: r.valuta, data: r.dataDocument, unde: r.sectiune, luna: String(r.luna || '').slice(0, 7), descarca: r.downloadUrl || null })) })
    }
    case 'tranzactii': {
      const f = firma()!, luna = lunaValida(input.luna)
      const id = await lunaId(sb, f.id, luna)
      if (!id) return JSON.stringify({ firma: f.nume, luna, mesaj: 'Luna nu e deschisă în ContaFlow pentru această firmă.' })
      const { data: extrase } = await sb.from('extrase').select('id,valuta,iban').eq('luna_id', id)
      const ids = (extrase || []).map(e => e.id)
      if (!ids.length) return JSON.stringify({ firma: f.nume, luna, mesaj: 'Extrasul de cont nu e încărcat pentru această lună.' })
      let q = sb.from('tranzactii').select('id,data_tranzactie,tip,suma,valuta,descriere_curatata,descriere,categorie,document_id,note').in('extras_id', ids).order('data_tranzactie')
      if (input.tip === 'credit' || input.tip === 'debit') q = q.eq('tip', input.tip)
      const { data } = await q.limit(1000)
      let rows = (data || []) as Record<string, unknown>[]
      if (input.doar_fara_document) rows = rows.filter(t => !t.document_id && t.note !== 'na')
      const text = str(input.text).toLowerCase()
      if (text) rows = rows.filter(t => `${t.descriere_curatata} ${t.descriere}`.toLowerCase().includes(text))
      return JSON.stringify({ firma: f.nume, luna, perioada: accountingPeriodLabel(luna), link: `/${f.slug}/${luna}/extras`, total: rows.length, tranzactii: rows.slice(0, 80).map(t => ({ id: t.id, data: t.data_tranzactie, tip: t.tip, suma: t.suma, valuta: t.valuta, descriere: String(t.descriere_curatata || t.descriere || '').slice(0, 120), categorie: t.categorie, stare: t.document_id ? 'documentată' : t.note === 'na' ? 'ignorată' : 'fără document' })) })
    }
    case 'facturi_neplatite': {
      const f = firma()!
      const { data } = await sb.from('documente').select('id,furnizor,numar_document,suma,valuta,data_document,fisier_nume,modul').eq('firma_id', f.id).eq('platit', false).in('modul', ['facturi-restante', 'inbox-facturi']).gt('suma', 0).order('data_document', { ascending: false }).limit(60)
      return JSON.stringify({ firma: f.nume, link: `/${f.slug}/${currentWorkMonthKey()}/facturi-restante`, facturi: (data || []).map(d => ({ id: d.id, furnizor: String(d.furnizor || '').split('|')[0], numar: d.numar_document, suma: d.suma, valuta: d.valuta || 'RON', data: d.data_document, fisier: d.fisier_nume, descarca: `/api/chitante/document?id=${d.id}` })) })
    }
    case 'proiect': {
      const p = lista.find(x => x.slug === 'proiect-ab-textile')
      if (!p) return 'PROIECT AB Textile nu există în platformă.'
      return (await contextPlatforma(sb, p.id)).slice(0, 60000)
    }
    case 'bifeaza_sarcina': {
      const f = firma()!, luna = lunaValida(input.luna)
      const task = getFirmaModules(f.slug, luna).flatMap(m => m.tasks).find(t => t.key === str(input.task_key))
      if (!task) throw new Error(`Sarcina "${input.task_key}" nu există la ${f.nume}.`)
      const id = await lunaId(sb, f.id, luna)
      if (!id) throw new Error(`Luna ${luna} nu e deschisă pentru ${f.nume}.`)
      const { error } = await sb.from('task_stari').upsert({ luna_id: id, task_key: task.key, completat: !!input.completat, updated_at: new Date().toISOString() }, { onConflict: 'luna_id,task_key' })
      if (error) throw new Error(error.message)
      return `Gata: „${task.label}” ${input.completat ? 'bifată' : 'debifată'} la ${f.nume}, ${workMonthLabel(luna)}.`
    }
    case 'marcheaza_factura': {
      const id = str(input.document_id)
      const data = /^\d{4}-\d{2}-\d{2}$/.test(str(input.data_platii)) ? str(input.data_platii) : new Date().toISOString().slice(0, 10)
      const { data: doc, error } = await sb.from('documente').update({ platit: !!input.platit, data_platii: input.platit ? data : null }).eq('id', id).select('id').maybeSingle()
      if (error) throw new Error(error.message)
      if (!doc) throw new Error('Documentul nu a fost găsit.')
      return `Gata: factura a fost marcată ${input.platit ? `plătită (${data})` : 'neplătită'}.`
    }
    case 'memorie_proiect': {
      const p = lista.find(x => x.slug === 'proiect-ab-textile')
      if (!p) throw new Error('PROIECT AB Textile nu există în platformă.')
      const m = await adaugaMemorie(sb, p.id, { text: str(input.text), categorie: str(input.categorie), data: str(input.data) || undefined, sursa: 'chat' })
      if (!m) throw new Error('Nu am putut salva în memorie (tabelul proiect_memorie lipsește?).')
      return `Gata: reținut în Memoria proiectului (${m.data}, ${m.categorie}).`
    }
    case 'muta_factura': {
      const id = str(input.document_id)
      if (!id) throw new Error('Lipsește document_id.')
      const dest = lista.find(x => x.slug === str(input.firma_destinatie))
      if (!dest) throw new Error(`Firmă destinație necunoscută: "${input.firma_destinatie}". Firme valide: ${lista.map(x => x.slug).join(', ')}`)
      const { data: doc } = await sb.from('documente').select('id,firma_id,data_document,tranzactie_id,furnizor,numar_document,suma,valuta').eq('id', id).maybeSingle()
      if (!doc) throw new Error('Documentul nu a fost găsit.')
      if (doc.firma_id === dest.id) return `Factura e deja la ${dest.nume}.`
      const lunaDest = await lunaIdPtData(sb, dest.id, doc.data_document as string | null)
      if (!lunaDest) throw new Error(`${dest.nume} nu are nicio lună contabilă începută ca să primească factura. Pornește o lună la ${dest.nume} întâi.`)
      let plataDesfacuta = false
      if (doc.tranzactie_id) { await sb.from('tranzactii').update({ document_id: null }).eq('id', doc.tranzactie_id as string); plataDesfacuta = true }
      const { error } = await sb.from('documente').update({ firma_id: dest.id, luna_id: lunaDest, tranzactie_id: null, platit: false, data_platii: null }).eq('id', id)
      if (error) throw new Error(error.message)
      const et = `${String(doc.furnizor || '').split('|')[0]}${doc.numar_document ? ` nr. ${doc.numar_document}` : ''}`
      return `Gata: factura ${et} a fost mutată la ${dest.nume}, în luna ei contabilă.${plataDesfacuta ? ' Plata greșită de pe firma veche a fost desfăcută — se va potrivi cu plata corectă a lui ' + dest.nume + ' când redeschizi Extrasul.' : ''}`
    }
    case 'schimba_luna_factura': {
      const id = str(input.document_id)
      if (!id) throw new Error('Lipsește document_id.')
      const luna = lunaValida(input.luna)
      const { data: doc } = await sb.from('documente').select('id,firma_id,furnizor,numar_document').eq('id', id).maybeSingle()
      if (!doc) throw new Error('Documentul nu a fost găsit.')
      const lid = await lunaId(sb, doc.firma_id as string, luna)
      if (!lid) throw new Error(`Luna ${workMonthLabel(luna)} nu e deschisă pentru firma acestui document.`)
      const { error } = await sb.from('documente').update({ luna_id: lid }).eq('id', id)
      if (error) throw new Error(error.message)
      return `Gata: factura ${String(doc.furnizor || '').split('|')[0]}${doc.numar_document ? ` nr. ${doc.numar_document}` : ''} a fost mutată în ${workMonthLabel(luna)}.`
    }
    case 'marcheaza_tranzactie': {
      const id = str(input.tranzactie_id)
      if (!id) throw new Error('Lipsește tranzactie_id.')
      const stare = str(input.stare)
      if (stare !== 'ignorata' && stare !== 'de_documentat') throw new Error('stare trebuie să fie "ignorata" sau "de_documentat".')
      const motiv = stare === 'ignorata' && MOTIVE_SET.has(str(input.motiv)) ? str(input.motiv) : null
      const patch = stare === 'ignorata' ? { note: 'na', motiv_ignorare: motiv, ignorat_auto: false } : { note: null, motiv_ignorare: null, ignorat_auto: false }
      let { error } = await sb.from('tranzactii').update(patch).eq('id', id)
      if (error) { const r = await sb.from('tranzactii').update({ note: stare === 'ignorata' ? 'na' : null }).eq('id', id); error = r.error } // fallback fără coloana motiv_ignorare
      if (error) throw new Error(error.message)
      return stare === 'ignorata'
        ? `Gata: tranzacția a fost marcată ignorată (nu are nevoie de document${motiv ? `, motiv: ${MOTIVE_IGNORARE.find(m => m.key === motiv)?.label || motiv}` : ''}).`
        : 'Gata: tranzacția a fost readusă „de documentat”.'
    }
    case 'pune_memento': {
      const txt = str(input.text)
      if (!txt) throw new Error('Scrie ce să-ți amintesc (textul mementoului).')
      const f = firma(false)
      const data = /^\d{4}-\d{2}-\d{2}$/.test(str(input.data)) ? str(input.data) : null
      const { error } = await sb.from('memento').insert({ firma_id: f?.id || null, text: txt.slice(0, 500), data_scadenta: data, sursa: 'chat' })
      if (error) throw new Error(/relation .*memento.* does not exist|could not find the table|schema cache/i.test(error.message) ? 'Tabelul „memento" nu există încă — rulează migrarea supabase_memento.sql în Supabase.' : error.message)
      return `Gata: memento salvat${data ? `, scadent ${ziRo(data)}` : ''}${f ? ` (${f.nume})` : ''}. Apare în „De făcut" până îl rezolvi.`
    }
    case 'vezi_memento': {
      const f = firma(false)
      let q = sb.from('memento').select('id,firma_id,text,data_scadenta,rezolvat,created_at').order('data_scadenta', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }).limit(100)
      if (input.doar_deschise !== false) q = q.eq('rezolvat', false)
      if (f) q = q.eq('firma_id', f.id)
      const { data, error } = await q
      if (error) return JSON.stringify({ mesaj: 'Tabelul „memento" nu există încă (rulează supabase_memento.sql).', memento: [] })
      const numeFirma = (id: unknown) => lista.find(x => x.id === id)?.nume || null
      return JSON.stringify({ total: (data || []).length, memento: (data || []).map(m => ({ id: m.id, text: m.text, scadenta: m.data_scadenta, firma: numeFirma(m.firma_id), rezolvat: m.rezolvat })) })
    }
    case 'rezolva_memento': {
      const id = str(input.memento_id)
      if (!id) throw new Error('Lipsește memento_id.')
      const rez = input.rezolvat !== false
      const { data, error } = await sb.from('memento').update({ rezolvat: rez, rezolvat_at: rez ? new Date().toISOString() : null }).eq('id', id).select('id,text').maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Mementoul nu a fost găsit.')
      return `Gata: memento „${String(data.text).slice(0, 60)}" marcat ${rez ? 'rezolvat' : 'nerezolvat'}.`
    }
  }
  throw new Error(`Unealtă necunoscută: ${name}`)
}

// Partea fixa (cache-uita) si partea variabila (data, pagina deschisa) a instructiunilor.
export function instructiuni(lista: Firma[], pagina: { firma?: string; luna?: string; cale?: string }): { fix: string; variabil: string } {
  const azi = new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' })
  const variabil = `Azi: ${azi}. Luna de lucru curentă: ${currentWorkMonthKey()}. Pagina deschisă acum: ${pagina.cale || '—'}${pagina.firma ? ` (firma ${pagina.firma}${pagina.luna ? ', luna ' + pagina.luna : ''})` : ''}. Când utilizatorul spune „aici”, „firma asta”, „luna asta”, se referă la pagina deschisă.`
  const fix = `Ești asistentul ContaFlow — platforma de contabilitate și administrare a utilizatorului (un singur utilizator, administratorul firmelor de mai jos). Lucrezi în limba română, concis și practic.

FIRME (slug → nume): ${lista.map(f => `${f.slug} → ${f.nume}`).join('; ')}.
În ContaFlow, „luna de lucru” octombrie înseamnă perioada contabilă septembrie; excepție PROIECT AB Textile, unde luna e calendaristică.

CUM LUCREZI
- Scrie exclusiv în limba română — inclusiv propozițiile scurte de dinainte de a folosi o unealtă.
- Folosește uneltele ca să afli date reale; nu inventa sume, numere sau stări. Dacă ceva nu există în date, spune clar.
- Pentru „ce am de făcut” pornește de la de_facut; pentru o firmă anume, stare_firma; pentru facturi/plăți/documente, cauta; pentru PROIECT AB Textile, proiect.
- EȘTI UN ASISTENT CARE LUCREAZĂ, nu doar explică. Pe lângă citiri, POȚI executa acțiuni reale (cu confirmarea utilizatorului): bifezi/debifezi sarcini (bifeaza_sarcina), marchezi o factură plătită/neplătită (marcheaza_factura), MUȚI o factură la altă firmă (muta_factura) sau în altă lună (schimba_luna_factura), marchezi o tranzacție ignorată/de documentat (marcheaza_tranzactie), pui un memento cu dată (pune_memento), vezi/rezolvi mementouri (vezi_memento/rezolva_memento) și adaugi în memoria proiectului (memorie_proiect).
- NU spune „nu pot / nu am unealtă / trebuie să o faci manual” pentru ceva ce există ca unealtă mai sus — propune direct acțiunea potrivită (cu confirmare) și fă-o. Când utilizatorul descrie un task („mută factura X la firma Y”, „amintește-mi să plătesc pe 02.12”, „ignoră comisionul ăsta”, „factura asta e pe luna greșită”), rezolvă-l tu cu uneltele; întâi găsește obiectul cu o citire (cauta/facturi_neplatite/tranzactii) ca să ai ID-ul corect, apoi propune modificarea.
- Toate uneltele care MODIFICĂ cer confirmarea utilizatorului în interfață — propune-le doar când utilizatorul a cerut sau a fost de acord; după confirmare raportează scurt rezultatul. Dacă o acțiune are nevoie de ceva ce nu știi sigur (ex. la ce firmă să mut, ce dată are mementoul), întreabă scurt înainte.
- Mementourile (pune_memento) apar în lista „De făcut” de pe Dashboard; folosește-le ca „reminder” atunci când utilizatorul cere să-i amintești de o plată/un termen.
- Facturi noi: utilizatorul le atașează în fereastra asistentului și ele intră automat în Inbox Facturi; tu vezi rezultatul în mesaj.
- Imagini: utilizatorul poate lipi (Ctrl/⌘+V) capturi de ecran sau poze — o factură, un extras, un mail, o eroare din aplicație — iar tu le vezi și lucrezi pe baza lor. Citește tot ce se vede (furnizor, număr, dată, sumă, valută, IBAN), verifică în platformă cu uneltele de citire (cauta, facturi_neplatite, tranzactii) și spune clar ce e sigur și ce nu se vede bine. Imaginile NU se salvează în platformă: dacă e o factură de păstrat, spune-i să o atașeze (PDF/JPG) cu agrafa, ca să intre în Inbox Facturi.
- Pune linkuri către paginile relevante ca markdown, cu căi relative: [Extras de cont](/ab-textile/2026-10/extras). Linkurile către documente (/api/chitante/document?id=...) la fel, dar se deschid într-o previzualizare (pop-up) în fereastra asistentului, nu se descarcă: scrie-le cu eticheta „Vezi”, nu „Descarcă”.
- Răspunsuri scurte și structurate: rezultatul întâi, apoi detalii în liste scurte. Sume cu 2 zecimale și „lei”.`
  return { fix, variabil }
}
