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
        <button onClick={connectGmail} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 12px', borderRadius: 'var(--r-sm)', border: 'none', background:'var(--accent)', color: '#fff', cursor: 'pointer' }}>
          Conectează Gmail (Prosocial/Orieda)
        </button>
      ) : (
        <>
          <button onClick={sync} disabled={syncing} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 12px', borderRadius: 'var(--r-sm)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', opacity: syncing ? .6 : 1 }}>
            {syncing ? 'Sincronizez...' : 'Sincronizează din email'}
          </button>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-666666)' }}>
            {connected.email}{connected.lastSyncAt ? ` · ultima sincronizare: ${new Date(connected.lastSyncAt).toLocaleString('ro-RO')}` : ''}
          </span>
        </>
      )}
      {message && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)' }}>{message}</span>}
      {error && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}
