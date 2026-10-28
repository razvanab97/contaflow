'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Icon from '@/components/ui/Icon'
import css from './ProiectPopup.module.css'

// „Plan & AI proiect” (Intreaba proiectul, Memoria, Plan si obligatii, Indicatori) ca fereastra pop-up peste orice pagina.
// Sta in shell-ul persistent, deci ramane deschisa (si cu conversatia ei) cand navighezi intre pagini; nu blocheaza pagina de
// dedesubt, ca sa poti lucra pe ea cu fereastra deschisa. Se deschide cu evenimentul `cf:proiect-popup`, din antet, din meniul
// lateral, de pe pagina modulului sau cu Alt+P. Continutul se incarca la prima deschidere si ramane montat dupa inchidere.
const PlanProiectModule = dynamic(() => import('@/app/(app)/[firma]/[luna]/modules/PlanProiectModule'), {
  ssr: false,
  loading: () => <div className={css.loading}><span className="spinner" /> Se încarcă…</div>,
})

const CHEIE_STARE = 'cf-proiect-popup'   // sessionStorage: deschis / minimizat (ramane si dupa reincarcare)
const CHEIE_LAT = 'cf-proiect-popup-lat' // localStorage: fereastra lata

export interface FirmaProiect { id: string; slug: string; nume: string; culoare: string }

export default function ProiectPopup({ firma, open, minimizat, onClose, onMinimizat, luna }: {
  firma: FirmaProiect; open: boolean; minimizat: boolean; onClose: () => void; onMinimizat: (v: boolean) => void; luna: string
}) {
  const [montat, setMontat] = useState(false)
  const [lat, setLat] = useState(false)
  useEffect(() => { if (open) setMontat(true) }, [open])
  useEffect(() => { try { setLat(localStorage.getItem(CHEIE_LAT) === '1') } catch { /* fara localStorage: dimensiunea implicita */ } }, [])
  const comuta = () => setLat(v => { try { localStorage.setItem(CHEIE_LAT, v ? '0' : '1') } catch { /* nu se salveaza */ } return !v })

  if (!montat) return null
  return (
    <div className={`${css.win}${lat ? ` ${css.wide}` : ''}${minimizat ? ` ${css.min}` : ''}`} hidden={!open} role="dialog" aria-label="Plan și AI proiect" aria-modal="false"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className={css.bar}>
        <div className={css.title}>
          <span className="dot" style={{ background: firma.culoare }} />
          Plan &amp; AI proiect <small>{firma.nume.replace(' SRL', '')}</small>
        </div>
        <Link href={`/${firma.slug}/${luna}/plan-proiect`} className={css.ico} title="Deschide ca pagină întreagă" aria-label="Deschide ca pagină întreagă"><span aria-hidden>↗</span></Link>
        <button type="button" className={`${css.ico} ${css.wideBtn}`} onClick={comuta} title={lat ? 'Fereastră mai îngustă' : 'Fereastră mai lată'} aria-label={lat ? 'Fereastră mai îngustă' : 'Fereastră mai lată'}>{lat ? '⤡' : '⤢'}</button>
        <button type="button" className={css.ico} onClick={() => onMinimizat(!minimizat)} title={minimizat ? 'Extinde' : 'Minimizează'} aria-label={minimizat ? 'Extinde' : 'Minimizează'}>{minimizat ? '▴' : '▾'}</button>
        <button type="button" className={css.ico} onClick={onClose} title="Închide (Esc, Alt+P)" aria-label="Închide"><Icon name="close" size={15} /></button>
      </div>
      <div className={css.body}><PlanProiectModule firma={firma} inPopup /></div>
    </div>
  )
}

export { CHEIE_STARE }
