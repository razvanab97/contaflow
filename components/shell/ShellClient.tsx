'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar, { FirmaNav } from '@/components/Sidebar'
import GlobalHeader from './GlobalHeader'
import { getFirmaModules } from '@/lib/firma-config'

const LUNI_FULL = ['', 'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
function lunaLabel(s: string) { const [y, m] = s.split('-'); return `${LUNI_FULL[+m]} ${y}` }

interface Props {
  initialFirmeNav: FirmaNav[]
  initialLuna: string
  children: React.ReactNode
}

// Shell persistent pentru toata aplicatia: Sidebar+Header sunt randate o singura data aici
// (app/(app)/layout.tsx e ancestorul comun al TUTUROR paginilor), deci nu se remonteaza la
// navigare - doar continutul din dreapta se schimba. Firma/luna active se deduc din URL
// (usePathname), nu din params server-side, pentru ca acest layout sta DEASUPRA segmentelor
// dinamice [firma]/[luna] in arborele de foldere si Next.js nu-i propaga acei params
// (verificat empiric: un layout la aceasta pozitie primeste params={} chiar si pentru
// /proiect-ab-textile/2026-09/raport-lunar-proiect).
export default function ShellClient({ initialFirmeNav, initialLuna, children }: Props) {
  const pathname = usePathname()
  const parts = pathname.split('/').filter(Boolean)
  const firmaSlug = parts[0] && parts[0] !== 'dashboard' ? parts[0] : undefined
  const lunaFromPath = firmaSlug && /^\d{4}-\d{2}$/.test(parts[1] || '') ? parts[1] : undefined
  const lunaEfectiva = lunaFromPath || initialLuna

  const [firmeNav, setFirmeNav] = useState(initialFirmeNav)
  const [restanteCount, setRestanteCount] = useState(0)

  const firmaAtivaObj = firmeNav.find(f => f.slug === firmaSlug)
  const firmaId = firmaAtivaObj?.id

  useEffect(() => {
    if (!firmaId && lunaEfectiva === initialLuna) return
    let cancelled = false
    const qs = new URLSearchParams({ luna: lunaEfectiva })
    if (firmaId) qs.set('firmaId', firmaId)
    fetch(`/api/shell-nav?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return
        if (data.firmeNav) setFirmeNav(data.firmeNav)
        setRestanteCount(data.restanteCount || 0)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [lunaEfectiva, firmaId, initialLuna])

  const modules = firmaSlug ? getFirmaModules(firmaSlug) : undefined

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--app-bg-image, none), var(--c-0a0a0a)', backgroundAttachment: 'fixed' }}>
      <Sidebar
        firme={firmeNav}
        lunaCurenta={lunaEfectiva}
        lunaLabel={lunaLabel(lunaEfectiva)}
        firmaAtiva={firmaSlug}
        moduleFirma={modules}
        restanteCount={restanteCount}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {firmaAtivaObj && (
          <GlobalHeader firme={firmeNav} firmaAtiva={firmaAtivaObj} luna={lunaEfectiva} lunaInPath={!!lunaFromPath} />
        )}
        {children}
      </div>
    </div>
  )
}
