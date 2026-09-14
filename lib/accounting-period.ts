export const LUNI_FULL = ['', 'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
export const LUNI_SHORT = ['', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function currentWorkMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function previousMonthKey(workMonth: string) {
  const [year, month] = workMonth.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function workMonthLabel(workMonth: string, short = false) {
  const [year, month] = workMonth.split('-')
  const names = short ? LUNI_SHORT : LUNI_FULL
  return `${names[Number(month)] || month} ${year}`
}

export function accountingPeriod(workMonth: string) {
  const accountingMonth = previousMonthKey(workMonth)
  const [year, month] = accountingMonth.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    month: accountingMonth,
    startDay: 1,
    endDay: lastDay,
    monthName: LUNI_FULL[month],
    year,
    workMonth,
    workLabel: workMonthLabel(workMonth),
  }
}

export function accountingPeriodLabel(workMonth: string) {
  const p = accountingPeriod(workMonth)
  return `1-${p.endDay} ${p.monthName} ${p.year}`
}

export function accountingWorkLabel(workMonth: string) {
  return `lucrat în ${workMonthLabel(workMonth)}`
}

export function accountingFullLabel(workMonth: string) {
  return `${accountingPeriodLabel(workMonth)} (${accountingWorkLabel(workMonth)})`
}

export function accountingShortLabel(workMonth: string) {
  const p = accountingPeriod(workMonth)
  const [, workMonthNumber] = workMonth.split('-').map(Number)
  return `1-${p.endDay} ${p.monthName} (${LUNI_FULL[workMonthNumber] || workMonth})`
}
