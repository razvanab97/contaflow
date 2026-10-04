import type { SupabaseClient } from '@supabase/supabase-js'
import { getFirmaConfig, MODULE_DEFS } from '@/lib/firma-config'
import type { ContextFirma } from '@/lib/mail-contabil'

export async function contextFirma(sb: SupabaseClient, firmaId: string, lunaId: string | null): Promise<ContextFirma & { slug: string }> {
  const [{ data: firma }, { data: luna }] = await Promise.all([
    sb.from('firme').select('nume,slug').eq('id', firmaId).single(),
    lunaId ? sb.from('luni_contabile').select('luna').eq('id', lunaId).single() : Promise.resolve({ data: null }),
  ])
  const cfg = getFirmaConfig(firma?.slug || '')
  return {
    slug: firma?.slug || '',
    firmaNume: firma?.nume || '',
    module: (cfg?.module || []).filter(m => m !== 'mail-contabil').map(m => MODULE_DEFS[m]?.label || m),
    lunaKey: luna?.luna ? String(luna.luna).slice(0, 7) : null,
  }
}
