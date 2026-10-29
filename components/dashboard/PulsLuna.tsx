import Link from 'next/link'
import css from './Dashboard.module.css'

// Bara lunii din antetul Dashboardului: progresul total, bara impartita pe firme (latimea = task-urile firmei)
// si semnalele care cer atentie. Firmele si semnalele duc la randul firmei din tabel (#firma-<slug>) sau la pagina lor.
export interface FirmaPuls { slug: string; nume: string; culoare: string; done: number; total: number }
export interface Semnal { n: number; text: string; href: string; ton: 'bad' | 'warn' | 'info' | 'ok' }

export default function PulsLuna({ firme, semnale }: { firme: FirmaPuls[]; semnale: Semnal[] }) {
  const done = firme.reduce((s, f) => s + f.done, 0), total = firme.reduce((s, f) => s + f.total, 0)
  const pct = total ? Math.round(done / total * 100) : 0
  const C = 2 * Math.PI * 42
  const scurt = (n: string) => n.replace(/ SRL$/, '')
  return (
    <section className={css.pulse} aria-label="Situația lunii">
      <div className={css.ring} aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-sunken)" strokeWidth="10" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ filter: 'drop-shadow(0 0 6px var(--brand-glow))' }} />
        </svg>
        <div className={css.ringVal}><div><strong>{pct}%</strong><span>{done}/{total}</span></div></div>
      </div>
      <div className={css.pulseMain}>
        <div className={css.seg}>
          {firme.map(f => (
            <a key={f.slug} href={`#firma-${f.slug}`} style={{ flex: Math.max(f.total, 1) }} aria-label={`${f.nume}: ${f.done} din ${f.total}`} title={`${f.nume}: ${f.done}/${f.total}`}>
              <b style={{ width: `${f.total ? f.done / f.total * 100 : 0}%`, background: f.culoare }} />
            </a>
          ))}
        </div>
        <div className={css.legend}>
          {firme.map(f => <a key={f.slug} href={`#firma-${f.slug}`}><i className={css.dot} style={{ background: f.culoare }} />{scurt(f.nume)} <span className="num">{f.done}/{f.total}</span></a>)}
        </div>
        {semnale.length > 0 && (
          <div className={css.signals}>
            {semnale.map(s => <Link key={s.text} href={s.href} className={css.sig} data-ton={s.ton}><span className={css.sigN}>{s.n}</span>{s.text}</Link>)}
          </div>
        )}
      </div>
    </section>
  )
}
