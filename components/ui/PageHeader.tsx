import Link from 'next/link'
import Icon from './Icon'

// Antet standard de pagina: (link inapoi) + titlu cu punctul de culoare al firmei + descriere +
// actiuni in dreapta. Toate paginile de firma/modul il folosesc, ca ierarhia sa fie identica peste tot.
export default function PageHeader({ title, description, culoare, back, actions, children }: {
  title: React.ReactNode
  description?: React.ReactNode
  culoare?: string
  back?: { href: string; label: string }
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        {back && (
          <Link href={back.href} className="crumb-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', margin: '0 0 8px -6px' }}>
            <Icon name="arrowLeft" size={14} />
            {back.label}
          </Link>
        )}
        <h1 className="page-title">
          {culoare && <span className="dot" style={{ background: culoare, width: '10px', height: '10px' }} />}
          {title}
        </h1>
        {description && <p className="page-subtitle">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}
