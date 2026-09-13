interface Props {
  updatedAt: string | null
  fisierNume: string | null
}

// Nu exista inca versionare per-luna pe server (raportul e un singur document, mereu inlocuit,
// nu unul separat per luna) - nu inventam un istoric fals. Aratam doar ce e cu adevarat
// disponibil azi (ultima actualizare a documentului curent) si explicam limitarea onest.
export default function ReportHistory({ updatedAt, fisierNume }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {updatedAt ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-mint)', flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: 'var(--c-dddddd)' }}>{fisierNume || 'Document'}</div>
            <div style={{ fontSize: '11px', color: 'var(--c-666666)', marginTop: '2px' }}>
              Actualizat {new Date(updatedAt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' })} la {new Date(updatedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '12px', color: 'var(--c-666666)' }}>Niciun document generat încă.</p>
      )}
      <p style={{ fontSize: '11px', color: 'var(--c-555555)', lineHeight: 1.5 }}>
        Istoricul complet pe luni (ex. „August 2026 — Finalizat") nu este încă disponibil — raportul e un singur document care se actualizează, nu se păstrează o versiune separată pentru fiecare lună.
      </p>
    </div>
  )
}
