'use client'
import { useState } from 'react'

// „Plătit” pe un reminder din „De făcut” (calendarul plăților recurente): bifează task-ul lunii. Rămâne pe loc cu
// „Anulează” până la următoarea încărcare a paginii, ca o bifă greșită să se poată desface.
export default function MarcheazaPlata({ lunaId, taskKey }: { lunaId: string; taskKey: string }) {
  const [gata, setGata] = useState(false)
  const [lucru, setLucru] = useState(false)
  const [eroare, setEroare] = useState('')

  async function seteaza(completat: boolean) {
    setLucru(true); setEroare('')
    const res = await fetch('/api/tasks/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lunaId, taskKey, completat }) }).catch(() => null)
    setLucru(false)
    if (!res?.ok) { setEroare('Nu s-a putut salva'); return }
    setGata(completat)
  }

  if (gata) {
    return (
      <div className="module-item-actions" role="status">
        <span className="badge badge-success">✓ Plătit</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={lucru} onClick={() => seteaza(false)}>Anulează</button>
      </div>
    )
  }
  return (
    <div className="module-item-actions">
      {eroare && <span role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{eroare}</span>}
      <button type="button" className="btn btn-sm" disabled={lucru} onClick={() => seteaza(true)}>{lucru ? '…' : 'Plătit'}</button>
    </div>
  )
}
