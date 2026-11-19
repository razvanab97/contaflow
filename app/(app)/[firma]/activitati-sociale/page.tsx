import { notFound } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import { dbSelect } from '@/lib/db'
import { getFirmaConfig, esteLunaCalendaristica } from '@/lib/firma-config'
import ActivitatiSociale from './ActivitatiSociale'

export const dynamic = 'force-dynamic'

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Modulul „Activități sociale" al proiectului AB Textile - doar la proiect (lună calendaristică).
export default async function ActivitatiSocialePage({ params }: { params: Promise<{ firma: string }> }) {
  const { firma: slug } = await params
  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig || !esteLunaCalendaristica(slug)) notFound()

  const firmeRaw = await dbSelect('firme', { eq: { slug } })
  const firma = firmeRaw[0]
  if (!firma) notFound()

  return (
    <main className="page page-narrow animate-in">
      <PageHeader
        back={{ href: `/${slug}/${getCurrentLuna()}`, label: firma.nume.replace(' SRL', '') }}
        culoare={firma.culoare}
        title="Activități sociale"
        description="Zonele misiunii sociale (din planul de afaceri), activitățile din fiecare an, indicatorii și documentele. Indicatorul se mișcă doar din activitățile validate."
      />
      <ActivitatiSociale firmaId={firma.id} />
    </main>
  )
}
