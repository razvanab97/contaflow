'use client'
import Link from 'next/link'

const S = {
  aside: { width: '220px', flexShrink: 0, background: '#0D0D0D', borderRight: '1px solid #1E1E1E', display: 'flex', flexDirection: 'column' as const, padding: '20px 0', position: 'sticky' as const, top: 0, height: '100vh', overflowY: 'auto' as const },
  logo: { padding: '4px 18px 24px', display: 'flex', alignItems: 'center', gap: '10px' },
  logoBox: { width: '28px', height: '28px', background: '#FFF', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoText: { fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.3px' },
  sectionLabel: { padding: '0 18px 8px', fontSize: '10px', fontWeight: 700, color: '#444', letterSpacing: '.12em', textTransform: 'uppercase' as const },
  divider: { height: '1px', background: '#1E1E1E', margin: '10px 14px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 18px', fontSize: '13px', fontWeight: 500, color: '#888' },
  bottom: { marginTop: 'auto', padding: '12px 18px', fontSize: '11px', color: '#555' }
}

interface Props {
  firme: { id: string; slug: string; nume: string; culoare: string }[]
  lunaCurenta: string
  lunaLabel: string
  firmaSlug?: string
  luna?: string
  backLabel?: string
  backHref?: string
  extraItems?: { icon: string; label: string; href: string }[]
  sidebarExtra?: React.ReactNode
}

export default function Sidebar({ firme, lunaCurenta, lunaLabel, firmaSlug, luna, backLabel, backHref, extraItems, sidebarExtra }: Props) {
  return (
    <aside style={S.aside}>
      <div style={S.logo}>
        <div style={S.logoBox}>
          <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span style={S.logoText}>ContaFlow</span>
      </div>

      {backHref && (
        <>
          <Link href={backHref} style={{ ...S.navItem, color: '#777' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            {backLabel}
          </Link>
          <div style={S.divider} />
        </>
      )}

      {!backHref && (
        <>
          <div style={S.sectionLabel}>Firme</div>
          {firme.map(f => (
            <Link key={f.id} href={`/${f.slug}/${lunaCurenta}`} style={{ ...S.navItem, color: '#999' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: f.culoare, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{f.nume.replace(' SRL', '')}</span>
            </Link>
          ))}
          <div style={S.divider} />
        </>
      )}

      {firmaSlug && luna && !backHref && (
        <>
          <div style={S.sectionLabel}>Navigare</div>
          {[
            { label: 'Checklist', href: `/${firmaSlug}/${luna}` },
            { label: 'Extras de cont', href: `/${firmaSlug}/${luna}/extras` },
          ].map(item => (
            <Link key={item.label} href={item.href} style={{ ...S.navItem, color: '#777' }}>
              {item.label}
            </Link>
          ))}
        </>
      )}

      {extraItems?.map(item => (
        <Link key={item.label} href={item.href} style={{ ...S.navItem, color: '#777' }}>
          {item.label}
        </Link>
      ))}

      {sidebarExtra}

      <div style={S.bottom}>{lunaLabel}</div>
    </aside>
  )
}
