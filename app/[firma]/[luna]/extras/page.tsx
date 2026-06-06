import { notFound } from 'next/navigation'
import ExtrasClient from './ExtrasClient'

const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

async function get(path: string) {
  const r = await fetch(`${SB}/${path}`, { headers: H, cache: 'no-store' })
  return r.ok ? r.json() : []
}

export default async function ExtrasPage({ params }: { params: Promise<{ firma: string; luna: string }> }) {
  const { firma: slug, luna } = await params

  const firme = await get(`firme?slug=eq.${encodeURIComponent(slug)}&select=id,slug,nume,culoare`)
  const firma = firme[0]
  if (!firma) notFound()

  const luni = await get(`luni_contabile?firma_id=eq.${firma.id}&select=id,luna&order=luna.desc`)
  const lunaData = luni.find((l: { luna: string }) => l.luna.startsWith(luna))
  if (!lunaData) notFound()

  const extrase = await get(`extrase?luna_id=eq.${lunaData.id}&select=id,valuta,nr_tranzactii,nr_documentate,procesat_ai,sold_final&order=valuta`)

  const [y, m] = luna.split('-')
  const LUNI = ['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
  const ll = `${LUNI[+m]} ${y}`

  return (
    <ExtrasClient
      firma={firma}
      lunaId={lunaData.id}
      luna={luna}
      lunaLabel={ll}
      extrase={extrase}
      slug={slug}
    />
  )
}
