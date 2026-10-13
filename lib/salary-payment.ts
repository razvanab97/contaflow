import { moneyCents } from './grant-credit'
import { regesIdentity } from './reges-reports'

export type SalaryPayment = { name: string; iban: string; bank: string; payerIban: string; amountCents: number; currency: 'RON'; period: string; processedOn: string; description: string; reference: string; yearInferred: boolean }
export type SalaryReference = { payment: SalaryPayment; assetId: string; assetName: string; scope: string; createdAt: string }
export type SalaryPlan = { period: string; netCents: number; contributionsCents?: number; warnings: string[]; stat: { id: string; name: string }; rows: { name: string; amountCents: number; description: string; reference?: SalaryReference }[] }
const months = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie']
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

export function validRomanianIban(iban: string) {
  if (!/^RO\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban)) return false
  const digits = (iban.slice(4) + iban.slice(0,4)).replace(/[A-Z]/g, char => String(char.charCodeAt(0)-55))
  let rest = 0
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97
  return rest === 1
}
const isoDate = (date: string) => /^20\d{2}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date
export function validSalaryPayment(value: unknown): value is SalaryPayment {
  if (!value || typeof value !== 'object') return false
  const p = value as SalaryPayment
  return typeof p.name === 'string' && /^[\p{L}\s.'-]{2,100}$/u.test(p.name) && !!regesIdentity(p.name)
    && typeof p.iban === 'string' && validRomanianIban(p.iban) && typeof p.payerIban === 'string' && validRomanianIban(p.payerIban)
    && typeof p.bank === 'string' && p.bank.length > 0 && p.bank.length <= 150
    && Number.isSafeInteger(p.amountCents) && p.amountCents > 0 && p.amountCents <= 100_000_000 && p.currency === 'RON'
    && typeof p.period === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(p.period)
    && typeof p.processedOn === 'string' && isoDate(p.processedOn) && p.period <= p.processedOn.slice(0,7)
    && typeof p.description === 'string' && p.description.length <= 500 && typeof p.reference === 'string' && /^\d{1,40}$/.test(p.reference) && typeof p.yearInferred === 'boolean'
}

export function salaryPaymentFromText(text: string): SalaryPayment | null {
  const lines = text.replace(/\r/g,'').split('\n').map(line=>line.trim())
  const description = lines.find(line=>/^Descriere\s*\/\s*Description\s+/i.test(line))?.replace(/^Descriere\s*\/\s*Description\s+/i,'') || ''
  const salary = fold(description).match(/^salariu\s+([a-z]+)(?:\s+(20\d{2}))?$/)
  if (!salary) return null
  const beneficiary = lines.findIndex(line=>/^Beneficiar\s*\/\s*Beneficiary$/i.test(line))
  const payer = lines.findIndex(line=>/^Platitor\s*\/\s*Payer$/i.test(fold(line)))
  const detail = lines.findIndex(line=>/^Detalii\s*\/\s*Details$/i.test(line))
  if (payer < 0 || beneficiary <= payer || detail <= beneficiary) throw new Error('Nu am identificat sigur plătitorul și beneficiarul OP-ului.')
  const field = (section: string[], pattern: RegExp) => section.find(line=>pattern.test(line))?.replace(pattern,'').trim() || ''
  const payerLines = lines.slice(payer+1,beneficiary), beneficiaryLines = lines.slice(beneficiary+1,detail)
  const payerName = field(payerLines,/^Nume\s*\/\s*Name\s+/i)
  if (!['ABTEXTILESRL','SCABTEXTILESRL'].includes(regesIdentity(payerName))) throw new Error('Plătitorul din OP nu este AB TEXTILE S.R.L.')
  const date = lines.find(line=>/^Data procesare\s*\/\s*Processing date\s+/i.test(fold(line)))?.match(/(\d{2})\.(\d{2})\.(20\d{2})$/)
  if (!date) throw new Error('Lipsește data procesării OP-ului.')
  const processedOn = `${date[3]}-${date[2]}-${date[1]}`
  const month = months.indexOf(salary[1])+1
  if (!month || !isoDate(processedOn)) throw new Error('Luna salariului sau data procesării este invalidă.')
  const year = salary[2] ? Number(salary[2]) : Number(date[3]) - (month > Number(date[2]) ? 1 : 0)
  const amount = field(lines,/^Suma\s*\/\s*Amount\s+/i).match(/^([\d.,]+)\s+RON$/)
  if (!amount || !lines.some(line=>/^Status\s+efectuata$/i.test(fold(line)))) throw new Error('OP-ul nu confirmă o plată efectuată în RON.')
  const normalizedAmount = /^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(amount[1]) ? amount[1].replace(/,/g,'') : amount[1]
  const payment: SalaryPayment = {
    name: field(beneficiaryLines,/^Nume\s*\/\s*Name\s+/i).toUpperCase(),
    iban: field(beneficiaryLines,/^Cont\s*\/\s*Account\s+/i).replace(/\s/g,'').toUpperCase(),
    payerIban: field(payerLines,/^Cont\s*\/\s*Account\s+/i).replace(/\s/g,'').toUpperCase(),
    bank: field(lines,/^Banca\s*\/\s*Bank\s+/i), amountCents: moneyCents(normalizedAmount), currency: 'RON', period: `${year}-${String(month).padStart(2,'0')}`,
    processedOn, description, reference: field(lines,/^Referin[tț][aă]\s*\/\s*Reference\s+/i), yearInferred: !salary[2],
  }
  if (!validSalaryPayment(payment)) throw new Error('Datele OP-ului sau IBAN-ul nu sunt valide. Verifică documentul original.')
  return payment
}

export function salaryPlanRows(actual: { name: string; netCents: number }[], references: SalaryReference[], period: string) {
  const sorted = references.filter(ref=>validSalaryPayment(ref.payment) && ref.payment.period < period)
    .sort((a,b)=>b.payment.processedOn.localeCompare(a.payment.processedOn)||b.createdAt.localeCompare(a.createdAt))
  const [year,month] = period.split('-').map(Number)
  return actual.map(row=>({name:row.name,amountCents:row.netCents,description:`Salariu ${months[month-1]} ${year}`,reference:sorted.find(ref=>regesIdentity(ref.payment.name)===regesIdentity(row.name))}))
}
