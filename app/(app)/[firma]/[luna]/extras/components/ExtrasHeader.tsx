'use client'
import type { Extras } from './types'
import PageHeader from '@/components/ui/PageHeader'
import MonthNav from '@/components/ui/MonthNav'
import Icon from '@/components/ui/Icon'

export default function ExtrasHeader({
  firmaNume, lunaLabel, culoare, slug, luna,
  pageTab, onPageTabChange,
  extrase, activeExtrasId, onSelectExtras, onOpenImport,
}: {
  firmaNume: string; lunaLabel: string; culoare: string; slug: string; luna: string
  pageTab: 'extras'|'facturi'|'note'; onPageTabChange: (t: 'extras'|'facturi'|'note') => void
  extrase: Extras[]; activeExtrasId: string; onSelectExtras: (id: string) => void
  onOpenImport: () => void
}) {
  return (
    <div style={{ marginBottom:'16px' }}>
      <PageHeader
        back={{ href: `/${slug}/${luna}`, label: 'Rezumatul lunii' }}
        culoare={culoare}
        title="Extras de cont"
        description={`${firmaNume} · ${lunaLabel}`}
        actions={<MonthNav slug={slug} luna={luna} suffix="/extras" />}
      />

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px', marginTop:'-8px' }}>
        <div role="tablist" aria-label="Secțiuni extras" style={{ display:'flex', padding:'2px', borderRadius:'var(--r-md)', gap:'2px', background:'var(--surface-secondary)', border:'1px solid var(--border-subtle)', maxWidth:'100%', overflowX:'auto' }}>
          {([['extras','Extras de cont'],['facturi','Facturi + chitanță'],['note','Note']] as const).map(([t,l]) => (
            <button key={t} role="tab" aria-selected={pageTab===t} onClick={() => onPageTabChange(t)} style={{ height:'30px', padding:'0 14px', borderRadius:'var(--r-sm)', border:'none', fontSize:'var(--fs-md)', fontWeight: pageTab===t ? 600 : 500, whiteSpace:'nowrap', background:pageTab===t?'var(--surface)':'transparent', color:pageTab===t?'var(--text-primary)':'var(--text-secondary)', boxShadow: pageTab===t ? 'var(--shadow-sm)' : undefined }}>{l}</button>
          ))}
        </div>

        {pageTab === 'extras' && (
          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
            {extrase.map(e => {
              const active = activeExtrasId===e.id
              return (
                <button key={e.id} onClick={() => onSelectExtras(e.id)} aria-pressed={active} className="btn btn-sm" style={{ fontWeight:600, borderColor: active ? 'var(--accent)' : undefined, background: active ? 'var(--accent-soft)' : undefined, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {e.valuta}{e.iban ? ` ····${e.iban.slice(-6)}` : ''}
                </button>
              )
            })}
            <button onClick={onOpenImport} className="btn btn-sm btn-primary">
              <Icon name="download" size={14} style={{ transform:'rotate(180deg)' }} /> Importă extras
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
