import type { SupabaseClient } from '@supabase/supabase-js'

// Memoria proiectului (PROIECT AB Textile): ce s-a intamplat efectiv in proiect, in ordine cronologica -
// fapte scrise manual in "Plan & AI proiect", fapte retinute automat din chat ("am primit autorizatia
// de mediu azi") si schimbarile de stare din plan. E sursa comuna pentru AI-ul "Intreaba proiectul" si
// pentru completarea raportului lunar (si orice document viitor al proiectului).

export const CATEGORII_MEMORIE = ['Autorizații', 'Personal', 'Achiziții', 'Activitate și clienți', 'Social', 'Financiar', 'Raportare', 'Altele'] as const
export type CategorieMemorie = typeof CATEGORII_MEMORIE[number]
export type SursaMemorie = 'manual' | 'chat' | 'plan'
export interface Memorie { id: string; data: string; categorie: string; text: string; sursa: SursaMemorie; created_at?: string }

const lipsaTabel = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205'].includes(e.code || '')

export function categorieValida(c: unknown): CategorieMemorie {
  const s = String(c || '').trim().toLowerCase()
  return CATEGORII_MEMORIE.find(x => x.toLowerCase() === s) || CATEGORII_MEMORIE.find(x => s && x.toLowerCase().startsWith(s.slice(0, 5))) || 'Altele'
}
const dataValida = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : new Date().toISOString().slice(0, 10)

export async function listaMemorie(sb: SupabaseClient, firmaId: string, opts: { de?: string; pana?: string; limit?: number } = {}): Promise<{ memorie: Memorie[]; lipsaMigrare: boolean }> {
  let q = sb.from('proiect_memorie').select('id,data,categorie,text,sursa,created_at').eq('firma_id', firmaId)
  if (opts.de) q = q.gte('data', opts.de)
  if (opts.pana) q = q.lte('data', opts.pana)
  const { data, error } = await q.order('data', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limit || 300)
  if (error) return { memorie: [], lipsaMigrare: lipsaTabel(error) }
  return { memorie: (data || []) as Memorie[], lipsaMigrare: false }
}

export async function adaugaMemorie(sb: SupabaseClient, firmaId: string, m: { data?: string; categorie?: string; text: string; sursa: SursaMemorie }): Promise<Memorie | null> {
  const text = String(m.text || '').trim().slice(0, 2000)
  if (!text) return null
  const { data, error } = await sb.from('proiect_memorie').insert({ firma_id: firmaId, data: dataValida(m.data), categorie: categorieValida(m.categorie), text, sursa: m.sursa }).select('id,data,categorie,text,sursa,created_at').single()
  if (error) { if (!lipsaTabel(error)) console.error('proiect_memorie insert', error.message); return null }
  return data as Memorie
}

const dataRo = (iso: string) => iso.split('-').reverse().join('.')
export function memorieText(memorie: Memorie[]): string {
  if (!memorie.length) return '(memoria e goală deocamdată)'
  return memorie.map(m => `- ${dataRo(m.data)} · ${m.categorie}: ${m.text}${m.sursa === 'plan' ? ' (stare marcată în plan)' : ''}`).join('\n')
}

// Faptele noi spuse in chat: AI-ul le pune la finalul raspunsului ca [[MEMORIE: AAAA-LL-ZZ | categorie | text]];
// le scoatem din textul afisat/salvat si le retinem.
const MARCAJ = /\[\[MEMORIE:\s*([^\]|]*)\|([^\]|]*)\|([^\]]*)\]\]/g
export function extrageMemorieDinRaspuns(raspuns: string): { curat: string; fapte: { data: string; categorie: string; text: string }[] } {
  const fapte: { data: string; categorie: string; text: string }[] = []
  for (const m of raspuns.matchAll(MARCAJ)) fapte.push({ data: m[1].trim(), categorie: m[2].trim(), text: m[3].trim() })
  return { curat: raspuns.replace(MARCAJ, '').replace(/\n*\[\[MEMORIE[^\]]*$/, '').trimEnd(), fapte }
}
