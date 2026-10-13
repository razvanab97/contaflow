export const SALARY_PACKAGE = [
  { task: 'stat', label: 'Stat de plată', folder: '01_Stat_plata' },
  { task: 'pontaj', label: 'Pontaj', folder: '02_Pontaj' },
  { task: 'reges', label: 'Extrase REGES', folder: '03_REGES' },
  { task: 'centralizator', label: 'Centralizator contribuții', folder: '04_Centralizator' },
] as const

export function salaryZipEntry(folder: string, name: string, used: Set<string>): string {
  const basename = name.replace(/\\/g, '/').split('/').pop() || 'Document'
  const safe = basename.normalize('NFC').replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '_').replace(/^\.+/, '').trim().slice(0, 180) || 'Document'
  const dot = safe.lastIndexOf('.')
  const stem = dot > 0 ? safe.slice(0, dot) : safe
  const extension = dot > 0 ? safe.slice(dot) : ''
  let candidate = `${folder}/${safe}`
  let suffix = 2
  while (used.has(candidate.toLowerCase())) candidate = `${folder}/${stem} (${suffix++})${extension}`
  used.add(candidate.toLowerCase())
  return candidate
}
