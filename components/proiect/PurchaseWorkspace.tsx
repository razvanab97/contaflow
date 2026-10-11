'use client'
import { useState, type ReactNode } from 'react'
import styles from './PurchaseWorkspace.module.css'

export interface PurchaseStep {
  cheie: string
  titlu: string
  ok: boolean
  partial?: boolean
  detaliu: string
  actiuni: ReactNode
}

export default function PurchaseWorkspace({ id, steps, documents, settings, finished, onFinish, notice }: {
  id: string
  steps: PurchaseStep[]
  documents?: ReactNode
  settings: ReactNode
  finished: boolean
  onFinish: () => void
  notice?: ReactNode
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'step' | 'documents' | 'offers'>('step')
  const [expanded, setExpanded] = useState(!finished)
  const current = steps.find(step => !step.ok)
  const active = steps.find(step => step.cheie === selected) || current || steps[0]
  const completed = steps.filter(step => step.ok).length
  const visibleKey = view === 'offers' ? 'oferte' : active?.cheie
  const select = (key: string) => { setSelected(key); setView('step') }

  return <section className={styles.workspace} aria-label="Dosarul achiziției">
    <div className={styles.toolbar}>
      <strong>{finished ? 'Achiziție finalizată' : 'Dosarul achiziției'} <span className={styles.muted}>{completed}/{steps.length} pași</span></strong>
      <progress aria-label="Pași completați" max={steps.length} value={completed} />
      <button type="button" className="btn btn-sm btn-ghost" aria-expanded={expanded} aria-controls={`workspace-${id}`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Restrânge dosarul' : 'Deschide dosarul'}</button>
    </div>
    <details className={styles.settings}><summary>Detalii și setări ale dosarului</summary>{settings}</details>
    {notice}
    <div id={`workspace-${id}`} hidden={!expanded}>
      <div className={styles.layout}>
        <nav className={styles.steps} aria-label="Pașii achiziției">
          {steps.map((step, index) => <button type="button" key={step.cheie} className={styles.step} data-active={view === 'step' && active?.cheie === step.cheie} aria-current={view === 'step' && active?.cheie === step.cheie ? 'step' : undefined} aria-controls={`work-${id}-${step.cheie}`} onClick={() => select(step.cheie)}>
            <span className={styles.number} data-complete={step.ok}>{index + 1}</span>
            <span><strong>{step.titlu}</strong><small>{step.ok ? 'Completat' : step.partial ? 'De completat' : current?.cheie === step.cheie ? 'Următorul pas' : 'Lipsește'}</small></span>
          </button>)}
        </nav>
        <div className={styles.body}>
          <div className={styles.views} aria-label="Zonele dosarului">
            <button type="button" aria-pressed={view === 'step'} onClick={() => setView('step')}>Pas selectat</button>
            {documents && <button type="button" aria-pressed={view === 'documents'} onClick={() => setView('documents')}>Documente</button>}
            <button type="button" aria-pressed={view === 'offers'} onClick={() => setView('offers')}>Oferte</button>
          </div>
          {/* Keep upload drafts mounted when navigating between steps and views. */}
          {steps.map((step, index) => <section key={step.cheie} id={`work-${id}-${step.cheie}`} hidden={view === 'documents' || visibleKey !== step.cheie} aria-label={step.titlu}>
            <div className={styles.heading}><span className={styles.muted}>Pasul {index + 1} din {steps.length}</span><h3>{step.titlu}</h3><p>{step.detaliu}</p></div>
            {step.ok && <p className={styles.muted}>Poți modifica acest pas fără să pierzi documentele existente.</p>}
            <div className={styles.actions}>{step.actiuni}</div>
            <div className={styles.navigation}>
              <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => select(steps[index - 1].cheie)}>Pasul precedent</button>
              <button type="button" className="btn btn-sm" disabled={index === steps.length - 1} onClick={() => select(steps[index + 1].cheie)}>Pasul următor</button>
            </div>
          </section>)}
          <section hidden={view !== 'documents'} aria-label="Documentele dosarului"><div className={styles.heading}><h3>Documentele dosarului</h3><p>Vizualizează, descarcă sau înlocuiește documentele.</p></div>{documents}</section>
        </div>
      </div>
      {!finished && <div className={styles.footer}><span className={styles.muted}>{current ? `De completat: ${current.titlu}` : 'Dosarul este complet.'}</span><button type="button" className="btn btn-sm btn-primary" onClick={onFinish}>Marchează finalizată</button></div>}
    </div>
  </section>
}
