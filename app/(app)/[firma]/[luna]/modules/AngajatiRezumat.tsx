'use client'
import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

interface Angajat { nume: string; salariu: number }
interface Rezumat { angajati: Angajat[]; cas: number | null; cass: number | null; impozit: number | null; totalPlata: number | null }

export interface AngajatiRezumatHandle { reload: () => void }

function fmt(n: number | null) {
  return n == null ? '—' : n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RON'
}

const AngajatiRezumat = forwardRef<AngajatiRezumatHandle, { firmaId: string; lunaId: string; culoare: string }>(
  function AngajatiRezumat({ firmaId, lunaId, culoare }, ref) {
    const [data, setData] = useState<Rezumat | null>(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
      const res = await fetch(`/api/angajati/rezumat?firmaId=${encodeURIComponent(firmaId)}&lunaId=${encodeURIComponent(lunaId)}`)
      const d = await res.json().catch(() => null)
      if (res.ok) setData(d)
      setLoading(false)
    }, [firmaId, lunaId])

    useEffect(() => { load() }, [load])
    useImperativeHandle(ref, () => ({ reload: load }), [load])

    if (loading) return null
    const hasContent = !!data && (data.angajati.length > 0 || data.cas != null || data.cass != null || data.impozit != null || data.totalPlata != null)
    if (!hasContent) return null

    return (
      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '18px 22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '14px' }}>
          Rezumat salarii — citit automat de AI
        </div>

        {data!.angajati.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            {data!.angajati.map((a, i) => (
              <div key={a.nume + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--c-dddddd)' }}>{a.nume}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: culoare }}>{fmt(a.salariu)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            ['CAS Angajați', data!.cas],
            ['CASS Angajați', data!.cass],
            ['Impozit (10.00%)', data!.impozit],
            ['TOTAL DE PLATĂ', data!.totalPlata],
          ].map(([label, val]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: label === 'TOTAL DE PLATĂ' ? '1px solid var(--c-262626)' : 'none', paddingTop: label === 'TOTAL DE PLATĂ' ? '12px' : '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: label === 'TOTAL DE PLATĂ' ? 700 : 500, color: label === 'TOTAL DE PLATĂ' ? 'var(--c-dddddd)' : 'var(--c-888888)' }}>{label}</span>
              <span style={{ fontSize: label === 'TOTAL DE PLATĂ' ? '14px' : '13px', fontWeight: 700, color: label === 'TOTAL DE PLATĂ' ? culoare : 'var(--c-cccccc)' }}>{fmt(val as number | null)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
)

export default AngajatiRezumat
