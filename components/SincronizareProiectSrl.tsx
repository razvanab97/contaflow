'use client'
import { useEffect, useState } from 'react'

// La deschiderea unei luni din PROIECT AB Textile sau AB Textile SRL, completeaza automat in cealalta parte ce au in
// comun (stat, pontaj, centralizator, extrase, plata contributiilor - vezi lib/proiect-srl-sync.ts). Daca s-a schimbat
// ceva, pagina se reincarca o data (starea proiectului e citita de componente la incarcare) si aratam ce s-a facut.
const CHEIE_MESAJ = 'sincronizare-proiect-srl:mesaj'

export default function SincronizareProiectSrl({ lunaId }: { lunaId: string }) {
  const [linii, setLinii] = useState<string[]>([])

  useEffect(() => {
    try {
      const salvat = sessionStorage.getItem(CHEIE_MESAJ)
      if (salvat) { sessionStorage.removeItem(CHEIE_MESAJ); setLinii(JSON.parse(salvat)) }
    } catch { /* fara sessionStorage: doar nu afisam mesajul de dupa reincarcare */ }
    const cheie = `sincronizare-proiect-srl:${lunaId}`
    try {
      if (Date.now() - Number(sessionStorage.getItem(cheie) || 0) < 60_000) return
      sessionStorage.setItem(cheie, String(Date.now()))
    } catch { /* continuam fara limita de frecventa */ }
    fetch('/api/proiect-srl/sincronizeaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lunaId }) })
      .then(r => r.ok ? r.json() : null)
      .then((d: { copiate?: string[]; platite?: string[]; sarite?: string[] } | null) => {
        const facut = [...(d?.copiate || []), ...(d?.platite || [])]
        if (!facut.length) return
        try { sessionStorage.setItem(CHEIE_MESAJ, JSON.stringify(facut)) } catch { /* mesajul nu se mai arata dupa reincarcare */ }
        window.location.reload()
      })
      .catch(() => {})
  }, [lunaId])

  if (!linii.length) return null
  return (
    <div role="status" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 14px', marginBottom: '16px', background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>
      <div style={{ flex: 1 }}>
        <strong>Completat automat între PROIECT AB Textile și AB Textile SRL</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: '18px', color: 'var(--text-secondary)' }}>{linii.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
      <button onClick={() => setLinii([])} aria-label="Închide" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--fs-md)' }}>×</button>
    </div>
  )
}
