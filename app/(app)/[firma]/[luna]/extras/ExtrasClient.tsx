'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import FacturiModule from '../modules/FacturiModule'
import NoteTranzactii from './NoteTranzactii'
import type { TaskItem } from '../modules/TaskSection'
import type { Tx, Extras, Firma } from './components/types'
import { shortReference } from './components/types'
import ExtrasHeader from './components/ExtrasHeader'
import ExtrasStats from './components/ExtrasStats'
import ExtrasImportPanel from './components/ExtrasImportPanel'
import ExtrasWorkspace from './components/ExtrasWorkspace'
import NextStepNav from '../NextStepNav'

const EXTRAS_UNLOCK_CODES: Record<string, string> = {
  'ab-homes-invest': '48867823',
  abxhomes: '51569342',
}

type Filter = 'all'|'lipsa'|'ok'|'na'
type FlowFilter = 'all'|'debit'|'credit'

export default function ExtrasClient({ firma, lunaId, luna, lunaLabel, extrase: initExtrase, slug, facturiTasks, extrasFinalizat: initFinalizat, nextLabel, nextHref }: {
  firma: Firma; lunaId: string; luna: string; lunaLabel: string; extrase: Extras[]; slug: string; facturiTasks: TaskItem[]; extrasFinalizat: boolean
  nextLabel?: string | null; nextHref?: string | null
}) {
  const [pageTab, setPageTab] = useState<'extras'|'facturi'|'note'>('extras')
  const [finalizat, setFinalizat] = useState(initFinalizat)
  const [finalizing, setFinalizing] = useState(false)
  const [txs, setTxs] = useState<Tx[]>([])
  const [extrase, setExtrase] = useState<Extras[]>(initExtrase)
  const [newSlots, setNewSlots] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all')
  const [search, setSearch] = useState('')
  const [activeExtrasId, setActiveExtrasId] = useState(initExtrase[0]?.id || '')
  const [activeTxIndex, setActiveTxIndex] = useState(0)
  const [exportingDocs, setExportingDocs] = useState(false)
  const [exportError, setExportError] = useState('')
  const [noteDraft, setNoteDraft] = useState({ search: '', pickedId: null as string|null, customText: '' })
  const restoredActiveId = useRef<string|null>(null)
  const pendingFocusId = useRef<string|null>(null)
  const restoredScrollTop = useRef(0)
  const currentSidebarScrollTop = useRef(0)
  const restored = useRef(false)
  const positionRestored = useRef(false)
  const c = firma.culoare || '#F27A1A'
  const extrasUnlockCode = EXTRAS_UNLOCK_CODES[firma.slug]
  const workspaceKey = `contaflow:extras-workspace:${lunaId}`

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const eRes = await fetch(`/api/extras/list?lunaId=${lunaId}`)
      if (eRes.ok) {
        const eData = await eRes.json()
        if (Array.isArray(eData) && eData.length) setExtrase(eData)
      }
      const res = await fetch(`/api/tranzactii/list?lunaId=${lunaId}`)
      if (!res.ok) { setError(`Server error ${res.status}`); if (!silent) setLoading(false); return }
      const data = await res.json()
      if (!Array.isArray(data)) { setError('Format invalid'); if (!silent) setLoading(false); return }
      // Pastreaza ordinea extrasului. Daca mutam tranzactiile rezolvate la final,
      // workspace-ul "sare" dupa upload pentru ca lista se reordoneaza sub indexul curent.
      data.sort((a: Tx, b: Tx) => {
        const byDate = new Date(a.data_tranzactie).getTime() - new Date(b.data_tranzactie).getTime()
        if (byDate !== 0) return byDate
        return a.id.localeCompare(b.id)
      })
      setTxs(data)
      if (restoredActiveId.current) {
        const restoredIndex = data.findIndex((tx: Tx) => tx.id === restoredActiveId.current)
        if (restoredIndex >= 0) setActiveTxIndex(restoredIndex)
      }
    } catch(e) {
      setError(String(e))
    }
    if (!silent) setLoading(false)
  }, [lunaId])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(workspaceKey) || '{}')
      if (saved.filter) setFilter(saved.filter)
      if (saved.flowFilter) setFlowFilter(saved.flowFilter)
      if (saved.activeExtrasId) setActiveExtrasId(saved.activeExtrasId)
      restoredActiveId.current = saved.activeTxId || null
      restoredScrollTop.current = Number(saved.sidebarScrollTop) || 0
    } catch {}
    restored.current = true
    load()
  }, [load, workspaceKey])

  const selectedExtras = extrase.find(extras => extras.id === activeExtrasId) || extrase[0]
  const scopedTxs = selectedExtras ? txs.filter(tx => tx.extras_id === selectedExtras.id) : txs
  const searchLower = search.trim().toLowerCase()
  const filtered = scopedTxs.filter(t => {
    const matchesStatus =
      filter === 'lipsa' ? (!t.document_id && t.note !== 'na') :
      filter === 'ok' ? !!t.document_id :
      filter === 'na' ? t.note === 'na' : true
    const matchesFlow = flowFilter === 'all' || t.tip === flowFilter
    const matchesSearch = !searchLower || [
      t.descriere, t.descriere_curatata, t.documente?.furnizor, t.suma?.toFixed(2), shortReference(t.referinta),
    ].some(field => String(field || '').toLowerCase().includes(searchLower))
    return matchesStatus && matchesFlow && matchesSearch
  })
  const counts: Record<Filter, number> = {
    all: scopedTxs.length,
    lipsa: scopedTxs.filter(t => !t.document_id && t.note !== 'na').length,
    ok: scopedTxs.filter(t => !!t.document_id).length,
    na: scopedTxs.filter(t => t.note === 'na').length,
  }
  const flowCounts: Record<FlowFilter, number> = {
    all: scopedTxs.length,
    debit: scopedTxs.filter(t => t.tip === 'debit').length,
    credit: scopedTxs.filter(t => t.tip === 'credit').length,
  }
  const rez = counts.ok + counts.na
  const pct = scopedTxs.length > 0 ? Math.round((rez/scopedTxs.length)*100) : 0
  const overallRez = txs.filter(t => !!t.document_id || t.note === 'na').length
  const overallGata = txs.length > 0 && overallRez === txs.length
  const activeTx = filtered[Math.min(activeTxIndex, Math.max(filtered.length - 1, 0))]

  useEffect(() => {
    if (!restored.current || loading || positionRestored.current) return
    const activeIndex = restoredActiveId.current ? filtered.findIndex(tx => tx.id === restoredActiveId.current) : -1
    if (activeIndex >= 0) setActiveTxIndex(activeIndex)
    restoredActiveId.current = null
    positionRestored.current = true
  }, [filtered, loading])

  useEffect(() => {
    if (!pendingFocusId.current) return
    const nextIndex = filtered.findIndex(tx => tx.id === pendingFocusId.current)
    if (nextIndex >= 0) setActiveTxIndex(nextIndex)
    pendingFocusId.current = null
  }, [filtered])

  useEffect(() => {
    if (extrase.length && !extrase.some(extras => extras.id === activeExtrasId)) {
      setActiveExtrasId(extrase[0].id)
    }
  }, [activeExtrasId, extrase])

  useEffect(() => {
    // Nu salva inainte ca restaurarea initiala din localStorage sa fi fost efectiv consumata -
    // altfel acest efect ruleaza in acelasi commit cu cel de restaurare, cu valori vechi (din
    // randarea de dinainte de restore), si suprascrie exact datele bune pe care restore le-a citit.
    if (!restored.current || loading) return
    localStorage.setItem(workspaceKey, JSON.stringify({
      filter, flowFilter, activeExtrasId:selectedExtras?.id || null, activeTxId: activeTx?.id || null, sidebarScrollTop: currentSidebarScrollTop.current,
    }))
  }, [activeTx?.id, filter, flowFilter, selectedExtras?.id, workspaceKey, loading])

  function setF(f: Filter) { setFilter(f); setActiveTxIndex(0) }
  function setFlow(f: FlowFilter) { setFlowFilter(f); setActiveTxIndex(0) }
  function selectExtras(id: string) { setActiveExtrasId(id); setActiveTxIndex(0) }
  function setSearchValue(v: string) { pendingFocusId.current = activeTx?.id || null; setSearch(v) }
  function handleSidebarScroll(top: number) { currentSidebarScrollTop.current = top }

  async function exportDocuments() {
    setExportingDocs(true)
    setExportError('')
    const res = await fetch('/api/tranzactii/documente-pdf', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ lunaId, extrasId:selectedExtras?.id, extrasLabel:selectedExtras ? `documente_${selectedExtras.valuta}` : undefined, firmaNume:firma.nume, luna })
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${firma.nume}_${luna}_documente_${selectedExtras?.valuta || 'tranzactii'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const data = await res.json().catch(() => ({}))
      setExportError(data.error || 'PDF-ul nu a putut fi generat')
    }
    setExportingDocs(false)
  }

  async function updateNote(id: string, note: string|null) {
    const previous = txs.find(tx => tx.id === id)?.note || null
    setTxs(current => current.map(tx => tx.id === id ? { ...tx, note } : tx))
    try {
      const res = await fetch('/api/tranzactii/note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, note}) })
      if (!res.ok) setTxs(current => current.map(tx => tx.id === id ? { ...tx, note:previous } : tx))
    } catch {
      setTxs(current => current.map(tx => tx.id === id ? { ...tx, note:previous } : tx))
    }
  }
  function markNA(id: string) {
    updateNote(id, 'na')
    if (filter === 'lipsa') {
      setActiveTxIndex(index => Math.min(index, Math.max(filtered.length - 2, 0)))
    } else {
      setActiveTxIndex(index => Math.min(index + 1, Math.max(filtered.length - 1, 0)))
    }
  }
  function clearNA(id: string) {
    updateNote(id, null)
  }

  async function toggleFinalizat(value: boolean) {
    setFinalizing(true)
    const previous = finalizat
    setFinalizat(value)
    try {
      // Daca marcam finalizat, extrasul e evident si incarcat (altfel n-ar exista tranzactii de documentat)
      const taskKeys = value ? ['extras.tranzactii_documentate', 'extras.incarcat'] : ['extras.tranzactii_documentate']
      const results = await Promise.all(taskKeys.map(taskKey =>
        fetch('/api/tasks/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, taskKey, completat:value }) })
      ))
      if (results.some(res => !res.ok)) setFinalizat(previous)
    } catch {
      setFinalizat(previous)
    }
    setFinalizing(false)
  }

  async function updateStatusNote(id: string, statusNote: string|null) {
    const previous = txs.find(tx => tx.id === id)?.status_note || null
    setTxs(current => current.map(tx => tx.id === id ? { ...tx, status_note: statusNote } : tx))
    try {
      const res = await fetch('/api/tranzactii/status-note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, statusNote}) })
      if (!res.ok) setTxs(current => current.map(tx => tx.id === id ? { ...tx, status_note:previous } : tx))
    } catch {
      setTxs(current => current.map(tx => tx.id === id ? { ...tx, status_note:previous } : tx))
    }
  }

  const onUploadSuccess = useCallback((uploadedTxId: string) => {
    const uploadedIndex = filtered.findIndex(tx => tx.id === uploadedTxId)
    const nextIdx = uploadedIndex >= 0 ? uploadedIndex + 1 : activeTxIndex + 1
    const nextTx = filtered[nextIdx]
    if (nextTx && nextTx.id !== uploadedTxId) {
      setActiveTxIndex(nextIdx)
      pendingFocusId.current = nextTx.id
    }
    load(true)
  }, [activeTxIndex, filtered, load])

  return (
    <main style={{ flex:1, minWidth:0, padding:'32px 36px', background:'var(--app-bg)', overflowX:'hidden' }}>
      <ExtrasHeader
        firmaNume={firma.nume} lunaLabel={lunaLabel} culoare={c}
        pageTab={pageTab} onPageTabChange={setPageTab}
        extrase={extrase} activeExtrasId={selectedExtras?.id || ''} onSelectExtras={selectExtras}
        onOpenImport={() => setImportOpen(true)}
      />

      <ExtrasImportPanel
        open={importOpen} onClose={() => setImportOpen(false)}
        extrase={extrase} firmaId={firma.id} lunaId={lunaId} culoare={c}
        onDone={load} unlockCode={extrasUnlockCode}
        newSlots={newSlots} onAddSlot={() => setNewSlots(s => s+1)}
      />

      {pageTab === 'facturi' ? (
        <FacturiModule firma={firma} lunaId={lunaId} tasks={facturiTasks} section="facturi-chitanta"/>
      ) : pageTab === 'note' ? (
        <NoteTranzactii
          txs={txs}
          firmaNume={firma.nume}
          lunaId={lunaId}
          lunaLabel={lunaLabel}
          culoare={c}
          onSetStatusNote={updateStatusNote}
          draft={noteDraft}
          onDraftChange={setNoteDraft}
        />
      ) : (
        <>
          <ExtrasStats
            total={scopedTxs.length} documentate={counts.ok} neasociate={counts.lipsa} ignorate={counts.na} pct={pct}
            finalizat={finalizat} finalizing={finalizing} onToggleFinalizat={toggleFinalizat} overallGata={overallGata}
            onExport={exportDocuments} exportingDocs={exportingDocs} exportError={exportError}
            culoare={c}
          />

          {loading ? (
            <div style={{ textAlign:'center', padding:'60px' }}>
              <div style={{ width:'24px', height:'24px', border:`2px solid ${c}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 12px' }}/>
              <p style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Se încarcă tranzacțiile...</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : error ? (
            <div style={{ padding:'24px', background:'var(--danger-soft)', border:'1px solid var(--danger)', borderRadius:'12px' }}>
              <p style={{ fontSize:'13px', color:'var(--danger)' }}>Eroare: {error}</p>
              <button onClick={()=>load()} style={{ marginTop:'10px', fontSize:'12px', padding:'6px 14px', borderRadius:'7px', border:'none', background:c, color:'var(--c-ffffff)', cursor:'pointer' }}>Reîncearcă</button>
            </div>
          ) : scopedTxs.length === 0 ? (
            <div style={{ padding:'40px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', textAlign:'center' }}>
              <p style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Importă un extras ca să vezi tranzacțiile aici.</p>
            </div>
          ) : (
            <ExtrasWorkspace
              txs={filtered} activeTxIndex={activeTxIndex} setActiveTxIndex={setActiveTxIndex}
              firmaId={firma.id} lunaId={lunaId} culoare={c}
              onNA={markNA} onClearNA={clearNA} onUploadSuccess={onUploadSuccess} onRefresh={()=>load(true)}
              search={search} onSearchChange={setSearchValue}
              filter={filter} flowFilter={flowFilter} counts={counts} flowCounts={flowCounts}
              onFilterChange={setF} onFlowFilterChange={setFlow}
              onSidebarScroll={handleSidebarScroll} initialSidebarScrollTop={restoredScrollTop.current}
            />
          )}
        </>
      )}

      <NextStepNav slug={slug} luna={luna} nextLabel={nextLabel || null} nextHref={nextHref || null} />
    </main>
  )
}
