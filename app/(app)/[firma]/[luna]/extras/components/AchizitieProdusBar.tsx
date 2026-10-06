'use client'
import { useState } from 'react'
import type { Tx } from './types'
import { claseazaAchizitie } from '@/lib/achizitii-produse'
import { regulaAutomata } from '@/lib/tranzactii-reguli'

// Corectia manuala la "Achizitii produse" direct pe plata din Extras de cont. Starea vine din aceeasi
// regula ca in Rezumatul lunii (claseazaAchizitie); ce se alege aici se salveaza pe tranzactie si
// are prioritate fata de clasificarea automata.
export default function AchizitieProdusBar({ tx, onRefresh }: { tx: Tx; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [eroare, setEroare] = useState('')
  // doar plati; schimburile valutare si comisioanele nu pot fi achizitii de produse
  const motiv = regulaAutomata(tx)
  if (tx.tip !== 'debit' || motiv === 'schimb_valutar' || motiv === 'comision') return null

  const cl = claseazaAchizitie(tx)

  async function seteaza(valoare: boolean | null) {
    setBusy(true); setEroare('')
    const res = await fetch('/api/tranzactii/achizitie-produse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: tx.id, valoare }) }).catch(() => null)
    setBusy(false)
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {}
      setEroare(d.error || 'Nu am putut salva')
      return
    }
    onRefresh()
  }

  // exclusa manual dintr-o plata care altfel ar fi automata -> "Revino la automat"; marcata manual -> "Elimina"
  const exclusaManual = tx.achizitie_produse === false
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 28px', borderTop: '1px solid var(--border-subtle)', background: cl ? 'var(--accent-soft)' : 'transparent', fontSize: 'var(--fs-sm)' }}>
      <span className="eyebrow" style={{ color: cl ? 'var(--accent)' : undefined }}>Achiziții produse</span>
      {cl ? (
        <>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cl.furnizor}</span>
          <span className={`badge ${cl.sursa === 'manual' ? 'badge-accent' : ''}`}>{cl.sursa === 'manual' ? 'marcată manual' : 'automat'}</span>
          <button onClick={() => seteaza(false)} disabled={busy} className="btn btn-sm" style={{ color: 'var(--danger)', marginLeft: 'auto' }} title="Elimină din Achiziții produse">Elimină din achiziții produse</button>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-muted)' }}>{exclusaManual ? 'exclusă manual' : 'nu e marcată'}</span>
          {exclusaManual
            ? <button onClick={() => seteaza(null)} disabled={busy} className="btn btn-sm" style={{ marginLeft: 'auto' }} title="Revine la regula automată">Revino la automat</button>
            : <button onClick={() => seteaza(true)} disabled={busy} className="btn btn-sm" style={{ marginLeft: 'auto' }} title="Marchează ca → Achiziție produse">Marchează ca achiziție produse</button>}
        </>
      )}
      {eroare && <span role="alert" style={{ flexBasis: '100%', color: 'var(--danger)', fontSize: 'var(--fs-xs)' }}>{eroare}</span>}
    </div>
  )
}
