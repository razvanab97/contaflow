'use client'
import { useState } from 'react'

export default function CopyButton({ value, onCopy }: { value: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      onCopy?.()
    } catch {}
  }

  return (
    <button
      onClick={copy}
      title={copied ? 'Copiat' : 'Copiază'}
      aria-label={copied ? 'Copiat' : `Copiază ${value}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '26px', height: '26px', flexShrink: 0,
        background: copied ? 'var(--success-soft)' : 'transparent',
        border: `1px solid ${copied ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'transparent'}`,
        borderRadius: 'var(--r-sm)', cursor: 'pointer',
      }}
    >
      {copied ? (
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
