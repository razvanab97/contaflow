import { regesIdentity, REGES_HISTORICAL_EMPLOYEES } from './reges-reports'

export type CreditBasis = { name: string; netCents: number; contributionsCents: number }
export type CreditScheme = { source: string; rows: CreditBasis[]; period?: string; confirmedAt?: string }
export type PayrollData = { period: string; rows: (CreditBasis & { camCents?: number })[]; netCents?: number; contributionsCents: number; camCents?: number; warnings: string[] }
export type CreditAnalysis = { period: string; actual: CreditBasis[]; scheme: CreditScheme; warnings: string[]; sources: { stat: { id: string; name: string }; centralizator: { id: string; name: string } } }
const MAX_CENTS = 100_000_000
const months = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie']
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function moneyCents(value: string): number {
  let normalized = value.trim()
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(normalized)) normalized = normalized.replace(/\./g, '').replace(',', '.')
  else if (/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) normalized = normalized.replace(',', '.')
  else throw new Error('Sumă neclară: verifică formatul monetar.')
  const [whole, decimals = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) throw new Error('Sumă invalidă sau prea mare.')
  return cents
}

export function completeCreditScheme(): CreditScheme {
  return { source: 'Schema completă din exemplul ales: 2.574 lei net + 1.560 lei contribuții / angajat; nu aplică automat bugetul lunar redus AA3.', rows: REGES_HISTORICAL_EMPLOYEES.map(name => ({ name, netCents: 257400, contributionsCents: 156000 })) }
}

export function validCreditScheme(value: unknown): value is CreditScheme {
  if (!value || typeof value !== 'object') return false
  const scheme = value as CreditScheme
  return typeof scheme.source === 'string' && scheme.source.length <= 1000 && Array.isArray(scheme.rows) && scheme.rows.length > 0 && scheme.rows.length <= 100
    && scheme.rows.every(row => row && typeof row.name === 'string' && regesIdentity(row.name).length > 0 && row.name.length <= 100 && !/\d{13}/.test(row.name) && [row.netCents,row.contributionsCents].every(n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS))
    && new Set(scheme.rows.map(row => regesIdentity(row.name))).size === scheme.rows.length
    && (scheme.period === undefined || typeof scheme.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(scheme.period))
    && (scheme.confirmedAt === undefined || typeof scheme.confirmedAt === 'string' && Number.isFinite(Date.parse(scheme.confirmedAt)))
}

function readPeriod(text: string, type: 'stat' | 'centralizator') {
  const normalized = fold(text)
  const match = normalized.match(type === 'stat' ? /perioada:\s*([a-z]+)\s+(20\d{2})/ : /stat\s+de\s+plata\s+luna\s+([a-z]+)\s+(20\d{2})/)
  const month = match ? months.indexOf(match[1]) + 1 : 0
  if (!match || !month) throw new Error('Nu am identificat sigur perioada documentului.')
  return `${match[2]}-${String(month).padStart(2, '0')}`
}

function amounts(value: string) { return value.trim().split(/\s+/).map(moneyCents) }
function assertCompany(text: string) {
  const company = fold(text).replace(/[.]/g, '')
  if (!/(?:^|\n)\s*(?:sc\s+)?ab\s+textile\s+srl\s*(?:\n|$)/.test(company)) throw new Error('Documentul nu a fost identificat ca aparținând AB TEXTILE S.R.L.')
}

export function parsePayroll(text: string, type: 'stat' | 'centralizator'): PayrollData {
  assertCompany(text)
  if (type === 'stat' && !/C\.?I\.?F\.?:\s*52575850/.test(text)) throw new Error('CUI-ul din stat nu corespunde AB TEXTILE S.R.L.')
  const period = readPeriod(text, type), rows: PayrollData['rows'] = [], totals: number[][] = []
  let camCents = 0
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const total = line.match(/^\s*TOTAL:\s*([\d.,\s]+)$/i)
    if (total) { const values = amounts(total[1]); if (values.length === (type === 'stat' ? 13 : 7)) totals.push(values); continue }
    const match = line.trim().match(/^([\p{L}][\p{L}\s.'-]+?)\s+(\d[\d.,]*(?:\s+\d[\d.,]*)*)$/u)
    if (!match || /^formatie|administrativ|numar|luna/i.test(match[1])) continue
    const values = amounts(match[2]), name = match[1].replace(/\s+/g, ' ').trim()
    if (type === 'stat') {
      if (values.length !== 13) continue
      rows.push({ name, netCents: values[9], contributionsCents: values[4] + values[5] + values[8] })
    } else {
      if (![5,7].includes(values.length)) continue
      const totalCents = values[values.length - 1]
      if (values.slice(0,-1).reduce((sum,n)=>sum+n,0) !== totalCents) throw new Error(`Contribuțiile nu se reconciliază pentru ${name}.`)
      camCents += values[3]
      rows.push({ name, netCents: 0, contributionsCents: totalCents, camCents: values[3] })
    }
  }
  if (!rows.length || rows.length > 100 || totals.length !== 1) throw new Error('Formatul documentului sau totalurile nu au fost identificate sigur. Încarcă un PDF cu text lizibil.')
  if (new Set(rows.map(row=>regesIdentity(row.name))).size !== rows.length) throw new Error('Documentul conține persoane duplicate; verifică statul/centralizatorul.')
  if (type === 'stat') {
    const totalNet = rows.reduce((sum,row)=>sum+row.netCents,0)
    if (totalNet !== totals[0][9]) throw new Error('Salariile nete individuale nu corespund totalului din stat.')
    const total = text.match(/TOTAL DE PLATA:\s*([\d.,]+)/i)
    if (!total) throw new Error('Lipsește totalul contribuțiilor datorate din stat.')
    const contributionsCents = moneyCents(total[1])
    if (totals[0][4] + totals[0][5] + totals[0][8] !== rows.reduce((sum,row)=>sum+row.contributionsCents,0)) throw new Error('Contribuțiile individuale nu se reconciliază cu statul.')
    return { period, rows, netCents: totalNet, contributionsCents, warnings: [] }
  }
  const contributionsCents = rows.reduce((sum,row)=>sum+row.contributionsCents,0)
  if (contributionsCents !== totals[0][6] || totals[0].slice(0,6).reduce((sum,n)=>sum+n,0) !== contributionsCents || totals[0][3] !== camCents) throw new Error('Totalul centralizatorului nu se reconciliază cu persoanele și CAM.')
  const header = fold(text).match(/luna\s+([a-z]+)\s+(20\d{2})/)
  const headerPeriod = header && months.includes(header[1]) ? `${header[2]}-${String(months.indexOf(header[1])+1).padStart(2,'0')}` : null
  return { period, rows, contributionsCents, camCents, warnings: headerPeriod && headerPeriod !== period ? ['Antetul centralizatorului indică altă lună decât titlul. Verifică documentul înainte de confirmare.'] : [] }
}

export function reconcilePayroll(stat: PayrollData, central: PayrollData, period: string): CreditBasis[] {
  if (stat.period !== period || central.period !== period) throw new Error(`Documentele trebuie să fie pentru perioada ${period}; stat: ${stat.period}, centralizator: ${central.period}.`)
  if (stat.contributionsCents !== central.contributionsCents || stat.rows.length !== central.rows.length) throw new Error('Statul și centralizatorul nu au aceleași totaluri/persoane.')
  return stat.rows.map(row => {
    const contributions = central.rows.find(candidate=>regesIdentity(candidate.name)===regesIdentity(row.name))
    if (!contributions || contributions.contributionsCents !== row.contributionsCents + (contributions.camCents ?? 0)) throw new Error(`Persoana/contribuțiile nu se potrivesc între documente: ${row.name}.`)
    return { ...row, contributionsCents: contributions.contributionsCents }
  })
}

export function calculateGrantCredit(actual: CreditBasis[], scheme: CreditScheme) {
  if (!validCreditScheme(scheme) || actual.length !== scheme.rows.length) throw new Error('Schema și persoanele din documente diferă. Verifică baza; nu folosim automat sumele altui angajat.')
  const rows = actual.map(row => {
    const base = scheme.rows.find(candidate=>regesIdentity(candidate.name)===regesIdentity(row.name))
    if (!base) throw new Error(`Nu există bază confirmată pentru ${row.name}.`)
    return { ...row, baseNetCents: base.netCents, baseContributionsCents: base.contributionsCents, netDifferenceCents: row.netCents-base.netCents, contributionsDifferenceCents: row.contributionsCents-base.contributionsCents }
  })
  const sum = (key: keyof typeof rows[number]) => rows.reduce((total,row)=>total+Number(row[key]),0)
  const netDifferenceCents = sum('netDifferenceCents'), contributionsDifferenceCents = sum('contributionsDifferenceCents')
  return { rows, netDifferenceCents, contributionsDifferenceCents, differenceCents: netDifferenceCents+contributionsDifferenceCents, toCreditCents: Math.max(0,netDifferenceCents+contributionsDifferenceCents), hasNegativeRows: rows.some(row=>row.netDifferenceCents<0||row.contributionsDifferenceCents<0) }
}
