'use client'
import { useEffect, useRef, useState } from 'react'

export default function TransactionSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setLocal(value) }, [value])

  function handleChange(v: string) {
    setLocal(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => onChange(v), 250)
  }

  return (
    <input
      value={local}
      onChange={e => handleChange(e.target.value)}
      placeholder="Caută după furnizor, sumă, referință..."
      style={{
        width:'100%', fontSize:'13px', padding:'9px 12px', borderRadius:'8px',
        border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-primary)', outline:'none',
      }}
    />
  )
}
