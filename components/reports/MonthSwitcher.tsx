'use client'
import { useRouter } from 'next/navigation'

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
export default function MonthSwitcher({ slug, luna, lunaLabel, modulSlug, onBeforeNavigate }: Props) {
  const router = useRouter()

  function go(target: string) {
    onBeforeNavigate?.()
    router.push(`/${slug}/${target}/${modulSlug}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button onClick={() => go(prevLuna(luna))} aria-label="Luna anterioară" style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '7px', cursor: 'pointer', color: 'var(--c-999999)' }}>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-cccccc)', minWidth: '110px', textAlign: 'center' }}>{lunaLabel}</span>
      <button onClick={() => go(nextLuna(luna))} aria-label="Luna următoare" style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '7px', cursor: 'pointer', color: 'var(--c-999999)' }}>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
  )
}
