'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { ModuleDef } from '@/lib/firma-config'
import { legibil, tint } from '@/lib/colors'

interface FirmaInfo { id: string; slug: string; nume: string; culoare: string }
interface Props {
  modules: ModuleDef[]
  firma: FirmaInfo
  luna: string
  slug: string
  lunaId: string
  taskMap: Record<string, boolean>
  restanteCount?: number
  dezactivate?: string[]
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }
function storageKey(slug: string) { return `cf_order_${slug}` }

function loadOrder(slug: string, modules: ModuleDef[]): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(slug)) || 'null') as string[] | null
    if (saved) {
      const valid = saved.filter(s => modules.some(m => m.slug === s))
      const missing = modules.map(m => m.slug).filter(s => !valid.includes(s))
      return [...valid, ...missing]
    }
  } catch {}
  return modules.map(m => m.slug)
}

export default function ModuleGrid({ modules, firma, luna, slug, lunaId, taskMap, restanteCount, dezactivate = [] }: Props) {
  const [reordering, setReordering] = useState(false)
  const [order, setOrder] = useState<string[]>(modules.map(m => m.slug))
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [busyPdf, setBusyPdf] = useState<string | null>(null)
  const [busyToggle, setBusyToggle] = useState<string | null>(null)
  const dragIdx = useRef<number | null>(null)
  const r = rgb(firma.culoare)
  const router = useRouter()

  async function toggleModul(e: React.MouseEvent, modSlug: string, next: boolean) {
    e.preventDefault()
    e.stopPropagation()
    if (busyToggle) return
    setBusyToggle(modSlug)
    await fetch('/api/module/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lunaId, modulSlug: modSlug, dezactivat: next }),
    })
    router.refresh()
    setBusyToggle(null)
  }

  useEffect(() => { setOrder(loadOrder(slug, modules)) }, [slug, modules])

  const sorted = order.map(s => modules.find(m => m.slug === s)).filter(Boolean) as ModuleDef[]

  function persist(newOrder: string[]) {
    setOrder(newOrder)
    localStorage.setItem(storageKey(slug), JSON.stringify(newOrder))
  }

  function onDragStart(idx: number) { dragIdx.current = idx }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) { setDragOver(idx); return }
    const next = [...order]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, moved)
    dragIdx.current = idx
    setDragOver(idx)
    setOrder(next)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragIdx.current = null
    setDragOver(null)
    localStorage.setItem(storageKey(slug), JSON.stringify(order))
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...order]; [next[idx-1], next[idx]] = [next[idx], next[idx-1]]; persist(next)
  }
  function moveDown(idx: number) {
    if (idx === order.length - 1) return
    const next = [...order]; [next[idx], next[idx+1]] = [next[idx+1], next[idx]]; persist(next)
  }

  function resetOrder() { localStorage.removeItem(storageKey(slug)); setOrder(modules.map(m => m.slug)) }

  async function downloadSectionPdf(e: React.MouseEvent, modSlug: string, modLabel: string) {
    e.preventDefault()
    e.stopPropagation()
    if (busyPdf) return
    setBusyPdf(modSlug)
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunaId, title: modLabel, scope: { section: modSlug } }),
      })
      if (res.ok) {
        const b = await res.blob()
        const u = URL.createObjectURL(b)
        const a = document.createElement('a')
        a.href = u
        a.download = `${modLabel.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`
        a.click()
        URL.revokeObjectURL(u)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Nu există documente în această categorie')
      }
    } catch {}
    setBusyPdf(null)
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <span style={{ fontSize:'11px', fontWeight:700, color: reordering ? firma.culoare : 'var(--c-666666)', textTransform:'uppercase', letterSpacing:'.1em', transition:'color .2s' }}>
          {reordering ? 'Trage sau folosește săgețile' : 'Module lunare'}
        </span>
        <div style={{ display:'flex', gap:'6px' }}>
          {reordering && (
            <button onClick={resetOrder} style={{ fontSize:'11px', padding:'5px 11px', borderRadius:'7px', border:'1px solid var(--c-2a2a2a)', background:'transparent', color:'var(--c-777777)', cursor:'pointer' }}>
              Reset ordine
            </button>
          )}
          <button
            onClick={() => setReordering(v => !v)}
            style={{ fontSize:'11px', fontWeight:600, padding:'5px 13px', borderRadius:'7px', border: reordering ? `1px solid ${firma.culoare}` : '1px solid var(--c-2a2a2a)', background: reordering ? tint(r, .1) : 'transparent', color: reordering ? firma.culoare : 'var(--c-888888)', cursor:'pointer', transition:'all .15s' }}
          >
            {reordering ? '✓ Gata' : '⠿ Setează ordinea'}
          </button>
        </div>
      </div>

      {/* REORDER MODE — list */}
      {reordering && (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {sorted.map((mod, idx) => {
            const modTasks = mod.tasks
            const modDone = modTasks.filter(t => taskMap[t.key]).length
            const isComplete = modDone === modTasks.length && modTasks.length > 0
            const isOver = dragOver === idx
            return (
              <div
                key={mod.slug}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
                style={{
                  display:'flex', alignItems:'center', gap:'12px',
                  padding:'12px 16px',
                  background: isOver ? tint(r, .08) : 'var(--c-111111)',
                  border: isOver ? `1px solid ${tint(r, .4)}` : '1px solid var(--c-1e1e1e)',
                  borderRadius:'10px',
                  cursor:'grab',
                  transition:'background .1s, border-color .1s',
                  userSelect:'none',
                }}
              >
                <div style={{ color:'var(--c-444444)', fontSize:'16px', lineHeight:1, flexShrink:0, cursor:'grab' }}>⠿</div>
                <div style={{ width:'20px', fontSize:'11px', fontWeight:700, color:'var(--c-555555)', flexShrink:0, textAlign:'center' }}>
                  {idx + 1}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600, color:'var(--c-e0e0e0)' }}>{mod.label}</div>
                  <div style={{ fontSize:'11px', color:'var(--c-777777)', marginTop:'1px' }}>{mod.description}</div>
                </div>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: isComplete ? 'var(--accent-mint)' : modDone > 0 ? firma.culoare : 'var(--c-2a2a2a)' }}/>
                <div style={{ display:'flex', flexDirection:'column', gap:'2px', flexShrink:0 }}>
                  <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ width:'22px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'1px solid var(--c-2a2a2a)', borderRadius:'4px', cursor: idx===0?'not-allowed':'pointer', color: idx===0?'var(--c-2a2a2a)':'var(--c-888888)', fontSize:'10px' }}>▲</button>
                  <button onClick={() => moveDown(idx)} disabled={idx === sorted.length-1} style={{ width:'22px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'1px solid var(--c-2a2a2a)', borderRadius:'4px', cursor: idx===sorted.length-1?'not-allowed':'pointer', color: idx===sorted.length-1?'var(--c-2a2a2a)':'var(--c-888888)', fontSize:'10px' }}>▼</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* NORMAL MODE — cards grid */}
      {!reordering && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'12px' }}>
          {sorted.map(mod => {
            const modTasks = mod.tasks
            const modDone = modTasks.filter(t => taskMap[t.key]).length
            const modTotal = modTasks.length
            const modPct = modTotal > 0 ? Math.round((modDone/modTotal)*100) : 0
            const isComplete = modDone === modTotal
            const isStarted = modDone > 0
            const isDeactivated = dezactivate.includes(mod.slug)

            const statusLabel = isDeactivated ? 'Dezactivat' : isComplete ? 'Gata' : isStarted ? 'În lucru' : 'Neînceput'
            const statusStyle = isDeactivated
              ? { bg:'var(--c-161616)', c:'var(--c-555555)', border:'var(--c-242424)' }
              : isComplete
              ? { bg:'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', c:'var(--accent-mint)', border:'light-dark(rgba(5,150,105,.27), rgba(110,231,176,.18))' }
              : isStarted
              ? { bg:'light-dark(rgba(180,83,9,.175), rgba(245,201,106,.07))', c:'light-dark(#B45309, #F5C96A)', border:'light-dark(rgba(180,83,9,.27), rgba(245,201,106,.18))' }
              : { bg:'var(--c-161616)', c:'light-dark(#6B7280, var(--c-3a3a3a))', border:'var(--c-222222)' }

            const href = mod.linkDirect
              ? `/${slug}/${luna}/${mod.linkDirect}`
              : `/${slug}/${luna}/${mod.slug}`

            const isBusy = busyPdf === mod.slug
            const isToggling = busyToggle === mod.slug

            return (
              <div
                key={mod.slug}
                onClick={() => router.push(href)}
                style={{
                  background:'var(--c-111111)', border:'1px solid var(--c-1e1e1e)', borderRadius:'14px',
                  padding:'20px 22px', cursor:'pointer', height:'100%',
                  display:'flex', flexDirection:'column', gap:'14px',
                  opacity: isDeactivated ? .5 : 1, transition:'opacity .15s',
                }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
                  <div>
                    <div style={{ fontSize:'14px', fontWeight:600, color:'var(--c-e8e8e8)', letterSpacing:'-0.2px', marginBottom:'3px' }}>{mod.label}</div>
                    <div style={{ fontSize:'12px', color:'var(--c-888888)', lineHeight:1.4 }}>{mod.description}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'5px', flexShrink:0 }}>
                    <span style={{ fontSize:'10px', fontWeight:600, padding:'3px 9px', borderRadius:'20px', background:statusStyle.bg, color:statusStyle.c, border:`1px solid ${statusStyle.border}` }}>
                      {statusLabel}
                    </span>
                    {mod.slug === 'facturi-restante' && !!restanteCount && (
                      <span style={{ fontSize:'10px', fontWeight:700, padding:'3px 9px', borderRadius:'20px', background:'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))', color:'var(--accent-red)', border:'1px solid light-dark(rgba(220,38,38,.45), rgba(248,113,113,.3))' }}>
                        {restanteCount} neachitate
                      </span>
                    )}
                    <button
                      onClick={e => toggleModul(e, mod.slug, !isDeactivated)}
                      disabled={isToggling}
                      title={isDeactivated ? 'Reactivează modulul' : 'Nu am acest modul luna asta'}
                      style={{ fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', border:'1px solid var(--c-2a2a2a)', background:'transparent', color:'var(--c-555555)', cursor: isToggling ? 'wait' : 'pointer', opacity: isToggling ? .5 : 1 }}
                    >
                      {isDeactivated ? '↺ Activează' : '⊘ Nu am' }
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'7px' }}>
                    <span style={{ fontSize:'12px', color:'var(--c-888888)' }}>{modDone}/{modTotal} task-uri</span>
                    <span style={{ fontSize:'12px', fontWeight:600, color: isComplete ? 'var(--accent-mint)' : firma.culoare }}>{modPct}%</span>
                  </div>
                  <div style={{ height:'2px', background:'var(--c-1a1a1a)', borderRadius:'2px' }}>
                    <div style={{ height:'2px', borderRadius:'2px', background: isComplete ? 'var(--accent-mint)' : firma.culoare, width:`${modPct}%` }}/>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                  {modTasks.map(t => (
                    <div key={t.key} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'14px', height:'14px', borderRadius:'4px', flexShrink:0, background: taskMap[t.key] ? tint(r, .15) : 'var(--c-1a1a1a)', border: taskMap[t.key] ? `1px solid ${tint(r, .4)}` : '1px solid var(--c-252525)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {taskMap[t.key] && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={firma.culoare} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{ fontSize:'12px', fontWeight:500, color: taskMap[t.key] ? 'var(--c-777777)' : 'var(--c-aaaaaa)', textDecoration: taskMap[t.key] ? 'line-through' : 'none' }}>{t.label}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop:'auto', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <button
                    onClick={e => downloadSectionPdf(e, mod.slug, mod.label)}
                    disabled={isBusy}
                    style={{
                      fontSize:'11px', fontWeight:600, padding:'5px 11px', borderRadius:'7px',
                      border:`1px solid ${tint(r, .35)}`, background: tint(r, .06),
                      color: legibil(firma.culoare), cursor: isBusy ? 'wait' : 'pointer',
                      opacity: isBusy ? .6 : 1, transition:'opacity .15s',
                    }}
                  >
                    {isBusy ? '...' : '↓ PDF'}
                  </button>
                  <span style={{ fontSize:'12px', fontWeight:600, color:legibil(firma.culoare) }}>Deschide →</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
