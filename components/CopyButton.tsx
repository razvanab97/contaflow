'use client'
import { useEffect, useState } from 'react'

// persistKey: bifa „copiat” ramane si dupa reincarcare (ex. codurile de rezervare deja cautate in Airbnb) -
// tinuta doar in browserul utilizatorului; un nou click copiaza din nou, fara sa stearga bifa.
const PREFIX = 'cf:copiat:'

export default function CopyButton({ value, onCopy, persistKey }: { value: string; onCopy?: () => void; persistKey?: string }) {
  const [copied, setCopied] = useState(false)
  const [tinut, setTinut] = useState(false)

  useEffect(() => {
    if (!persistKey) return
    try { setTinut(localStorage.getItem(PREFIX + persistKey) === '1') } catch {}
  }, [persistKey])

  async function copy() {
    if (!value) return
    // marcajul „deschis” se pastreaza la click, chiar daca browserul refuza accesul la clipboard
    if (persistKey) { setTinut(true); try { localStorage.setItem(PREFIX + persistKey, '1') } catch {} }
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      onCopy?.()
    } catch {}
  }

  const bifat = copied || tinut
  return (
    <button
      onClick={copy}
      title={copied ? 'Copiat' : tinut ? 'Deschis / copiat deja — click pentru a copia din nou' : 'Copiază'}
      aria-label={copied ? 'Copiat' : tinut ? `Copiat deja: ${value}. Copiază din nou` : `Copiază ${value}`}
      aria-pressed={persistKey ? tinut : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '26px', height: '26px', flexShrink: 0,
        background: bifat ? 'var(--success-soft)' : 'transparent',
        border: `1px solid ${bifat ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'transparent'}`,
        borderRadius: 'var(--r-sm)', cursor: 'pointer',
      }}
    >
      {bifat ? (
        <svg width="12" height="12" fill="none" stroke="var(--success)" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="12" height="12" fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}
