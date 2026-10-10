'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TASKS, STEP_LABELS, blockedBy, type Workflow, type Step } from '@/lib/proiect-workflow'

type Task = typeof TASKS[number]
type Asset = Workflow['assets'][number]

// Rutina lunii (PROIECT AB Textile), gandita sa fie clar CE ai de facut, IN CE ORDINE si CAT mai e:
// pasul urmator sus, pasii grupati (salarii in ordinea lor, apoi restul dupa termen), fiecare cu
// starea vizuala, termenul relativ, butoane de stare (in ordinea fluxului) si documentele lui.

const PLATI = new Set(['creditare', 'salarii', 'chirie'])
const FLUX_DOC: Step[] = ['lipsa', 'primit', 'semnat', 'trimis', 'acceptat']
const FLUX_PLATA: Step[] = ['lipsa', 'initiat', 'avizat', 'executat', 'trimis', 'acceptat']
const BLOCATE: Step[] = ['semnat', 'trimis', 'acceptat', 'initiat', 'avizat', 'executat']
const ORDINE_SALARII = ['stat', 'pontaj', 'reges', 'centralizator', 'creditare', 'extras', 'registru', 'salarii']
const SCURT: Partial<Record<Step, string>> = { lipsa: 'De pregătit', primit: 'Primit', semnat: 'Semnat', trimis: 'Trimis', acceptat: 'Acceptat', initiat: 'Inițiată', avizat: 'Avizată', executat: 'Executată', neaplicabil: 'Nu se aplică' }

const card: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }
const input: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', fontSize: 'var(--fs-md)', outline: 'none', fontFamily: 'inherit' }
const eticheta: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: 'var(--fs-xs)', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }

const gata = (s?: Step) => s === 'acceptat' || s === 'neaplicabil'
const inchis = (s?: Step) => s === 'trimis' || gata(s)

function zileDe(due: string | null, azi: string) {
  if (!due) return null
  return Math.round((Date.parse(due) - Date.parse(azi)) / 86_400_000)
}
function termenText(due: string | null, azi: string, s: Step) {
  if (!due) return { text: 'fără termen', ton: 'muted' as const }
  const z = zileDe(due, azi)!
  const data = due.split('-').reverse().slice(0, 2).join('.')
  if (inchis(s)) return { text: data, ton: 'muted' as const }
  if (z < 0) return { text: `depășit cu ${-z} ${-z === 1 ? 'zi' : 'zile'}`, ton: 'danger' as const }
  if (z === 0) return { text: 'termen azi', ton: 'danger' as const }
  if (z <= 3) return { text: `în ${z} ${z === 1 ? 'zi' : 'zile'} · ${data}`, ton: 'warning' as const }
  return { text: `${data} · în ${z} zile`, ton: 'muted' as const }
}
const TON: Record<'danger' | 'warning' | 'muted' | 'success' | 'accent', { bg: string; c: string }> = {
  danger: { bg: 'var(--danger-soft)', c: 'var(--danger)' }, warning: { bg: 'var(--warning-soft)', c: 'var(--warning)' },
  muted: { bg: 'var(--surface-secondary)', c: 'var(--text-secondary)' }, success: { bg: 'var(--success-soft)', c: 'var(--success)' },
  accent: { bg: 'var(--accent-soft)', c: 'var(--accent)' },
}

function Pastila({ ton, children }: { ton: keyof typeof TON; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: 'var(--r-full)', fontSize: 'var(--fs-xs)', fontWeight: 650, background: TON[ton].bg, color: TON[ton].c, whiteSpace: 'nowrap' }}>{children}</span>
}

export default function RutinaLunii({ state, month, next, onEdit, onUpload, assetUrl, onRaport }: {
  state: Workflow; month: string; next: Task | null | undefined
  onEdit: (w: Workflow) => void; onUpload: (f: File, task: string) => void; assetUrl: (id: string) => string; onRaport: () => void
}) {
  const azi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(new Date())
  const vizibile = (TASKS as readonly Task[]).filter(t => state.rules[t.key]?.frequency !== 'annual' || Number(month.slice(5, 7)) === state.rules[t.key].month || state.tasks[t.key]?.due).filter(t => state.tasks[t.key])
  const [deschise, setDeschise] = useState<Set<string>>(() => new Set(next ? [next.key] : []))
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => { if (next) setDeschise(prev => prev.size ? prev : new Set([next.key])) }, [next])

  const total = vizibile.length
  const incheiate = vizibile.filter(t => gata(state.tasks[t.key].status)).length
  const trimise = vizibile.filter(t => state.tasks[t.key].status === 'trimis').length
  const restante = vizibile.filter(t => !inchis(state.tasks[t.key].status) && (zileDe(state.tasks[t.key].due, azi) ?? 1) < 0).length
  const salarii = vizibile.filter(t => ORDINE_SALARII.includes(t.key)).sort((a, b) => ORDINE_SALARII.indexOf(a.key) - ORDINE_SALARII.indexOf(b.key))
  const altele = vizibile.filter(t => !ORDINE_SALARII.includes(t.key)).sort((a, b) => Number(inchis(state.tasks[a.key].status)) - Number(inchis(state.tasks[b.key].status)) || (state.tasks[a.key].due || '9999').localeCompare(state.tasks[b.key].due || '9999'))
  const pct = total ? Math.round(((incheiate + trimise * 0.5) / total) * 100) : 0

  function comuta(key: string) { setDeschise(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n }) }
  function mergiLa(key: string) {
    setDeschise(prev => new Set(prev).add(key))
    setTimeout(() => refs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  function seteaza(key: string, patch: Partial<Workflow['tasks'][string]>) {
    onEdit({ ...state, tasks: { ...state.tasks, [key]: { ...state.tasks[key], ...patch } } })
  }

  // Functie de randare (nu componenta definita in componenta) - altfel campurile s-ar remonta la
  // fiecare tasta si ar pierde focusul.
  function renderPas(t: Task, nr: number) {
    const row = state.tasks[t.key]
    const blocat = blockedBy(t.key, state)
    const flux = PLATI.has(t.key) ? FLUX_PLATA : FLUX_DOC
    const idx = flux.indexOf(row.status)
    const urmator = row.status === 'neaplicabil' ? null : flux[idx + 1] || null
    const termen = termenText(row.due, azi, row.status)
    const docs: Asset[] = state.assets.filter(a => a.task === t.key)
    const deschis = deschise.has(t.key)
    const esteUrmator = next?.key === t.key
    const icon = gata(row.status) ? { s: '✓', ...TON.success } : row.status === 'trimis' ? { s: '↗', ...TON.accent } : blocat.length ? { s: '🔒', ...TON.muted } : termen.ton === 'danger' ? { s: '!', ...TON.danger } : row.status !== 'lipsa' ? { s: '●', ...TON.warning } : { s: String(nr), ...TON.muted }
    const pill = gata(row.status) ? <Pastila ton="success">✓ {SCURT[row.status]}</Pastila> : row.status === 'trimis' ? <Pastila ton="accent">Trimis · așteaptă acceptarea</Pastila> : blocat.length ? <Pastila ton="muted">🔒 Blocat</Pastila> : row.status === 'lipsa' ? <Pastila ton="muted">De pregătit</Pastila> : <Pastila ton="warning">{SCURT[row.status]}</Pastila>
    return (
      <div key={t.key} ref={el => { refs.current[t.key] = el }} style={{ ...card, borderColor: esteUrmator ? 'var(--accent)' : 'var(--border)', boxShadow: esteUrmator ? '0 0 0 3px var(--accent-soft)' : undefined, scrollMarginTop: '90px' }}>
        <button type="button" onClick={() => comuta(t.key)} aria-expanded={deschis} style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
          <span style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 750, background: icon.bg, color: icon.c }}>{icon.s}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: gata(row.status) ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{t.key === 'salarii' ? 'Confirmarea plății salariilor și contribuțiilor' : t.title}</span>
              {esteUrmator && <Pastila ton="accent">Următorul pas</Pastila>}
            </span>
            <span style={{ display: 'block', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.source}{row.note ? ` · ${row.note}` : ''}</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0 }}>
            {pill}
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: TON[termen.ton].c }}>{termen.text}</span>
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', transform: deschis ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>›</span>
        </button>

        {deschis && (
          <div style={{ padding: '0 16px 16px 62px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Ce ai de făcut</div>
              <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)', lineHeight: 1.55 }}>{t.action}</div>
            </div>
            {blocat.length > 0 && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                🔒 Întâi finalizează: {blocat.join(', ')}. Până atunci poți doar pregăti documentele.
              </div>
            )}

            <div>
              <div style={{ ...eticheta, marginBottom: '8px' }}>Stare</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {flux.map((s, i) => {
                  const activ = row.status === s, trecut = idx >= 0 && i < idx, interzis = blocat.length > 0 && BLOCATE.includes(s)
                  return (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {i > 0 && <span style={{ width: '14px', height: '2px', background: trecut || activ ? 'var(--success)' : 'var(--border)' }} />}
                      <button type="button" disabled={interzis} onClick={() => seteaza(t.key, { status: s })}
                        title={interzis ? `Blocat: întâi ${blocat.join(', ')}` : STEP_LABELS[s]}
                        style={{ padding: '6px 11px', borderRadius: 'var(--r-full)', fontSize: 'var(--fs-sm)', fontWeight: activ ? 700 : 550, cursor: interzis ? 'not-allowed' : 'pointer', opacity: interzis ? .45 : 1,
                          border: `1px solid ${activ ? 'var(--accent)' : trecut ? 'var(--success)' : 'var(--border)'}`,
                          background: activ ? 'var(--accent-solid)' : trecut ? 'var(--success-soft)' : 'var(--surface)', color: activ ? '#fff' : trecut ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {trecut ? '✓ ' : ''}{SCURT[s]}
                      </button>
                    </span>
                  )
                })}
                <button type="button" onClick={() => seteaza(t.key, { status: row.status === 'neaplicabil' ? 'lipsa' : 'neaplicabil' })}
                  style={{ marginLeft: '6px', padding: '6px 11px', borderRadius: 'var(--r-full)', fontSize: 'var(--fs-sm)', fontWeight: 550, cursor: 'pointer', border: `1px dashed ${row.status === 'neaplicabil' ? 'var(--text-secondary)' : 'var(--border)'}`, background: row.status === 'neaplicabil' ? 'var(--surface-secondary)' : 'transparent', color: 'var(--text-secondary)' }}>
                  {row.status === 'neaplicabil' ? '✓ Nu se aplică (anulează)' : 'Nu se aplică luna asta'}
                </button>
              </div>
              {urmator && !(blocat.length && BLOCATE.includes(urmator)) && (
                <button type="button" className="btn btn-primary" style={{ marginTop: '10px' }} onClick={() => seteaza(t.key, { status: urmator })}>
                  Marchează: {STEP_LABELS[urmator]} →
                </button>
              )}
              {PLATI.has(t.key) && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '6px' }}>La plăți: inițiată ≠ executată. „Executată” doar după ce vezi plata în extras.</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: '12px' }}>
              <label style={eticheta}>Termen
                <input type="date" aria-label={`Termen ${t.title}`} value={row.due || ''} style={input} onChange={e => seteaza(t.key, { due: e.target.value || null })} />
              </label>
              <label style={eticheta}>Observații / referință confirmare
                <input value={row.note} placeholder="ex. trimis pe mail la Orieda pe 05.10, nr. înregistrare…" style={input} onChange={e => seteaza(t.key, { note: e.target.value })} />
              </label>
            </div>

            <div>
              <div style={{ ...eticheta, marginBottom: '8px' }}>Documente ({docs.length})</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {docs.map(a => (
                  <a key={a.id} href={assetUrl(a.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', textDecoration: 'none', maxWidth: '100%' }}>
                    📄 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>{a.name}</span> <span style={{ color: 'var(--accent)' }}>↓</span>
                  </a>
                ))}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: 'var(--r-md)', border: '1px dashed var(--border-strong)', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
                  + Adaugă document <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>PDF, Word, imagine · max 4 MB</span>
                  <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f, t.key) }} />
                </label>
                {t.key === 'raport' && <button type="button" className="btn btn-sm" onClick={onRaport}>Completează raportul (Word) →</button>}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '6px' }}>Încărcarea nu schimbă starea — după ce verifici / semnezi / trimiți, apasă starea potrivită.</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Pasul urmator + progresul lunii */}
      <div style={{ ...card, padding: '20px', borderLeft: '4px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{next ? 'Următorul pas' : 'Luna e aproape gata'}</div>
            <div style={{ fontSize: 'var(--fs-xl, 22px)', fontWeight: 750, color: 'var(--text-primary)', marginTop: '4px' }}>{next ? (next.key === 'salarii' ? 'Confirmarea plății salariilor' : next.title) : 'Toți pașii sunt trimiși sau încheiați'}</div>
            <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>{next ? next.action : 'Confirmă acceptările primite (Trimis → Acceptat). Trimiterea nu confirmă acceptarea.'}</div>
          </div>
          {next && <button type="button" className="btn btn-primary" onClick={() => mergiLa(next.key)}>Deschide pasul →</button>}
        </div>
        <div>
          <div style={{ height: '8px', borderRadius: 'var(--r-full)', background: 'var(--surface-secondary)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)', borderRadius: 'var(--r-full)', transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <Pastila ton="success">✓ {incheiate} din {total} încheiate</Pastila>
            {trimise > 0 && <Pastila ton="accent">↗ {trimise} trimise — așteaptă acceptarea</Pastila>}
            {restante > 0 && <Pastila ton="danger">! {restante} {restante === 1 ? 'restant' : 'restante'}</Pastila>}
            <Pastila ton="muted">{total - incheiate - trimise} de lucrat</Pastila>
          </div>
        </div>
      </div>

      {salarii.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Salarii și contribuții <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>· {salarii.filter(t => gata(state.tasks[t.key].status)).length}/{salarii.length} încheiați</span></div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>În ordine: documentele de salarizare → creditarea contului de grant → extrase și registru → confirmarea plății.</div>
          </div>
          {salarii.map((t, i) => renderPas(t, i + 1))}
        </section>
      )}

      {altele.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Alte obligații ale lunii</div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Ordonate după termen; cele trimise sau încheiate coboară la final.</div>
          </div>
          {altele.map((t, i) => renderPas(t, salarii.length + i + 1))}
        </section>
      )}

      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)' }}>
        <b>Bine de știut:</b> documentele se referă la luna anterioară lunii de lucru. Termenele sunt orientative și se pot corecta pe fiecare pas (sau permanent, în „Date permanente și termene”). Încărcarea unui document nu confirmă semnarea, trimiterea sau executarea unei plăți — confirmi tu, din butoanele de stare. Raportarea AJOFM apare doar în luna anuală configurată (implicit martie).
      </div>
    </div>
  )
}
