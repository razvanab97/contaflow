'use client'
import { useEffect, useRef, useState } from 'react'
import { TASKS, STEP_LABELS, blockedBy, type Workflow, type Step } from '@/lib/proiect-workflow'
import Icon from '@/components/ui/Icon'
import css from './RutinaLunii.module.css'
import RegesRecommendations from './RegesRecommendations'
import SalaryPackageDownload from './SalaryPackageDownload'
import CreditProposal from './CreditProposal'

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
type Ton = 'danger' | 'warning' | 'muted' | 'success' | 'accent'
const TON: Record<Ton, string> = { danger: css['t-danger'], warning: css['t-warning'], muted: css['t-muted'], success: css['t-success'], accent: css['t-accent'] }

function Pastila({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return <span className={`${css.pill} ${TON[ton]}`}>{children}</span>
}

export default function RutinaLunii({ state, month, next, onEdit, onUpload, assetUrl, onRaport, uploadDisabled = false, salaryArchiveUrl, creditCalculationUrl }: {
  state: Workflow; month: string; next: Task | null | undefined
  onEdit: (w: Workflow) => void; onUpload: (files: File[], task: string) => void; assetUrl: (id: string) => string; onRaport: () => void; uploadDisabled?: boolean; salaryArchiveUrl?: string; creditCalculationUrl?: string
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
    const icon: { s: React.ReactNode; ton: Ton } = gata(row.status) ? { s: <Icon name="check" size={15} strokeWidth={2.4} />, ton: 'success' } : row.status === 'trimis' ? { s: <Icon name="send" size={14} />, ton: 'accent' } : blocat.length ? { s: <Icon name="ban" size={14} />, ton: 'muted' } : termen.ton === 'danger' ? { s: '!', ton: 'danger' } : row.status !== 'lipsa' ? { s: <Icon name="repeat" size={14} />, ton: 'warning' } : { s: String(nr), ton: 'muted' }
    const pill = gata(row.status) ? <Pastila ton="success">{SCURT[row.status]}</Pastila> : row.status === 'trimis' ? <Pastila ton="accent">Trimis · așteaptă acceptarea</Pastila> : blocat.length ? <Pastila ton="muted">Blocat</Pastila> : row.status === 'lipsa' ? <Pastila ton="muted">De pregătit</Pastila> : <Pastila ton="warning">{SCURT[row.status]}</Pastila>
    const titlu = t.key === 'salarii' ? 'Confirmarea plății salariilor și contribuțiilor' : t.title
    return (
      <div key={t.key} ref={el => { refs.current[t.key] = el }} className={css.item} data-next={esteUrmator} data-open={deschis}>
        <button type="button" className={css.head} onClick={() => comuta(t.key)} aria-expanded={deschis}>
          <span className={`${css.icon} ${TON[icon.ton]}`}>{icon.s}</span>
          <span className={css.main}>
            <span className={css.titleRow}>
              <span className={css.title} data-done={gata(row.status)}>{titlu}</span>
              {esteUrmator && <Pastila ton="accent">Următorul pas</Pastila>}
            </span>
            <span className={css.source}>{t.source}{row.note ? ` · ${row.note}` : ''}</span>
          </span>
          <span className={css.side}>
            {pill}
            <span className={`${css.due} ${css['d-' + termen.ton]}`}>{termen.text}</span>
          </span>
          <Icon name="chevronDown" size={16} className={css.chev} />
        </button>

        {(deschis || t.key === 'creditare') && (
          <div className={css.panel} style={!deschis ? { display: 'none' } : undefined}>
            <div className={css.todo}>
              <span className={css.label}>Ce ai de făcut</span>
              <div className={css.todoText}>{t.action}</div>
            </div>
            {t.key === 'reges' && <RegesRecommendations assets={docs} />}
            {t.key === 'creditare' && creditCalculationUrl && <CreditProposal url={creditCalculationUrl} assets={state.assets} assetUrl={assetUrl} disabled={uploadDisabled} onSaveScheme={creditScheme => onEdit({ ...state, creditScheme })} />}
            {blocat.length > 0 && (
              <div role="alert" className={css.blocked}><Icon name="ban" size={15} /> Întâi finalizează: {blocat.join(', ')}. Până atunci poți doar pregăti documentele.</div>
            )}

            <div>
              <span className={css.label}>Stare</span>
              <div className={css.stepper} role="group" aria-label={`Stare ${titlu}`}>
                {flux.map((s, i) => {
                  const activ = row.status === s, trecut = idx >= 0 && i < idx, interzis = blocat.length > 0 && BLOCATE.includes(s)
                  return (
                    <button key={s} type="button" className={css.step} data-active={activ} data-past={trecut} disabled={interzis} aria-pressed={activ}
                      onClick={() => seteaza(t.key, { status: s })} title={interzis ? `Blocat: întâi ${blocat.join(', ')}` : STEP_LABELS[s]}>
                      {trecut && <Icon name="check" size={12} strokeWidth={2.4} />}{SCURT[s]}
                    </button>
                  )
                })}
              </div>
              <div className={css.stateActions}>
                {urmator && !(blocat.length && BLOCATE.includes(urmator)) && (
                  <button type="button" className="btn btn-primary" onClick={() => seteaza(t.key, { status: urmator })}>
                    Marchează: {STEP_LABELS[urmator]} <Icon name="arrowRight" size={14} />
                  </button>
                )}
                <button type="button" className={css.na} data-on={row.status === 'neaplicabil'} onClick={() => seteaza(t.key, { status: row.status === 'neaplicabil' ? 'lipsa' : 'neaplicabil' })}>
                  {row.status === 'neaplicabil' ? '✓ Nu se aplică (anulează)' : 'Nu se aplică luna asta'}
                </button>
              </div>
              {PLATI.has(t.key) && <div className={css.help}>La plăți: inițiată ≠ executată. „Executată” doar după ce vezi plata în extras.</div>}
            </div>

            <div className={css.fields}>
              <label><span className={css.label}>Termen</span>
                <input type="date" className={css.input} aria-label={`Termen ${t.title}`} value={row.due || ''} onChange={e => seteaza(t.key, { due: e.target.value || null })} />
              </label>
              <label><span className={css.label}>Observații / referință confirmare</span>
                <input className={css.input} value={row.note} placeholder="ex. trimis pe mail la Orieda pe 05.10, nr. înregistrare…" onChange={e => seteaza(t.key, { note: e.target.value })} />
              </label>
            </div>

            <div>
              <span className={css.label}>Documente ({docs.length})</span>
              <div className={css.docs}>
                {docs.map(a => (
                  <div key={a.id} style={{minWidth:0,maxWidth:'100%'}}><a href={assetUrl(a.id)} className={css.doc} title={a.originalName ? `${a.name} · Original: ${a.originalName}` : a.name}>
                    <Icon name="fileText" size={14} /><span>{a.name}</span><Icon name="download" size={13} />
                  </a>{a.namingWarning && <div className={css.help} style={{color:'var(--warning)'}}>{a.namingWarning}</div>}</div>
                ))}
                <label className={css.upload}>
                  <Icon name="download" size={14} style={{ transform: 'rotate(180deg)' }} /> {t.key==='reges'?'Adaugă documente REGES':'Adaugă document'} <small>PDF, Word, imagine · max 4 MB{t.key==='reges'?' / fișier':''}</small>
                  <input type="file" aria-label={`Încarcă ${titlu}`} multiple={t.key==='reges'} disabled={uploadDisabled} accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) onUpload(files, t.key) }} />
                </label>
                {t.key === 'raport' && <button type="button" className="btn btn-sm" onClick={onRaport}>Completează raportul (Word) <Icon name="arrowRight" size={13} /></button>}
              </div>
              <div className={css.help}>Încărcarea nu schimbă starea — după ce verifici / semnezi / trimiți, apasă starea potrivită.</div>
              {t.key==='reges'&&<div className={css.help}>Poți selecta până la 20 de documente odată. PDF-urile rămân separate și sunt redenumite după tipul raportului, numele din raport și data emiterii. Conținutul și semnăturile PDF nu sunt modificate.</div>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={css.root}>
      {/* Pasul urmator + progresul lunii */}
      <div className={css.hero}>
        <div className={css.heroTop}>
          <div className={`${css.heroIcon} ${next ? '' : css.heroIconDone}`}><Icon name={next ? 'arrowRight' : 'check'} size={20} strokeWidth={2.2} /></div>
          <div className={css.heroBody}>
            <div className={css.eyebrow}>{next ? 'Următorul pas' : 'Luna e aproape gata'}</div>
            <h2 className={css.heroTitle}>{next ? (next.key === 'salarii' ? 'Confirmarea plății salariilor' : next.title) : 'Toți pașii sunt trimiși sau încheiați'}</h2>
            <p className={css.heroText}>{next ? next.action : 'Confirmă acceptările primite (Trimis → Acceptat). Trimiterea nu confirmă acceptarea.'}</p>
          </div>
          {next && <button type="button" className="btn btn-primary btn-lg" onClick={() => mergiLa(next.key)}>Deschide pasul <Icon name="arrowRight" size={15} /></button>}
        </div>
        <div className={css.progressRow}>
          <div className={css.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresul lunii"><div style={{ width: `${pct}%` }} /></div>
          <div className={css.chips}>
            <Pastila ton="success">✓ {incheiate} din {total} încheiate</Pastila>
            {trimise > 0 && <Pastila ton="accent">↗ {trimise} trimise — așteaptă acceptarea</Pastila>}
            {restante > 0 && <Pastila ton="danger">! {restante} {restante === 1 ? 'restant' : 'restante'}</Pastila>}
            <Pastila ton="muted">{total - incheiate - trimise} de lucrat</Pastila>
          </div>
        </div>
      </div>

      {salarii.length > 0 && (
        <section className={css.group}>
          <div className={css.groupHead}>
            <div>
              <h3 className={css.groupTitle}>Salarii și contribuții</h3>
              <div className={css.groupSub}>În ordine: documentele de salarizare → creditarea contului de grant → extrase și registru → confirmarea plății.</div>
            </div>
            <span className={css.groupCount}>{salarii.filter(t => gata(state.tasks[t.key].status)).length}/{salarii.length} încheiați</span>
          </div>
          {salaryArchiveUrl && <SalaryPackageDownload assets={state.assets} url={salaryArchiveUrl} month={month} disabled={uploadDisabled} />}
          <div className={css.list}>{salarii.map((t, i) => renderPas(t, i + 1))}</div>
        </section>
      )}

      {altele.length > 0 && (
        <section className={css.group}>
          <div className={css.groupHead}>
            <div>
              <h3 className={css.groupTitle}>Alte obligații ale lunii</h3>
              <div className={css.groupSub}>Ordonate după termen; cele trimise sau încheiate coboară la final.</div>
            </div>
            <span className={css.groupCount}>{altele.filter(t => gata(state.tasks[t.key].status)).length}/{altele.length} încheiate</span>
          </div>
          <div className={css.list}>{altele.map((t, i) => renderPas(t, salarii.length + i + 1))}</div>
        </section>
      )}

      <details className={css.info}>
        <summary><Icon name="alert" size={15} /> Bine de știut despre rutina lunii <Icon name="chevronDown" size={15} /></summary>
        <p>Documentele se referă la luna anterioară lunii de lucru. Termenele sunt orientative și se pot corecta pe fiecare pas (sau permanent, în „Date permanente și termene”). Încărcarea unui document nu confirmă semnarea, trimiterea sau executarea unei plăți — confirmi tu, din butoanele de stare. Raportarea AJOFM apare doar în luna anuală configurată (implicit martie).</p>
      </details>
    </div>
  )
}
