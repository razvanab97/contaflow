'use client'
import { useCallback, useEffect, useState } from 'react'

interface Props {
  firmaId: string
  culoare: string
  onSynced?: () => void
}

const ETICHETA = 'Gmail proiect'

export default function SincronizareProiectMail({ firmaId, culoare, onSynced }: Props) {
  const [connected, setConnected] = useState<{ email: string | null; lastSyncAt: string | null } | null | undefined>(undefined)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadSource = useCallback(async () => {
    const res = await fetch(`/api/inbox-facturi/surse?firmaId=${encodeURIComponent(firmaId)}`)
    const data = await res.json().catch(() => ({}))
    const source = (data.sources || []).find((s: { provider: string; eticheta: string; status: string; email: string | null; last_sync_at: string | null }) => s.provider === 'gmail' && s.eticheta === ETICHETA)
    setConnected(source && source.status === 'activ' ? { email: source.email, lastSyncAt: source.last_sync_at } : null)
  }, [firmaId])

  useEffect(() => { loadSource() }, [loadSource])

  function connectGmail() {
    const params = new URLSearchParams({ firmaId, eticheta: ETICHETA, returnTo: window.location.pathname })
    window.location.href = `/api/inbox-facturi/gmail/start?${params.toString()}`
  }

  async function sync() {
    setSyncing(true); setError(''); setMessage('')
    const res = await fetch('/api/proiect-mail/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setSyncing(false); setError(data.error || 'Sincronizarea a eșuat'); return }

    // Recupereaza si achizitiile deja clasificate in sincronizari anterioare (de dinainte sa
    // existe achizitii_sugestii) - fara sa mai bata Gmail sau AI-ul o data in plus, vezi
    // backfill-achizitii/route.ts.
    const backfillRes = await fetch('/api/proiect-mail/backfill-achizitii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId }),
    })
    const backfillData = await backfillRes.json().catch(() => ({}))
    const totalAchizitii = (data.noiSugestiiAchizitii ?? 0) + (backfillData.sugestiiNoi ?? 0)

    setSyncing(false)
    setMessage(`${data.messagesChecked} mailuri verificate, ${data.noiSugestiiObligatii} sugestii obligații + ${totalAchizitii} sugestii achiziții.${data.stoppedEarly ? ' M-am oprit la timp — apasă din nou pentru restul.' : ''}`)
    await loadSource()
    onSynced?.()
  }

  if (connected === undefined) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
      {!connected ? (
        <button onClick={connectGmail} style={{ fontSize: '11px', fontWeight: 700, padding: '7px 12px', borderRadius: '7px', border: 'none', background: culoare, color: '#fff', cursor: 'pointer' }}>
          Conectează Gmail (Prosocial/Orieda)
        </button>
      ) : (
        <>
          <button onClick={sync} disabled={syncing} style={{ fontSize: '11px', fontWeight: 700, padding: '7px 12px', borderRadius: '7px', border: '1px solid rgba(74,222,128,.35)', background: 'rgba(74,222,128,.08)', color: 'var(--accent-green)', cursor: 'pointer', opacity: syncing ? .6 : 1 }}>
            {syncing ? 'Sincronizez...' : 'Sincronizează din email'}
          </button>
          <span style={{ fontSize: '10px', color: 'var(--c-666666)' }}>
            {connected.email}{connected.lastSyncAt ? ` · ultima sincronizare: ${new Date(connected.lastSyncAt).toLocaleString('ro-RO')}` : ''}
          </span>
        </>
      )}
      {message && <span style={{ fontSize: '11px', color: 'var(--accent-green)' }}>{message}</span>}
      {error && <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>{error}</span>}
    </div>
  )
}
