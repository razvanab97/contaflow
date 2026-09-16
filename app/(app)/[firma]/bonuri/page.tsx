import { redirect, notFound } from 'next/navigation'
import { getFirmaConfig } from '@/lib/firma-config'

export const dynamic = 'force-dynamic'

function getCurrentLuna() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Bonurile au acum propria lor luna, ca orice alt modul (app/(app)/[firma]/[luna]/bonuri) - nu
// mai sunt independente de restul contabilitatii. Ruta veche (fara luna) ramane doar ca redirect,
// ca link-urile/bookmark-urile vechi sa nu se strice.
export default async function BonuriRedirect({ params }: { params: Promise<{ firma: string }> }) {
  const { firma: slug } = await params
  if (!getFirmaConfig(slug)) notFound()
  redirect(`/${slug}/${getCurrentLuna()}/bonuri`)
}
