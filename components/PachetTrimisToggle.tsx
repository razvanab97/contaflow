'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Bifa manuala "pachetul lunii a fost trimis contabilului" (task_stari, cheia sistem.pachet_trimis) -
// singurul pas din sistemul de lucru care nu se poate deduce din date.
export default function PachetTrimisToggle({ lunaId, trimis }: { lunaId: string; trimis: boolean }) {
  const [on, setOn] = useState(trimis)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  async function comuta() {
    setBusy(true)
    const res = await fetch('/api/tasks/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lunaId, taskKey: 'sistem.pachet_trimis', completat: !on }) }).catch(() => null)
    setBusy(false)
    if (res?.ok) { setOn(!on); router.refresh() }
  }
  return (
    <button type="button" onClick={comuta} disabled={busy} className={on ? 'badge badge-success' : 'badge'} style={{ cursor: busy ? 'wait' : 'pointer', border: 'none' }} title={on ? 'Marcat trimis — click ca să anulezi' : 'Marchează pachetul ca trimis'}>
      {busy ? '…' : on ? '✓ trimis' : 'marchează trimis'}
    </button>
  )
}
