'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ModuleDef } from '@/lib/firma-config'

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
        body: JSON.stringify({ lunaId, title: modLabel, scope: { section: modSlug }, firmaNume: firma.nume, lunaLabel: luna }),
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
        <span style={{ fontSize:'12px', fontWeight:700, color: reordering ? 'var(--accent)' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.08em', transition:'color .15s' }}>
          {reordering ? 'Trage sau folosește săgețile' : 'Module lunare'}
        </span>
        <div style={{ display:'flex', gap:'6px' }}>
          {reordering && (
            <button onClick={resetOrder} style={{ fontSize:'12.5px', fontWeight:550, padding:'5px 11px', borderRadius:'7px', border:'1px solid var(--border-strong)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer' }}>
              Reset ordine
            </button>
          )}
          <button
            onClick={() => setReordering(v => !v)}
            style={{ fontSize:'12.5px', fontWeight:600, padding:'5px 13px', borderRadius:'7px', border: reordering ? '1px solid var(--accent)' : '1px solid var(--border-strong)', background: reordering ? 'var(--accent-soft)' : 'transparent', color: reordering ? 'var(--accent)' : 'var(--text-secondary)', cursor:'pointer', transition:'all .15s' }}
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
                className={isOver ? '' : 'module-row'}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
                style={{
                  display:'flex', alignItems:'center', gap:'12px',
                  padding:'12px 16px',
                  ...(isOver ? { background: 'var(--accent-soft)', border: '1px solid var(--accent)' } : {}),
                  borderRadius:'10px',
                  cursor:'grab',
                  transition:'background .1s, border-color .1s',
                  userSelect:'none',
                }}
              >
                <div style={{ color:'var(--text-muted)', fontSize:'16px', lineHeight:1, flexShrink:0, cursor:'grab' }}>⠿</div>
                <div style={{ width:'20px', fontSize:'11.5px', fontWeight:700, color:'var(--text-muted)', flexShrink:0, textAlign:'center' }}>
                  {idx + 1}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)' }}>{mod.label}</div>
                  <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginTop:'1px' }}>{mod.description}</div>
                </div>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: isComplete ? 'var(--success)' : modDone > 0 ? 'var(--warning)' : 'var(--border-strong)' }}/>
                <div style={{ display:'flex', flexDirection:'column', gap:'2px', flexShrink:0 }}>
                  <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ width:'22px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'1px solid var(--border-strong)', borderRadius:'4px', cursor: idx===0?'not-allowed':'pointer', color: idx===0?'var(--border-strong)':'var(--text-secondary)', fontSize:'10px' }}>▲</button>
                  <button onClick={() => moveDown(idx)} disabled={idx === sorted.length-1} style={{ width:'22px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', border:'1px solid var(--border-strong)', borderRadius:'4px', cursor: idx===sorted.length-1?'not-allowed':'pointer', color: idx===sorted.length-1?'var(--border-strong)':'var(--text-secondary)', fontSize:'10px' }}>▼</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* NORMAL MODE — compact rows */}
      {!reordering && (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
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
              ? { bg:'var(--surface-secondary)', c:'var(--text-muted)', border:'var(--border)' }
              : isComplete
              ? { bg:'var(--success-soft)', c:'var(--success)', border:'color-mix(in srgb, var(--success) 40%, transparent)' }
              : isStarted
              ? { bg:'var(--warning-soft)', c:'var(--warning)', border:'color-mix(in srgb, var(--warning) 40%, transparent)' }
              : { bg:'var(--surface-secondary)', c:'var(--text-muted)', border:'var(--border)' }

            const href = mod.linkDirect
              ? `/${slug}/${luna}/${mod.linkDirect}`
              : `/${slug}/${luna}/${mod.slug}`

            const isBusy = busyPdf === mod.slug
            const isToggling = busyToggle === mod.slug

            return (
              <div
                key={mod.slug}
                className="module-row"
                onClick={() => router.push(href)}
                style={{
                  borderRadius:'12px',
                  padding:'12px 16px', cursor:'pointer',
                  display:'flex', flexDirection:'column', gap:'8px',
                  opacity: isDeactivated ? .5 : 1,
                }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ width:'6px', height:'6px', borderRadius:'50%', flexShrink:0, background: isComplete ? 'var(--success)' : isStarted ? 'var(--warning)' : 'var(--border-strong)' }}/>
                  <span style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.1px', flexShrink:0 }}>{mod.label}</span>
                  <span style={{ fontSize:'13px', fontWeight:450, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{mod.description}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
                    <span style={{ fontSize:'11.5px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', background:statusStyle.bg, color:statusStyle.c, border:`1px solid ${statusStyle.border}` }}>
                      {statusLabel}
                    </span>
                    {mod.slug === 'facturi-restante' && !!restanteCount && (
                      <span style={{ fontSize:'11.5px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', background:'var(--danger-soft)', color:'var(--danger)', border:'1px solid color-mix(in srgb, var(--danger) 40%, transparent)' }}>
                        {restanteCount} neachitate
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
                  {modTotal > 0 && (
                    <>
                      <span style={{ fontSize:'11.5px', fontWeight:500, color:'var(--text-muted)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{modDone}/{modTotal}</span>
                      <div style={{ width:'44px', height:'3px', background:'var(--border)', borderRadius:'2px', flexShrink:0 }}>
                        <div style={{ height:'3px', borderRadius:'2px', background: isComplete ? 'var(--success)' : 'var(--accent)', width:`${modPct}%` }}/>
                      </div>
                      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                        {modTasks.map(t => (
                          <div key={t.key} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                            {taskMap[t.key] ? (
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink:0 }}><path d="M2 6l3 3 5-5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            ) : (
                              <div style={{ width:'9px', height:'9px', borderRadius:'50%', border:'1.5px solid var(--border-strong)', flexShrink:0 }}/>
                            )}
                            <span style={{ fontSize:'12px', fontWeight:500, color: taskMap[t.key] ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: taskMap[t.key] ? 'line-through' : 'none' }}>
                              {t.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginLeft:'auto', flexShrink:0 }}>
                    <button
                      onClick={e => toggleModul(e, mod.slug, !isDeactivated)}
                      disabled={isToggling}
                      title={isDeactivated ? 'Reactivează modulul' : 'Nu am acest modul luna asta'}
                      style={{ fontSize:'11.5px', fontWeight:550, padding:'3px 9px', borderRadius:'20px', border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', cursor: isToggling ? 'wait' : 'pointer', opacity: isToggling ? .5 : 1 }}
                    >
                      {isDeactivated ? '↺ Activează' : '⊘ Nu am' }
                    </button>
                    <button
                      onClick={e => downloadSectionPdf(e, mod.slug, mod.label)}
                      disabled={isBusy}
                      style={{
                        fontSize:'12.5px', fontWeight:600, padding:'4px 10px', borderRadius:'7px',
                        border:'1px solid var(--border-strong)', background: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)', cursor: isBusy ? 'wait' : 'pointer',
                        opacity: isBusy ? .6 : 1,
                      }}
                    >
                      {isBusy ? '...' : '↓ PDF'}
                    </button>
                    <Link
                      href={href}
                      onClick={e => e.stopPropagation()}
                      className="link-accent"
                      style={{ fontSize:'12.5px', fontWeight:600, color:'var(--accent)', whiteSpace:'nowrap' }}
                    >
                      Deschide →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
