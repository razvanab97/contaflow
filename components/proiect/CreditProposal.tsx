'use client'
import { useEffect, useState } from 'react'
import { calculateGrantCredit, moneyCents, type CreditAnalysis, type CreditScheme } from '@/lib/grant-credit'
import type { Workflow } from '@/lib/proiect-workflow'
import css from './CreditProposal.module.css'

const lei = (cents: number) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
type Draft = { name: string; net: string; contributions: string }

export default function CreditProposal({ url, assets, assetUrl, onSaveScheme, disabled = false }: {
  url: string; assets: Workflow['assets']; assetUrl: (id: string) => string; onSaveScheme: (scheme: CreditScheme) => void; disabled?: boolean
}) {
  const fingerprint = JSON.stringify(assets.filter(a => ['stat','centralizator'].includes(a.task)).map(a => [a.id,a.createdAt]))
  const [loaded, setLoaded] = useState<{ key: string; data?: CreditAnalysis; error?: string } | null>(null)
  const [draft, setDraft] = useState<Draft[]>([])
  const [verified, setVerified] = useState(false)
  const [revision, setRevision] = useState(0)
  const key = `${url}:${fingerprint}:${revision}`
  useEffect(() => {
    const controller = new AbortController()
    setVerified(false)
    void (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Calculul nu a putut fi citit.')
        if (controller.signal.aborted) return
        setDraft((data as CreditAnalysis).scheme.rows.map(row => ({ name: row.name, net: (row.netCents / 100).toFixed(2), contributions: (row.contributionsCents / 100).toFixed(2) })))
        setLoaded({ key, data })
      } catch (error) {
        if (!controller.signal.aborted) setLoaded({ key, error: error instanceof Error ? error.message : 'Calcul indisponibil.' })
      }
    })()
    return () => controller.abort()
  }, [url, key])
  const analysis = loaded?.key === key ? loaded.data : undefined
  let scheme: CreditScheme | undefined, result: ReturnType<typeof calculateGrantCredit> | undefined, invalid = ''
  if (analysis) {
    try {
      const rows = draft.map(row => ({ name: row.name, netCents: moneyCents(row.net), contributionsCents: moneyCents(row.contributions) }))
      const changed = JSON.stringify(rows) !== JSON.stringify(analysis.scheme.rows)
      scheme = { ...analysis.scheme, rows, period: analysis.period, source: changed ? `Bază ajustată și verificată manual pentru ${analysis.period}.` : analysis.scheme.source }
      result = calculateGrantCredit(analysis.actual, scheme)
    } catch (error) { invalid = error instanceof Error ? error.message : 'Verifică sumele bazei.' }
  }
  function update(index: number, field: 'net' | 'contributions', value: string) {
    setDraft(rows => rows.map((row,i) => i === index ? { ...row, [field]: value } : row)); setVerified(false)
  }
  return <section className={css.card} aria-label="Calculul creditării">
    <div className={css.heading}><strong>Creditare calculată din documente</strong><button type="button" className="btn btn-sm" onClick={() => setRevision(n => n + 1)}>Recalculează</button></div>
    {loaded?.key !== key && <p role="status">Verific statul și centralizatorul...</p>}
    {loaded?.key === key && loaded.error && <p role="alert">{loaded.error} Nu propunem o sumă din documente neverificate.</p>}
    {analysis && <>
      <p className={css.help}>Perioada salarizării: {analysis.period}. Propunere de verificat, nu plată inițiată sau aprobată.</p>
      {result && <><div className={css.amount}>{lei(result.toCreditCents)} <small>lei de creditat</small></div>
        <p>{lei(result.netDifferenceCents)} lei diferență salarii + {lei(result.contributionsDifferenceCents)} lei diferență contribuții</p>
        <div className={css.scroll}><table><caption>Diferențe pe angajat (lei)</caption><thead><tr><th>Angajat</th><th>Net bază</th><th>Net actual</th><th>Diferență net</th><th>Contribuții bază</th><th>Contribuții actuale</th><th>Diferență contribuții</th></tr></thead><tbody>
          {result.rows.map(row => <tr key={row.name}><th scope="row">{row.name}</th>{[row.baseNetCents,row.netCents,row.netDifferenceCents,row.baseContributionsCents,row.contributionsCents,row.contributionsDifferenceCents].map((amount,i) => <td key={i}>{lei(amount)}</td>)}</tr>)}
        </tbody></table></div>
        {result.hasNegativeRows && <p role="alert">Există diferențe negative, incluse în total. Verifică dacă schema se aplică acestei luni înainte de creditare.</p>}
      </>}
      {invalid && <p role="alert">{invalid}</p>}
      <p className={css.help}>CAM este deja inclus în contribuțiile centralizatorului; nu îl adăugăm încă o dată.</p>
      {analysis.warnings.map(warning => <p role="alert" key={warning}>{warning}</p>)}
      <div className={css.sources}>Surse: {Object.values(analysis.sources).map(source => <a key={source.id} href={assetUrl(source.id)}>{source.name}</a>)}</div>
      <details><summary>Verifică sau ajustează baza de calcul</summary><p className={css.help}>{analysis.scheme.source}</p>
        {draft.map((row,index) => <div key={row.name} className={css.basis}><strong>{row.name}</strong><label>Net bază (lei)<input inputMode="decimal" aria-label={`Net bază ${row.name}`} value={row.net} onChange={e => update(index,'net',e.target.value)} /></label><label>Contribuții bază (lei)<input inputMode="decimal" aria-label={`Contribuții bază ${row.name}`} value={row.contributions} onChange={e => update(index,'contributions',e.target.value)} /></label></div>)}
      </details>
      <label className={css.verify}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />Am verificat documentele, persoanele și baza pentru această lună.</label>
      <button type="button" className="btn btn-primary" disabled={disabled || !verified || !scheme || !result} onClick={() => { if (scheme) { onSaveScheme({ ...scheme, confirmedAt: new Date().toISOString() }); setVerified(false) } }}>Păstrează baza pentru luna următoare</button>
      <p className={css.help}>Se salvează numai schema confirmată. Starea plății rămâne neschimbată; suma se recalculează din cele mai recente documente.</p>
    </>}
  </section>
}
