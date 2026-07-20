import { getServiceSupabase } from './supabase/server'

type FilterOp = Record<string, string | boolean | number>

export async function dbSelect(
  table: string,
  opts?: { select?: string; eq?: FilterOp; like?: Record<string,string>; order?: string; orderAsc?: boolean }
): Promise<any[]> {
  const sb = getServiceSupabase()
  let q = sb.from(table).select(opts?.select || '*')
  if (opts?.eq) for (const [col, val] of Object.entries(opts.eq)) q = q.eq(col, val)
  if (opts?.like) for (const [col, pat] of Object.entries(opts.like)) q = q.like(col, pat)
  if (opts?.order) q = q.order(opts.order, { ascending: opts.orderAsc ?? true })
  const { data, error } = await q
  if (error) console.error(`dbSelect(${table}):`, error.message)
  return (data as any[]) || []
}
