import { notFound } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import { dbSelect } from '@/lib/db'
import { getFirmaConfig, esteLunaCalendaristica } from '@/lib/firma-config'
import { getDosarConfig } from '@/lib/proiect-dosar'
import ProiectDosar from './ProiectDosar'

export const dynamic = 'force-dynamic'

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Dosarul proiectului (Angajati / Activitate / Social) - doar la proiect (luna calendaristica), nu la firmele reale.
export default async function DosarSectiunePage({ params }: { params: Promise<{ firma: string; sectiune: string }> }) {
  const { firma: slug, sectiune } = await params

  const cfg = getDosarConfig(sectiune)
  const firmaConfig = getFirmaConfig(slug)
  if (!cfg || !firmaConfig || !esteLunaCalendaristica(slug)) notFound()

  const firmeRaw = await dbSelect('firme', { eq: { slug } })
  const firma = firmeRaw[0]
  if (!firma) notFound()

  const luna = getCurrentLuna()

  return (
    <main className="page page-narrow animate-in">
      <PageHeader
        back={{ href: `/${slug}/${luna}`, label: firma.nume.replace(' SRL', '') }}
        culoare={firma.culoare}
        title={`Dosar · ${cfg.label}`}
        description={cfg.descriere}
      />
      <ProiectDosar firmaId={firma.id} cfg={cfg} />
    </main>
  )
}
