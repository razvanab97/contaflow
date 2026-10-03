'use client'
import { useEffect, useState } from 'react'

interface Toast { id: number; text: string; tone: 'error' | 'info' }

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
    return () => { window.alert = original }
  }, [])

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
