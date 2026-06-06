import { getServerSupabase } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import InitLuna from './InitLuna'
import ChecklistClient from './ChecklistClient'

export default async function LunaPage({ params }: { params: Promise<{firma:string;luna:string}> }) {
  const { firma: slug, luna } = await params
  const sb = await getServerSupabase()

  const { data: firma } = await sb.from('firme').select('*').eq('slug', slug).single()
  if (!firma) notFound()

  const { data: lunaData } = await sb.from('luni_contabile').select('*')
    .eq('firma_id', firma.id).gte('luna', luna+'-01').lte('luna', luna+'-28').single()

  if (!lunaData) return <InitLuna firma={firma} luna={luna} />

  const { data: items } = await sb.from('checklist_items')
    .select('*, checklist_templates(*)')
    .eq('luna_id', lunaData.id)

  const { data: extrase } = await sb.from('extrase').select('*').eq('luna_id', lunaData.id)

  const [y,m] = luna.split('-')
  const luni = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

  return (
    <ChecklistClient
      firma={firma}
      lunaId={lunaData.id}
      lunaStatus={lunaData.status}
      progresPct={lunaData.progres_pct}
      items={items||[]}
      extrase={extrase||[]}
      slug={slug}
      luna={luna}
      lunaLabel={`${luni[+m]} ${y}`}
    />
  )
}
