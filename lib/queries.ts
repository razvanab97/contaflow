import { cache } from 'react'
import { dbSelect, getRestanteCount as getRestanteCountRaw } from './db'
import { getFirmaTotalTasks } from './firma-config'

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

export const getAllTaskStari = cache(async () => {
  return dbSelect('task_stari', { select: 'luna_id,completat' })
})

export const getRestanteCount = cache(getRestanteCountRaw)

export interface FirmaNavItem { id: string; slug: string; nume: string; culoare: string; pct: number }

export const getFirmeNavData = cache(async (luna: string) => {
  const [toateFirmele, luni, allTaskStari] = await Promise.all([
    getActiveFirme(),
    getLuniContabile(),
    getAllTaskStari(),
  ])

  const luniMap: Record<string, any> = {}
  for (const l of luni) luniMap[`${l.firma_id}_${l.luna?.slice(0, 7)}`] = l

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
