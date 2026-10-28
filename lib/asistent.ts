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
import { GET as cautaGET } from '@/app/api/documente/cautare/route'

// Asistentul AI al ContaFlow (pop-up global): uneltele pe care Claude le poate folosi peste toata
// platforma. Uneltele de CITIRE ruleaza direct; cele care MODIFICA ceva nu ruleaza niciodata fara
// confirmarea utilizatorului (vezi CU_CONFIRMARE si /api/asistent).

type Sb = ReturnType<typeof getServiceSupabase>
type Firma = { id: string; slug: string; nume: string; culoare: string }

export const CU_CONFIRMARE = new Set(['bifeaza_sarcina', 'marcheaza_factura', 'memorie_proiect'])

const firmaProp = { type: 'string', description: 'Slug-ul firmei (ex. "ab-textile", "ab-homes-invest", "abxhomes", "proiect-ab-textile"). Vezi lista de firme din instrucțiuni.' }
const lunaProp = { type: 'string', description: 'Luna de lucru, format AAAA-LL (ex. "2026-10" = lucrat în octombrie pentru perioada contabilă septembrie). Implicit: luna de lucru curentă.' }

export const TOOLS: Anthropic.Tool[] = [
  { name: 'de_facut', description: 'Lista „De făcut” pentru TOATE firmele pe luna de lucru: termene impozite, tranzacții nedocumentate, facturi în așteptare, restanțe, următorul modul nebifat. Bun ca prim pas la „ce am de făcut?”.',
    input_schema: { type: 'object', properties: { luna: lunaProp }, additionalProperties: false } },
  { name: 'stare_firma', description: 'Situația detaliată a unei firme pe o lună: modulele cu sarcinile bifate/nebifate, extrase, tranzacții fără document, mailuri contabil deschise, impozite.',
    input_schema: { type: 'object', properties: { firma: firmaProp, luna: lunaProp }, required: ['firma'], additionalProperties: false } },
  { name: 'cauta', description: 'Căutare globală în documente, facturi, bonuri, modele și tranzacții bancare — după furnizor, număr de factură, sumă (ex. "300" sau "1125,63"), dată sau text. Fără firmă caută în toate firmele.',
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'Ce cauți (minim 2 caractere).' }, firma: firmaProp }, required: ['text'], additionalProperties: false } },
  { name: 'tranzactii', description: 'Tranzacțiile din extrasele de cont ale unei firme pe o lună (perioada contabilă a lunii de lucru). Poate filtra doar pe cele fără document, după tip sau după text.',
    input_schema: { type: 'object', properties: { firma: firmaProp, luna: lunaProp, doar_fara_document: { type: 'boolean' }, tip: { type: 'string', enum: ['credit', 'debit'] }, text: { type: 'string' } }, required: ['firma'], additionalProperties: false } },
  { name: 'facturi_neplatite', description: 'Facturile de furnizor neplătite ale unei firme (din Facturi restante și Inbox Facturi), cu sumă, dată și ID-ul documentului.',
    input_schema: { type: 'object', properties: { firma: firmaProp }, required: ['firma'], additionalProperties: false } },
  { name: 'proiect', description: 'Tot contextul PROIECT AB Textile (fonduri europene PROSOCIAL): obligații recurente pe luni, rutina lunii, achiziții cu documente, rapoarte lunare, contabilitatea AB TEXTILE SRL.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'bifeaza_sarcina', description: 'MODIFICĂ: bifează sau debifează o sarcină (task) dintr-un modul al unei firme pe o lună. Cere confirmarea utilizatorului. Folosește cheile exacte din stare_firma.',
    input_schema: { type: 'object', properties: { firma: firmaProp, luna: lunaProp, task_key: { type: 'string' }, completat: { type: 'boolean' } }, required: ['firma', 'task_key', 'completat'], additionalProperties: false } },
  { name: 'marcheaza_factura', description: 'MODIFICĂ: marchează o factură (document) ca plătită sau neplătită. Cere confirmarea utilizatorului. Folosește ID-ul din facturi_neplatite sau cauta.',
    input_schema: { type: 'object', properties: { document_id: { type: 'string' }, platit: { type: 'boolean' }, data_platii: { type: 'string', description: 'AAAA-LL-ZZ, opțional' } }, required: ['document_id', 'platit'], additionalProperties: false } },
  { name: 'memorie_proiect', description: 'MODIFICĂ: adaugă un fapt în Memoria PROIECT AB Textile (ce s-a întâmplat efectiv). Cere confirmarea utilizatorului.',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, categorie: { type: 'string', enum: [...CATEGORII_MEMORIE] }, data: { type: 'string', description: 'AAAA-LL-ZZ, implicit azi' } }, required: ['text'], additionalProperties: false } },
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
      const module = getFirmaModules(f.slug).map(m => ({ modul: m.label, link: `/${f.slug}/${luna}/${m.slug}`, sarcini: m.tasks.map(t => ({ task_key: t.key, sarcina: t.label, bifat: bifate.has(t.key) })) }))
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
      const task = getFirmaModules(f.slug).flatMap(m => m.tasks).find(t => t.key === str(input.task_key))
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
- Uneltele care modifică date (bifeaza_sarcina, marcheaza_factura, memorie_proiect) cer confirmarea utilizatorului în interfață — propune-le doar când utilizatorul a cerut sau a fost de acord cu acțiunea; după confirmare raportează scurt rezultatul.
- Facturi noi: utilizatorul le atașează în fereastra asistentului și ele intră automat în Inbox Facturi; tu vezi rezultatul în mesaj.
- Imagini: utilizatorul poate lipi (Ctrl/⌘+V) capturi de ecran sau poze — o factură, un extras, un mail, o eroare din aplicație — iar tu le vezi și lucrezi pe baza lor. Citește tot ce se vede (furnizor, număr, dată, sumă, valută, IBAN), verifică în platformă cu uneltele de citire (cauta, facturi_neplatite, tranzactii) și spune clar ce e sigur și ce nu se vede bine. Imaginile NU se salvează în platformă: dacă e o factură de păstrat, spune-i să o atașeze (PDF/JPG) cu agrafa, ca să intre în Inbox Facturi.
- Pune linkuri către paginile relevante ca markdown, cu căi relative: [Extras de cont](/ab-textile/2026-10/extras). Linkurile către documente (/api/chitante/document?id=...) la fel, dar se deschid într-o previzualizare (pop-up) în fereastra asistentului, nu se descarcă: scrie-le cu eticheta „Vezi”, nu „Descarcă”.
- Răspunsuri scurte și structurate: rezultatul întâi, apoi detalii în liste scurte. Sume cu 2 zecimale și „lei”.`
  return { fix, variabil }
}
