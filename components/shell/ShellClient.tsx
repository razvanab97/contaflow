'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar, { FirmaNav } from '@/components/Sidebar'
import GlobalHeader from './GlobalHeader'
import CommandPalette from './CommandPalette'
import { getFirmaModules } from '@/lib/firma-config'
import { accountingShortLabel } from '@/lib/accounting-period'

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
  const [moduleComplete, setModuleComplete] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => { setMenuOpen(false); setPaletteOpen(true) }, [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // ⌘K / Ctrl+K oriunde, sau "/" cand nu se scrie intr-un camp -> paleta de comenzi/cautare.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPaletteOpen(o => !o) }
      else if (e.key === '/' && !typing) { e.preventDefault(); setPaletteOpen(true) }
    }
    const onOpen = () => setPaletteOpen(true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('cf:palette', onOpen)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('cf:palette', onOpen) }
  }, [])

  const firmaAtivaObj = firmeNav.find(f => f.slug === firmaSlug)
  const firmaId = firmaAtivaObj?.id

  useEffect(() => {
    if (!firmaId && lunaEfectiva === initialLuna) return
    let cancelled = false
    const qs = new URLSearchParams({ luna: lunaEfectiva })
    if (firmaId) qs.set('firmaId', firmaId)
    if (firmaSlug) qs.set('firmaSlug', firmaSlug)
    fetch(`/api/shell-nav?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return
        if (data.firmeNav) setFirmeNav(data.firmeNav)
        setRestanteCount(data.restanteCount || 0)
        setModuleComplete(data.moduleComplete || {})
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [lunaEfectiva, firmaId, firmaSlug, initialLuna])

  // Blocheaza scroll-ul paginii cat timp sertarul de navigatie e deschis pe mobil.
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [menuOpen])

  const modules = firmaSlug ? getFirmaModules(firmaSlug) : undefined

  return (
    <div className="app-shell">
      {/* Directia "brand per firma": culoarea firmei active devine --brand pentru toata interfata.
          Randat ca <style> (si pe server), ca sa nu clipeasca accentul implicit la incarcare. */}
      {firmaAtivaObj && <style>{`:root{--brand:${/^#[0-9a-fA-F]{6}$/.test(firmaAtivaObj.culoare) ? firmaAtivaObj.culoare : '#6366F1'}}`}</style>}
      <Sidebar
        firme={firmeNav}
        lunaCurenta={lunaEfectiva}
        lunaLabel={accountingShortLabel(lunaEfectiva)}
        firmaAtiva={firmaSlug}
        moduleFirma={modules}
        restanteCount={restanteCount}
        moduleComplete={moduleComplete}
        open={menuOpen}
        onClose={closeMenu}
        onSearch={openPalette}
      />
      <div className="app-main">
        <GlobalHeader firme={firmeNav} firmaAtiva={firmaAtivaObj} luna={lunaEfectiva} lunaInPath={!!lunaFromPath} onMenu={() => setMenuOpen(true)} onSearch={openPalette} />
        {/* Montata doar cat e deschisa -> fiecare deschidere porneste cu stare curata (text gol, scope implicit). */}
        {paletteOpen && <CommandPalette open onClose={closePalette} firme={firmeNav} firmaAtiva={firmaAtivaObj} luna={lunaEfectiva} lunaInPath={!!lunaFromPath} />}
        <div id="continut" tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, outline: 'none' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
