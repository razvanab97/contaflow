'use client'
import { deschideDocument, linkDocument } from '@/lib/vizualizare'

// Buton "Vezi" pentru orice document: deschide vizualizatorul pop-up. Linkul semnat se
// pregateste deja la hover/focus, ca deschiderea sa fie practic instanta.
export default function VeziButon({ url, nume, className, style }: { url: string; nume?: string | null; className?: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); deschideDocument(url, nume) }}
      onMouseEnter={() => { linkDocument(url) }}
      onFocus={() => { linkDocument(url) }}
      className={className}
      style={className ? style : { fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', padding: '2px 4px', borderRadius: 'var(--r-xs)', cursor: 'pointer', flexShrink: 0, ...style }}
      title="Vezi documentul"
    >
      Vezi
    </button>
  )
}
