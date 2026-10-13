export type RegesReportType = 'salariat' | 'salariati_angajator' | 'contract' | 'contracte_angajator'
export type RegesReport = { type: RegesReportType; subject: string; issuedOn?: string; employerCui?: string }
export const REGES_LABELS: Record<RegesReportType, string> = {
  salariat: 'Extras REGES salariat',
  salariati_angajator: 'Extras REGES salariați angajator',
  contract: 'Extras REGES contract',
  contracte_angajator: 'Extras REGES contracte angajator',
}
export const REGES_HISTORICAL_EMPLOYEES = ['ABUNEI ELENA', 'ABUNEI ANDREI-RAZVAN', 'NICORICI MIHAELA', 'VASILACHE FLORENTINA']
export const regesIdentity = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function regesReportFromText(text: string): RegesReport | null {
  const clean = text.replace(/\r/g, '').normalize('NFC')
  const folded = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const type: RegesReportType | null = /extras\s+contracte\s+angajator/.test(folded) ? 'contracte_angajator'
    : /extras\s+salariati\s+angajator/.test(folded) ? 'salariati_angajator'
    : /extras\s+contract\s+din\s+registrul/.test(folded) ? 'contract'
    : /extras\s+salariat\s+din\s+registrul/.test(folded) ? 'salariat' : null
  if (!type) return null
  const individual = type === 'salariat' || type === 'contract'
  const raw = individual ? clean.match(/\bSalariat:\s*([^\n]+)/i)?.[1]
    : clean.match(/\bAngajator:\s*(.+?)\s+identificat\s+prin\s+CUI\/CIF/i)?.[1]
  const subject = raw?.replace(/\s+/g, ' ').trim()
  // Never derive a filename from identifiers, contact details or uncertain text.
  if (!subject || subject.length > 100 || /\d{5,}|@|CNP|identificat/i.test(subject) || (individual && /\d/.test(subject))) return null
  const date = clean.match(/Generat azi\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]
    || clean.match(/La data:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1]
    || clean.match(/(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}/)?.[1]
  let issuedOn: string | undefined
  if (date) {
    const [day, month, year] = date.split('.')
    const iso = `${year}-${month}-${day}`
    const parsed = new Date(`${iso}T00:00:00Z`)
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso) issuedOn = iso
  }
  const employerCui = clean.match(/identificat\s+prin\s+CUI\/CIF\s+(\d{2,10})/i)?.[1]
  return { type, subject, ...(issuedOn ? { issuedOn } : {}), ...(employerCui ? { employerCui } : {}) }
}

export function regesFilename(report: RegesReport): string {
  const subject = report.subject.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${REGES_LABELS[report.type]} - ${subject}${report.issuedOn ? ` - ${report.issuedOn}` : ''}.pdf`
}
