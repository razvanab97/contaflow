// Deschide orice document in vizualizatorul pop-up global (components/ui/DocViewer.tsx).
// `url` = ruta de descarcare a aplicatiei (ex. /api/chitante/document?id=...).
export function deschideDocument(url: string, nume?: string | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('cf:vezi', { detail: { url, nume: nume || null } }))
}

type Link = { url: string; nume: string; tip: string; la: number }
const cache = new Map<string, Promise<Link | null>>()

// Link semnat direct catre storage (pastrat 50 de minute) - incarcarea nu mai trece prin server.
export function linkDocument(url: string): Promise<Link | null> {
  const c = cache.get(url)
  if (c) return c
  const p = fetch(`/api/document-url?u=${encodeURIComponent(url)}`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d?.url ? { url: d.url, nume: d.nume, tip: d.tip, la: Date.now() } : null))
    .catch(() => null)
  cache.set(url, p)
  setTimeout(() => cache.delete(url), 50 * 60_000)
  return p
}

// Rutele de descarcare pe care vizualizatorul pop-up stie sa le deschida (aceleasi ca in /api/document-url): un link catre
// ele, din orice loc (ex. raspunsurile asistentului AI), se deschide in pop-up in loc sa descarce fisierul.
const CAI_VIZUALIZABILE = new Set([
  '/api/chitante/document', '/api/tranzactii/document', '/api/checklist/docs', '/api/emag', '/api/documente-generale',
  '/api/bonuri/download', '/api/facturi-asteptate/download', '/api/model-documente/download', '/api/inbox-facturi/global/document',
  '/api/proiect-documente/download', '/api/extras/pdf-download', '/api/firma-date/download',
])
export function esteDocumentVizualizabil(url: string): boolean {
  try { return CAI_VIZUALIZABILE.has(new URL(url, 'http://local').pathname) } catch { return false }
}
