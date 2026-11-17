import { notFound } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import { dbSelect } from '@/lib/db'
import { getFirmaConfig, esteLunaCalendaristica } from '@/lib/firma-config'
import ContracteColaboratori from './ContracteColaboratori'

export const dynamic = 'force-dynamic'

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function ContracteColaboratoriPage({ params }: { params: Promise<{ firma: string }> }) {
  const { firma: slug } = await params

  // Doar firmele reale (AB Textile, ABXHomes, AB Homes Invest) - nu proiectul (luna calendaristica).
  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig || esteLunaCalendaristica(slug)) notFound()

  const firmeRaw = await dbSelect('firme', { eq: { slug } })
  const firma = firmeRaw[0]
  if (!firma) notFound()

  const luna = getCurrentLuna()

  return (
    <main className="page page-narrow animate-in">
      <PageHeader
        back={{ href: `/${slug}/${luna}`, label: firma.nume.replace(' SRL', '') }}
        culoare={firma.culoare}
        title="Contracte colaboratori"
        description={`Încarci contractele de la colaboratori; rămân salvate cu numele colaboratorului și data · ${firma.nume}`}
      />

      <ContracteColaboratori firmaId={firma.id} />
    </main>
  )
}
