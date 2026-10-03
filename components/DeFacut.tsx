import Link from 'next/link'
import Icon from './ui/Icon'
import type { ItemDeFacut } from '@/lib/de-facut'

const TON = {
  depasit: { bg: 'var(--danger-soft)', c: 'var(--danger)' },
  curand: { bg: 'var(--warning-soft)', c: 'var(--warning)' },
  normal: { bg: 'var(--surface-secondary)', c: 'var(--text-secondary)' },
}

function termen(z: number | null | undefined) {
  if (z == null) return null
  if (z < 0) return { text: `depășit cu ${-z} ${-z === 1 ? 'zi' : 'zile'}`, cls: 'badge badge-danger' }
  if (z === 0) return { text: 'termen azi', cls: 'badge badge-danger' }
  return { text: `în ${z} ${z === 1 ? 'zi' : 'zile'}`, cls: z <= 5 ? 'badge badge-warning' : 'badge' }
}

function Rand({ it }: { it: ItemDeFacut }) {
  const t = termen(it.zile)
  return (
    <Link href={it.href} className="module-item" style={{ textDecoration: 'none' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: 'var(--r-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: TON[it.urgenta].bg, color: TON[it.urgenta].c }}>
        <Icon name={it.icon} size={16} />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)' }}>{it.titlu}</span>
          {t && <span className={t.cls}>{t.text}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '2px', minWidth: 0 }}>
          <span className="dot" style={{ background: it.culoare, width: 6, height: 6 }} />
          <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{it.firmaNume}</span>
          {it.detaliu && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {it.detaliu}</span>}
        </div>
      </div>
      <Icon name="chevronRight" size={16} style={{ color: 'var(--text-muted)' }} />
    </Link>
  )
}

// "De facut" - tot ce asteapta o actiune, in toate firmele, ordonat dupa urgenta (termene depasite,
// apoi apropiate, apoi restul). Primele 6 vizibile, restul la un click.
export default function DeFacut({ items }: { items: ItemDeFacut[] }) {
  if (!items.length) {
    return (
      <div className="empty-state" style={{ marginBottom: '28px' }}>
        <strong>Nimic urgent</strong>
        <span>Toate firmele sunt la zi pentru luna aceasta.</span>
      </div>
    )
  }
  const primele = items.slice(0, 6)
  const rest = items.slice(6)
  return (
    <div style={{ marginBottom: '28px' }}>
      <div className="module-list stagger">
        {primele.map(it => <Rand key={it.id} it={it} />)}
      </div>
      {rest.length > 0 && (
        <details style={{ marginTop: '8px' }}>
          <summary className="btn btn-sm btn-ghost" style={{ listStyle: 'none', display: 'inline-flex' }}>Arată toate ({items.length})</summary>
          <div className="module-list" style={{ marginTop: '8px' }}>
            {rest.map(it => <Rand key={it.id} it={it} />)}
          </div>
        </details>
      )}
    </div>
  )
}
