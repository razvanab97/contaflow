import { cache } from 'react'
import { dbSelect, getRestanteCount as getRestanteCountRaw } from './db'
import { getFirmaTotalTasks, getFirmaModules } from './firma-config'

// Deduplicate identical queries fired from both a layout and its page during the same
// request (React.cache memoizes per render pass, not across requests) - see
// https://nextjs.org/docs/app/building-your-application/data-fetching/patterns

export const getFirmaBySlug = cache(async (slug: string) => {
  const rows = await dbSelect('firme', { eq: { slug } })
  return rows[0] || null
})

export const getActiveFirme = cache(async () => {
  return dbSelect('firme', { eq: { activa: true }, order: 'created_at' })
})

export const getLuniContabile = cache(async () => {
  return dbSelect('luni_contabile', { select: '*' })
})

// lunaIds explicite (nu tot tabelul) - istoricul task_stari creste nemarginit cu firme/luni,
// dar la orice navigare ne intereseaza doar luna curent afisata pentru fiecare firma.
export const getAllTaskStari = cache(async (lunaIds: string[]) => {
  if (!lunaIds.length) return []
  return dbSelect('task_stari', { select: 'luna_id,completat', in: { luna_id: lunaIds } })
})

export const getRestanteCount = cache(getRestanteCountRaw)

export interface FirmaNavItem { id: string; slug: string; nume: string; culoare: string; pct: number }

export const getFirmeNavData = cache(async (luna: string) => {
  const [toateFirmele, luni] = await Promise.all([
    getActiveFirme(),
    getLuniContabile(),
  ])

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0, 7)}`] = l

  const lunaIds = toateFirmele
    .map((f: any) => luniMap[`${f.id}_${luna}`]?.id)
    .filter(Boolean) as string[]
  const allTaskStari = await getAllTaskStari(lunaIds)

  const taskCount: Record<string, { done: number }> = {}
  for (const ts of allTaskStari) {
    if (!taskCount[ts.luna_id]) taskCount[ts.luna_id] = { done: 0 }
    if (ts.completat) taskCount[ts.luna_id].done++
  }

  const firmeNav: FirmaNavItem[] = toateFirmele.map((f: any) => {
    const ld = luniMap[`${f.id}_${luna}`]
    const total = getFirmaTotalTasks(f.slug)
    const done = ld ? (taskCount[ld.id]?.done || 0) : 0
    return { id: f.id, slug: f.slug, nume: f.nume, culoare: f.culoare, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  })

  return { toateFirmele, luni, luniMap, taskCount, firmeNav }
})

// Pentru sidebar: pe ce module (dintr-o firma) sunt bifate TOATE task-urile, ca sa taiem
// vizual acel modul din lista, la fel cum se intampla deja per-task in ModuleGrid.
export async function getModuleCompletion(firmaSlug: string, lunaId: string): Promise<Record<string, boolean>> {
  const modules = getFirmaModules(firmaSlug)
  if (!modules.length) return {}
  const taskStari = await dbSelect('task_stari', { select: 'task_key,completat', eq: { luna_id: lunaId } })
  const taskMap: Record<string, boolean> = {}
  for (const ts of taskStari) taskMap[ts.task_key] = ts.completat
  const result: Record<string, boolean> = {}
  for (const mod of modules) {
    const done = mod.tasks.filter(t => taskMap[t.key]).length
    result[mod.slug] = done === mod.tasks.length
  }
  return result
}
