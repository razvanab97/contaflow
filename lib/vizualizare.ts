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
