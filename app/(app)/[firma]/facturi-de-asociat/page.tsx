import { notFound } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import { dbSelect } from '@/lib/db'
import { getFirmaConfig } from '@/lib/firma-config'
import FacturiAsteptateClient from './FacturiAsteptateClient'

export const dynamic = 'force-dynamic'

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function FacturiAsteptatePage({ params }: { params: Promise<{ firma: string }> }) {
  const { firma: slug } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig) notFound()

  const firmeRaw = await dbSelect('firme', { eq: { slug } })
  const firma = firmeRaw[0]
  if (!firma) notFound()

  const luna = getCurrentLuna()

  return (
    <main className="page page-narrow animate-in">
      <PageHeader
        back={{ href: `/${slug}/${luna}`, label: firma.nume.replace(' SRL', '') }}
        culoare={firma.culoare}
        title="Facturi de asociat"
        description={`Adaugă acum facturile plătite — luna viitoare, când încarci extrasul, ți le sugerăm pe cele care se potrivesc · ${firma.nume}`}
      />

      <FacturiAsteptateClient firmaId={firma.id} />
    </main>
  )
}
