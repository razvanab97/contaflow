'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'

interface Raport { id: string; fisier_nume: string; fisier_marime: number | null; created_at: string; luna: string }
const marime = (b: number | null) => !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
const data = (s: string) => new Date(s).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Rapoartele lunare salvate in platforma, cate unul pe luna raportata: „Raport implementare <Luna> <An>”. Documentul de sus
// (editorul) e cel curent, se inlocuieste la fiecare generare; aici ramane fiecare luna, cu previzualizare si descarcare.
export default function RapoarteSalvate({ firmaId }: { firmaId: string }) {
  const [rapoarte, setRapoarte] = useState<Raport[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const incarca = useCallback(() => {
    fetch(`/api/proiect-documente/rapoarte?firmaId=${encodeURIComponent(firmaId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { if (d?.rapoarte) setRapoarte(d.rapoarte) }).catch(() => {})
  }, [firmaId])

  useEffect(() => {
    incarca()
    // editorul salveaza automat: dupa fiecare salvare reciteste lista (cu o mica intarziere, ca sa nu se repete la fiecare tasta)
    const dupaSalvare = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(incarca, 1500) }
    window.addEventListener('cf:raport-salvat', dupaSalvare)
    return () => { window.removeEventListener('cf:raport-salvat', dupaSalvare); if (timer.current) clearTimeout(timer.current) }
  }, [incarca])

  async function sterge(r: Raport) {
    if (!confirm(`Ștergi „${r.fisier_nume}” din rapoartele salvate?`)) return
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' })
    if (res.ok) incarca(); else alert('Raportul nu a putut fi șters.')
  }

  if (!rapoarte?.length) return null
  return (
    <section className="card card-pad" aria-label="Rapoarte salvate">
      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: 'var(--text-primary)' }}>Rapoarte salvate</div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '2px 0 10px' }}>Câte un raport de implementare pe lună raportată; regenerarea aceleiași luni îl înlocuiește doar pe al ei.</p>
      <div className="module-list">
        {rapoarte.map(r => (
          <div key={r.id} className="module-item" style={{ cursor: 'default' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fisier_nume.replace(/\.[a-z0-9]+$/i, '')}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{[marime(r.fisier_marime), `salvat ${data(r.created_at)}`].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="module-item-actions">
              <button type="button" className="btn btn-sm" onClick={() => deschideDocument(`/api/chitante/document?id=${r.id}`, r.fisier_nume)}>Vezi</button>
              <a className="btn btn-sm btn-ghost" href={`/api/chitante/document?id=${r.id}`}>Descarcă</a>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => sterge(r)} aria-label={`Șterge ${r.fisier_nume}`}>Șterge</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
