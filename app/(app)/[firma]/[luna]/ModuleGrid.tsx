'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ModuleDef } from '@/lib/firma-config'
import Icon, { MODULE_ICONS } from '@/components/ui/Icon'

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
      <div className="section-title">
        <h2 style={{ color: reordering ? 'var(--accent)' : undefined }}>
          {reordering ? 'Trage rândurile sau folosește săgețile' : 'Module lunare'}
        </h2>
        <div style={{ display:'flex', gap:'6px' }}>
          {reordering && (
            <button onClick={resetOrder} className="btn btn-sm btn-ghost">
              Reset ordine
            </button>
          )}
          <button
            onClick={() => setReordering(v => !v)}
            className={`btn btn-sm${reordering ? ' btn-primary' : ''}`}
            aria-pressed={reordering}
          >
            {reordering ? <><Icon name="check" size={14} /> Gata</> : <><Icon name="grip" size={14} /> Setează ordinea</>}
          </button>
        </div>
      </div>

      {/* REORDER MODE — list */}
      {reordering && (
        <div className="module-list">
          {sorted.map((mod, idx) => {
            const modTasks = mod.tasks
            const modDone = modTasks.filter(t => taskMap[t.key]).length
            const isComplete = modDone === modTasks.length && modTasks.length > 0
            const isOver = dragOver === idx
            return (
              <div
                key={mod.slug}
                className="module-item"
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
                style={{
                  cursor:'grab', userSelect:'none', flexWrap:'nowrap',
                  ...(isOver ? { background: 'var(--accent-soft)', boxShadow: 'inset 0 0 0 1px var(--accent)' } : {}),
                }}
              >
                <span style={{ color:'var(--text-muted)', display:'inline-flex', flexShrink:0 }}><Icon name="grip" /></span>
                <span style={{ width:'20px', fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-muted)', flexShrink:0, textAlign:'center' }}>
                  {idx + 1}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'var(--fs-base)', fontWeight:600, color:'var(--text-primary)' }}>{mod.label}</div>
                  <div style={{ fontSize:'var(--fs-sm)', color:'var(--text-secondary)', marginTop:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mod.description}</div>
                </div>
                <span className="dot" style={{ background: isComplete ? 'var(--success)' : modDone > 0 ? 'var(--warning)' : 'var(--border-strong)' }}/>
                <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
                  <button onClick={() => moveUp(idx)} disabled={idx === 0} aria-label={`Mută ${mod.label} mai sus`} className="btn btn-sm btn-icon" style={{ opacity: idx===0 ? .4 : 1 }}><Icon name="chevronLeft" size={14} style={{ transform:'rotate(90deg)' }} /></button>
                  <button onClick={() => moveDown(idx)} disabled={idx === sorted.length-1} aria-label={`Mută ${mod.label} mai jos`} className="btn btn-sm btn-icon" style={{ opacity: idx===sorted.length-1 ? .4 : 1 }}><Icon name="chevronRight" size={14} style={{ transform:'rotate(90deg)' }} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* NORMAL MODE — lista compacta */}
      {!reordering && (
        <div className="module-list">
          {sorted.map(mod => {
            const modTasks = mod.tasks
            const modDone = modTasks.filter(t => taskMap[t.key]).length
            const modTotal = modTasks.length
            const modPct = modTotal > 0 ? Math.round((modDone/modTotal)*100) : 0
            const isComplete = modDone === modTotal
            const isStarted = modDone > 0
            const isDeactivated = dezactivate.includes(mod.slug)

            const statusLabel = isDeactivated ? 'Dezactivat' : isComplete ? 'Gata' : isStarted ? 'În lucru' : 'Neînceput'
            const statusClass = isDeactivated ? 'badge' : isComplete ? 'badge badge-success' : isStarted ? 'badge badge-warning' : 'badge'
            const iconTone = isDeactivated
              ? { bg: 'var(--surface-secondary)', c: 'var(--text-muted)' }
              : isComplete ? { bg: 'var(--success-soft)', c: 'var(--success)' }
              : isStarted ? { bg: 'var(--warning-soft)', c: 'var(--warning)' }
              : { bg: 'var(--surface-secondary)', c: 'var(--text-secondary)' }

            const href = mod.linkDirect
              ? `/${slug}/${luna}/${mod.linkDirect}`
              : `/${slug}/${luna}/${mod.slug}`

            const isBusy = busyPdf === mod.slug
            const isToggling = busyToggle === mod.slug

            return (
              <div
                key={mod.slug}
                className={`module-item${isDeactivated ? ' is-off' : ''}`}
                onClick={() => router.push(href)}
              >
                <div style={{ width:'34px', height:'34px', borderRadius:'var(--r-md)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: iconTone.bg, color: iconTone.c }}>
                  {isComplete && !isDeactivated ? <Icon name="check" strokeWidth={2.25} /> : <Icon name={MODULE_ICONS[mod.slug] || 'fileText'} />}
                </div>

                <div style={{ flex:'1 1 260px', minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                    <Link href={href} onClick={e => e.stopPropagation()} style={{ fontSize:'var(--fs-base)', fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                      {mod.label}
                    </Link>
                    <span className={statusClass}>{statusLabel}</span>
                    {mod.slug === 'facturi-restante' && !!restanteCount && (
                      <span className="badge badge-danger">{restanteCount} neachitate</span>
                    )}
                    {modTotal > 0 && (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>
                        <span className={`progress${isComplete ? ' is-done' : ''}`} style={{ display:'inline-block', width:'40px', height:'3px' }}><span style={{ width:`${modPct}%` }}/></span>
                        {modDone}/{modTotal}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:'var(--fs-sm)', color:'var(--text-secondary)', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mod.description}</div>
                  {modTotal > 0 && (
                    <div className="task-chips">
                      {modTasks.map(t => (
                        <span key={t.key} className={`task-chip${taskMap[t.key] ? ' is-done' : ''}`}>
                          {taskMap[t.key] ? (
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink:0 }} aria-label="bifat"><path d="M2 6l3 3 5-5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          ) : (
                            <span style={{ width:'9px', height:'9px', borderRadius:'50%', border:'1.5px solid var(--border-strong)', flexShrink:0 }}/>
                          )}
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="module-item-actions">
                  <button
                    onClick={e => toggleModul(e, mod.slug, !isDeactivated)}
                    disabled={isToggling}
                    title={isDeactivated ? 'Reactivează modulul' : 'Nu am acest modul luna asta'}
                    className={`btn btn-sm btn-ghost${isDeactivated ? '' : ' reveal-on-hover'}`}
                    style={{ cursor: isToggling ? 'wait' : undefined, opacity: isToggling ? .5 : undefined }}
                  >
                    {isDeactivated ? <><Icon name="undo" size={14} /> Activează</> : <><Icon name="ban" size={14} /> Nu am</>}
                  </button>
                  <button
                    onClick={e => downloadSectionPdf(e, mod.slug, mod.label)}
                    disabled={isBusy}
                    title={`Descarcă PDF cu documentele din ${mod.label}`}
                    className="btn btn-sm"
                    style={{ cursor: isBusy ? 'wait' : undefined, opacity: isBusy ? .6 : 1 }}
                  >
                    <Icon name="download" size={14} /> {isBusy ? '…' : 'PDF'}
                  </button>
                  <Link
                    href={href}
                    onClick={e => e.stopPropagation()}
                    className="btn btn-sm btn-ghost grow-mobile"
                    style={{ color: 'var(--accent)' }}
                  >
                    Deschide <Icon name="chevronRight" size={14} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
