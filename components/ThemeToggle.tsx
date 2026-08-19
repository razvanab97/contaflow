'use client'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('cf-theme', next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Comută la tema deschisă' : 'Comută la tema întunecată'}
      title={theme === 'dark' ? 'Temă deschisă' : 'Temă întunecată'}
      style={{
        position: 'fixed', bottom: '6px', right: '20px', zIndex: 9999,
        width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--c-161616)', border: '1px solid var(--c-2a2a2a)', borderRadius: '7px',
        color: 'var(--c-999999)', cursor: 'pointer',
      }}
    >
      {theme === 'dark' ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z"/></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      )}
    </button>
  )
}
