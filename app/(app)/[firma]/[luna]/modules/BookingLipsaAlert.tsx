'use client'
import { useEffect, useState } from 'react'

interface Orfana { id: string; numarFactura: string; numeClient: string; suma: number | null; idRezervare: string; dataStart?: string | null; dataSfarsit?: string | null; unde?: string }
const zi = (d?: string | null) => d ? d.split('-').reverse().slice(0, 2).join('.') : ''
const lei = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

// Verificarea completitudinii borderoului Booking: facturi 5StarDesk pentru rezervari Booking (cod
// numeric) cu check-out in perioada lunii, dar fara rezervarea in borderoul Booking incarcat.
export default function BookingLipsaAlert({ lunaId }: { lunaId: string }) {
  const [lipsa, setLipsa] = useState<Orfana[]>([])
  useEffect(() => {
    fetch(`/api/5stardesk/verifica?lunaId=${encodeURIComponent(lunaId)}`).then(r => r.json()).then(d => {
      setLipsa(((d?.facturiFaraRezervare || []) as Orfana[]).filter(f => f.unde === 'lipsa' && /^\d{6,}$/.test(String(f.idRezervare || ''))))
    }).catch(() => {})
  }, [lunaId])
  if (!lipsa.length) return null
  return (
    <div className="card card-pad" style={{ borderColor: 'var(--warning)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--warning)' }}>⚠ Borderoul Booking pare incomplet — {lipsa.length} rezervări lipsă</div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>
        Aceste rezervări au factură 5StarDesk cu check-out în perioada lunii, dar nu apar în borderoul Booking încărcat. Verifică în extranet-ul Booking (Finanțe → Extrase / Plăți) că ai descărcat borderoul pentru toată perioada; dacă rezervarea a fost plătită în altă lună, ignoră.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {lipsa.map(f => (
          <div key={f.id} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: 'var(--fs-sm)', padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-secondary)' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.idRezervare}</span>
            <span style={{ flex: 1, minWidth: '120px' }}>{f.numeClient}</span>
            <span style={{ color: 'var(--text-muted)' }}>{f.numarFactura}{f.dataStart || f.dataSfarsit ? ` · sejur ${zi(f.dataStart)}–${zi(f.dataSfarsit)}` : ''}</span>
            <span className="num" style={{ fontWeight: 600 }}>{lei(f.suma)} RON</span>
          </div>
        ))}
      </div>
    </div>
  )
}
