'use client'
import { useState } from 'react'

export default function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <button
      onClick={copy}
      title="Copiază"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '26px', height: '26px', flexShrink: 0,
        background: copied ? 'rgba(34,197,94,.15)' : '#161616',
        border: `1px solid ${copied ? 'rgba(34,197,94,.4)' : '#262626'}`,
        borderRadius: '6px', cursor: 'pointer', transition: 'all .15s',
      }}
    >
      {copied ? (
        <svg width="12" height="12" fill="none" stroke="#22C55E" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="12" height="12" fill="none" stroke="#999" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}
