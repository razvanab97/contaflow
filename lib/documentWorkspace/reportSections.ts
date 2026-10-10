export const REPORT_SECTIONS_KEY = 'report_sections'

export interface ReportExtraSection { id: string; title: string; content: string }

export function parseReportSections(value: unknown): ReportExtraSection[] {
  const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value
  if (!Array.isArray(parsed) || parsed.length > 30) throw new Error('Secțiuni invalide (maximum 30).')
  const ids = new Set<string>()
  return parsed.map(section => {
    if (!section || typeof section.id !== 'string' || !section.id || ids.has(section.id)
      || typeof section.title !== 'string' || typeof section.content !== 'string'
      || section.title.length > 300 || section.content.length > 20000) throw new Error('Datele secțiunii sunt invalide.')
    ids.add(section.id)
    return { id: section.id, title: section.title, content: section.content }
  })
}
