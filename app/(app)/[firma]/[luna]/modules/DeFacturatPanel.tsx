'use client'
import { useCallback, useEffect, useState } from 'react'
import CopyButton from '@/components/CopyButton'
import { workMonthLabel } from '@/lib/accounting-period'
import type { DeFacturat } from '@/lib/stardeskVerify'

const lei = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const zi = (d: string | null) => d ? d.split('-').reverse().slice(0, 2).join('.') : ''

// Lista de lucru saptamanala: ce e de facturat in 5StarDesk ACUM (rezervari cu check-out trecut, fara
// factura client, din orice luna), pe pretul complet - ca sa nu mai apara refacturari la contabil.
export default function DeFacturatPanel({ firmaId }: { firmaId: string }) {
  const [rez, setRez] = useState<DeFacturat[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/5stardesk/de-facturat?firmaId=${encodeURIComponent(firmaId)}`, { cache: 'no-store' }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { setError(d.error || 'Lista nu a putut fi încărcată'); setRez([]); return }
    setRez(d.rezervari || [])
  }, [firmaId])
  useEffect(() => { load() }, [load])

  async function amFacturat(x: DeFacturat) {
    setBusy(x.codRezervare); setError('')
    const res = await Promise.all(x.ids.map(id => fetch('/api/5stardesk/rezolva', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, tip: 'client', rezolvat: true, nota: 'Facturat din lista „De facturat”' }) })))
    setBusy(null)
    if (res.some(r => !r.ok)) { setError('Nu s-a putut marca'); return }
    setRez(prev => (prev || []).filter(y => y.codRezervare !== x.codRezervare))
  }

  if (rez === null) return <div className="skeleton" style={{ height: '80px' }} />
  const total = rez.reduce((s, x) => s + (x.total ?? 0), 0)
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderColor: rez.length ? 'var(--warning)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>
          {rez.length ? `De facturat în 5StarDesk (${rez.length})` : '✓ Nimic de facturat în 5StarDesk'}
        </div>
        {rez.length > 0 && <span className="num" style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-primary)' }}>total {lei(total)} RON</span>}
      </div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>
        Rezervările cu check-out trecut care nu au încă factură client, din toate lunile. Facturează-le pe <b>prețul complet</b> (Airbnb: borderou + comision) — săptămânal, nu la final de lună. După emitere, „✓ Am facturat”; factura încărcată la 5StarDesk le închide oricum automat.
      </p>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>{error}</p>}
      {rez.map(x => (
        <div key={x.codRezervare} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
          <span className="badge">{x.platforma === 'airbnb' ? 'Airbnb' : 'Booking'}</span>
          <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {x.numeOaspete || '—'}
            <span style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 500, color: 'var(--text-muted)' }}>
              {[x.dataStart || x.dataSfarsit ? `sejur ${zi(x.dataStart)}–${zi(x.dataSfarsit)}` : '', x.luna ? `borderou ${workMonthLabel(x.luna)}` : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{x.codRezervare}</span>
            <CopyButton value={x.codRezervare} />
          </span>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {x.comision != null ? <>{lei(x.suma)} + comision {lei(x.comision)} =</> : x.platforma === 'airbnb' ? <span style={{ color: 'var(--warning)' }}>comision necunoscut · borderou {lei(x.suma)}</span> : null}
          </span>
          {x.total != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span className="num" style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-primary)' }}>{lei(x.total)} RON</span>
              <CopyButton value={x.total.toFixed(2)} />
            </span>
          )}
          <button className="btn btn-sm" disabled={busy === x.codRezervare} onClick={() => amFacturat(x)}>{busy === x.codRezervare ? '…' : '✓ Am facturat'}</button>
        </div>
      ))}
    </div>
  )
}
