import { notFound } from 'next/navigation'
import InitLuna from './InitLuna'
import ChecklistClient from './ChecklistClient'

const URL = 'https://aqlmuoaaipbanjdptleg.supabase.co/rest/v1'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
async function q(path: string) { const r = await fetch(`${URL}/${path}`, { headers: H, cache: 'no-store' }); return r.ok ? r.json() : [] }

export default async function LunaPage({ params }: { params: Promise<{firma:string;luna:string}> }) {
  const { firma: slug, luna } = await params
  const firme = await q(`firme?slug=eq.${encodeURIComponent(slug)}&select=*`)
  const firma = firme[0]
  if (!firma) notFound()
  const luni = await q(`luni_contabile?firma_id=eq.${firma.id}&select=*`)
  const lunaData = luni.find((l: {luna:string}) => l.luna.startsWith(luna))
  if (!lunaData) return <InitLuna firma={firma} luna={luna} />
  const items = await q(`checklist_items?luna_id=eq.${lunaData.id}&select=*,checklist_templates(*)`)
  const extrase = await q(`extrase?luna_id=eq.${lunaData.id}&select=*`)
  const toateFirmele = await q('firme?select=*')
  const toateLunile = await q(`luni_contabile?select=id,firma_id,luna`)
  const firmeDisponibile = toateFirmele.map((f: {id:string}) => ({
    ...f,
    luna_id: toateLunile.find((l: {firma_id:string;luna:string}) => l.firma_id === f.id && l.luna.startsWith(luna))?.id || null,
  })).filter((f: {luna_id:string|null}) => f.luna_id)
  const [y,m] = luna.split('-')
  const LUNI = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
  return <ChecklistClient firma={firma} firmeDisponibile={firmeDisponibile} lunaId={lunaData.id} lunaStatus={lunaData.status} progresPct={lunaData.progres_pct} items={items} extrase={extrase} slug={slug} luna={luna} lunaLabel={`${LUNI[+m]} ${y}`}/>
}
