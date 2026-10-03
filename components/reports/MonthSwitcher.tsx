'use client'
import Link from 'next/link'

function prevLuna(luna: string) { const d = new Date(luna + '-01'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }
function nextLuna(luna: string) { const d = new Date(luna + '-01'); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7) }

interface Props {
  slug: string
  luna: string
  lunaLabel: string
  modulSlug: string
  onBeforeNavigate?: () => void
}

// Documentul propriu-zis (raport_lunar) e un singur fisier, independent de luna - schimbarea
// lunii aici schimba doar contextul task-ului lunar ("Raport lunar actualizat" bifat/nebifat
// pentru luna respectiva), nu incarca o versiune diferita a documentului. Vezi limitarile din
// sumarul final.
// <Link prefetch> in loc de router.push() - Next.js precarca luna adiacenta cand link-ul intra
// in viewport, deci click-ul chiar navigheaza instant, nu doar vizual.
export default function MonthSwitcher({ slug, luna, lunaLabel, modulSlug, onBeforeNavigate }: Props) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
      <Link
        href={`/${slug}/${prevLuna(luna)}/${modulSlug}`}
        prefetch
        onClick={() => onBeforeNavigate?.()}
        aria-label="Luna anterioară"
        className="btn btn-ghost btn-icon btn-sm"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
      </Link>
      <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', minWidth: '110px', textAlign: 'center', padding: '0 6px' }}>{lunaLabel}</span>
      <Link
        href={`/${slug}/${nextLuna(luna)}/${modulSlug}`}
        prefetch
        onClick={() => onBeforeNavigate?.()}
        aria-label="Luna următoare"
        className="btn btn-ghost btn-icon btn-sm"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
      </Link>
    </div>
  )
}
