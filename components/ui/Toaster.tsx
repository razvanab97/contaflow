'use client'
import { useEffect, useState } from 'react'

interface Toast { id: number; text: string; tone: 'error' | 'info' | 'success' }

// Notificari neblocante in stilul aplicatiei. Codul existent foloseste window.alert() pentru
// feedback (erori de export/upload etc.) - dialogul nativ blocheaza pagina si arata strain de
// restul interfetei. Il redirectionam aici catre un toast; alert() oricum nu intoarce nimic,
// deci fluxurile care il apeleaza continua identic. confirm()/prompt() raman native (decizii).
export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const original = window.alert
    let seq = 0
    window.alert = (message?: unknown) => {
      const text = String(message ?? '')
      const id = ++seq
      const tone: Toast['tone'] = /eroare|nu s-a|eșua|esua|invalid|nu există|lipsă|error/i.test(text) ? 'error' : 'info'
      setToasts(prev => [...prev.slice(-3), { id, text, tone }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), tone === 'error' ? 7000 : 4500)
    }
    // Notificari explicite din aplicatie (ex. "Modul complet") - eveniment "cf:toast" {text, tone}.
    const onToast = (e: Event) => {
      const { text, tone = 'info', confetti } = (e as CustomEvent).detail || {}
      if (!text) return
      const id = ++seq
      setToasts(prev => [...prev.slice(-3), { id, text: String(text), tone }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
      if (confetti) burst()
    }
    window.addEventListener('cf:toast', onToast)
    return () => { window.alert = original; window.removeEventListener('cf:toast', onToast) }
  }, [])

  // Confetti discret (CSS pur, ~1.6s) pentru momente de "gata" - respecta reduced-motion via CSS.
  function burst() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const host = document.createElement('div')
    host.className = 'confetti'
    const colors = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--purple)', 'var(--brand)']
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i')
      p.style.left = `${Math.random() * 100}%`
      p.style.background = colors[i % colors.length]
      p.style.setProperty('--dx', `${(Math.random() - .5) * 240}px`)
      p.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`)
      p.style.animationDelay = `${Math.random() * .35}s`
      p.style.animationDuration = `${1.3 + Math.random() * .8}s`
      host.appendChild(p)
    }
    document.body.appendChild(host)
    setTimeout(() => host.remove(), 2600)
  }

  if (toasts.length === 0) return null
  return (
    <div className="toaster" role="region" aria-label="Notificări">
      {toasts.map(t => (
        <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`toast toast-${t.tone}`}>
          <span className="toast-dot" />
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.text}</span>
          <button className="toast-close" aria-label="Închide notificarea" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  )
}
