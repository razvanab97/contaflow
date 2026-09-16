import { notFound } from 'next/navigation'
import Link from 'next/link'
import { dbSelect } from '@/lib/db'
import { getFirmaConfig } from '@/lib/firma-config'
import BonuriClient from './BonuriClient'

export const dynamic = 'force-dynamic'

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function BonuriPage({ params }: { params: Promise<{ firma: string }> }) {
  const { firma: slug } = await params

  const firmaConfig = getFirmaConfig(slug)
  if (!firmaConfig) notFound()

  const firmeRaw = await dbSelect('firme', { eq: { slug } })
  const firma = firmeRaw[0]
  if (!firma) notFound()

  const toateFirmele = await dbSelect('firme', { eq: { activa: true }, order: 'nume' })

  const luna = getCurrentLuna()

  return (
    <main style={{ flex: 1, padding: '44px 52px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Link href={`/${slug}/${luna}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-888888)', marginBottom: '16px' }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          {firma.nume.replace(' SRL', '')}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: firma.culoare, flexShrink: 0 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--c-ffffff)', letterSpacing: '-0.5px' }}>Bonuri</h1>
        </div>
        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--c-888888)', marginTop: '6px', marginLeft: '22px' }}>
          Atașează bonurile fiscale — de combustibil sau altele — și le sugerăm automat pe tranzacția potrivită din extras · {firma.nume}
        </p>
      </div>

      <BonuriClient firmaId={firma.id} firmaCui={firma.cui} firmaNume={firma.nume} firme={toateFirmele.map((f: any) => ({ id: f.id, nume: f.nume }))} />
    </main>
  )
}
