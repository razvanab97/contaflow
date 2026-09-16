'use client'
import { useEffect, useRef, useState } from 'react'

interface Bon {
  id: string; fisier_nume: string; fisier_tip: string | null
  tip: 'combustibil' | 'altul'
  comerciant: string | null; cui_client: string | null; suma: number | null; data_bon: string | null
  status: 'asteptare' | 'asociata'; tranzactie_id: string | null; created_at: string
}

const hiddenInputStyle: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }

function isPreviewable(tip: string | null, nume: string) {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}
function fmtData(s: string | null) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}.${m}.${y}` : s
}
function norm(v: string | null | undefined) {
  return String(v || '').replace(/^RO/i, '').replace(/\D/g, '')
}
function fmtRon(n: number) {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function lunaLabel(s: string) {
  const [y, m] = s.split('-')
  const LUNI = ['', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${LUNI[+m] || m} ${y}`
}
function editDistanceMax1(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  // Doar cazul simplu, suficient pentru CUI-uri (siruri scurte de cifre): o cifra lipsa/in plus/gresita.
  if (a.length === b.length) {
    let diff = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++
    return diff <= 1
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  for (let skip = 0; skip < long.length; skip++) {
    if (long.slice(0, skip) + long.slice(skip + 1) === short) return true
  }
  return false
}
// Cand CUI-ul citit de pe bon nu se potriveste exact cu nicio firma, dar difera de una singura
// printr-o cifra (citire OCR gresita, foarte frecventa) - propune acea firma preselectata in
// dropdown-ul de mutare, ca sa nu mai trebuiasca cautata manual din lista. Doar un indiciu, nu
// muta nimic automat - tot trebuie confirmat cu un click pe "Mută".
function bestGuessFirma(cuiClient: string | null, firmaCurentaId: string, firme: { id: string; nume: string; cui?: string | null }[]) {
  const target = norm(cuiClient)
  if (target.length < 6) return null
  const candidati = firme.filter(f => f.id !== firmaCurentaId && f.cui && norm(f.cui).length >= 6)
  const exact = candidati.find(f => norm(f.cui) === target)
  if (exact) return exact.id
  const apropiat = candidati.find(f => editDistanceMax1(norm(f.cui), target))
  return apropiat ? apropiat.id : null
}

export default function BonuriClient({ firmaId, firmaCui, firmaNume, firme }: { firmaId: string; firmaCui?: string | null; firmaNume: string; firme: { id: string; nume: string; cui?: string | null }[] }) {
  const [bonuri, setBonuri] = useState<Bon[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const [notices, setNotices] = useState<string[]>([])
  const [movePick, setMovePick] = useState<Record<string, string>>({})
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  function load() {
    fetch(`/api/bonuri?firmaId=${encodeURIComponent(firmaId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); setLoading(false); return }
        setLoadError('')
        setBonuri(data.bonuri || [])
        setLoading(false)
      }).catch(() => { setLoadError('Eroare la încărcare'); setLoading(false) })
  }

  useEffect(() => { load() }, [firmaId])

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    return () => { stream?.getTracks().forEach(t => t.stop()) }
  }, [stream])

// Identifica dreptunghiul (dreptunghiurile) bonurilor din poza (Claude vision) si le decupeaza pe
  // client (canvas) - elimina fundalul/masa/mana din jur, pastreaza doar bonul, inainte de citirea
  // datelor. O poza poate contine mai multe bonuri alaturate (ex. mai multe fotografiate impreuna
  // la final de luna) - in acel caz intoarce cate un fisier separat pentru fiecare, ca fiecare sa
  // devina propriul lui bon la incarcare. Daca nu se detecteaza niciun bon (sau fisierul nu e
  // imagine), fisierul original ramane neschimbat, intr-o lista de un singur element - nu
  // blocheaza niciodata upload-ul.
  async function decupeazaImagine(file: File): Promise<File[]> {
    if (!file.type.startsWith('image/')) return [file]
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/bonuri/decupaj', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      const boxes: { x: number; y: number; width: number; height: number }[] = res.ok ? (data?.boxes || []) : []
      if (!boxes.length) return [file]

      const bitmap = await createImageBitmap(file)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const decupate: File[] = []
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]
        const sx = Math.round(box.x * bitmap.width)
        const sy = Math.round(box.y * bitmap.height)
        const sw = Math.round(box.width * bitmap.width)
        const sh = Math.round(box.height * bitmap.height)
        if (sw < 20 || sh < 20) continue

        const canvas = document.createElement('canvas')
        canvas.width = sw
        canvas.height = sh
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
        const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
        if (!blob) continue
        const suffix = boxes.length > 1 ? `_scanat_${i + 1}` : '_scanat'
        decupate.push(new File([blob], `${baseName}${suffix}.jpg`, { type: 'image/jpeg' }))
      }
      return decupate.length ? decupate : [file]
    } catch {
      return [file]
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true); setUploadError('')
    const noiSchimbate: string[] = []
    const toateFisierele: File[] = []
    for (const rawFile of Array.from(files)) toateFisierele.push(...await decupeazaImagine(rawFile))
    for (const file of toateFisierele) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      let res: Response
      try {
        res = await fetch('/api/bonuri', { method: 'POST', body: fd })
      } catch {
        setUploadError('Eroare de rețea la upload — verifică conexiunea și reîncearcă.')
        break
      }
      const raw = await res.text()
      let d: any = {}
      try { d = raw ? JSON.parse(raw) : {} } catch { /* raspuns non-JSON, tratat mai jos */ }
      if (!res.ok) {
        setUploadError(d.error || `Eroare upload (status ${res.status})${raw ? `: ${raw.slice(0, 200)}` : ''}`)
        break
      }
      const rezultate = d.bonuri || (d.bon ? [d.bon] : [])
      for (const b of rezultate) {
        if (b.firmaSchimbata && b.firmaNume) noiSchimbate.push(`"${b.comerciant || b.fisier_nume}" a fost atribuit automat firmei ${b.firmaNume} (CUI de pe bon corespunde acelei firme, nu firmei curente)`)
      }
    }
    setUploading(false)
    if (noiSchimbate.length) setNotices(prev => [...prev, ...noiSchimbate])
    load()
  }

  async function openCamera() {
    setCameraError('')
    try {
      // Fara constrangeri de rezolutie, browserul alege deseori 640x480 (camera implicita pe
      // multe laptopuri) - mult prea putin ca sa se citeasca text mic tiparit de pe un bon fiscal.
      // "ideal" cere rezolutia maxima disponibila, fara sa esueze daca webcamul nu o suporta.
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      setStream(s)
      setCameraOpen(true)
    } catch {
      setCameraError('Nu am putut accesa camera — verifică permisiunile browserului.')
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
    setCameraOpen(false)
  }

  async function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    closeCamera()
    if (!blob) return
    const file = new File([blob], `bon_camera_${Date.now()}.jpg`, { type: 'image/jpeg' })
    await uploadFiles([file])
  }

  async function deleteBon(id: string) {
    if (!confirm('Ștergi acest bon?')) return
    setBonuri(prev => prev.filter(b => b.id !== id))
    await fetch(`/api/bonuri?id=${id}`, { method: 'DELETE' })
  }

  async function patchBon(id: string, patch: Partial<Pick<Bon, 'fisier_nume' | 'comerciant' | 'cui_client' | 'suma' | 'data_bon' | 'tip'>>) {
    setBonuri(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    await fetch('/api/bonuri', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
  }

  // Muta manual un bon pe alta firma - pentru cazul in care CUI-ul citit pe bon apartine altei
  // firme decat cea pe care a fost incarcat, dar auto-rutarea la upload nu l-a mutat (sau bonul
  // a fost adaugat inainte ca CUI-ul sa fie completat corect).
  async function moveBon(id: string, targetFirmaId: string) {
    if (!targetFirmaId) return
    setMovingId(id); setMoveError('')
    const res = await fetch('/api/bonuri/muta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, firmaId: targetFirmaId }),
    })
    const data = await res.json().catch(() => ({}))
    setMovingId(null)
    if (!res.ok) { setMoveError(data.error || 'Bonul nu a putut fi mutat'); return }
    setBonuri(prev => prev.filter(b => b.id !== id)) // dispare din lista firmei curente, a ajuns pe cealalta
  }

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  if (loading) return <div style={{ color: 'var(--c-555555)', fontSize: '14px', padding: '32px 0' }}>Se încarcă...</div>
  if (loadError && !bonuri.length) return <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '24px 0' }}>{loadError}</div>

  const asteptare = bonuri.filter(b => b.status === 'asteptare')
  const asociate = bonuri.filter(b => b.status === 'asociata')

  // Calcul rapid, direct pe pagina - fara sa mai fie nevoie sa descarci PDF-ul doar ca sa vezi
  // cat s-a cheltuit. Grupat dupa data reala de pe bon (nu dupa cand a fost incarcat).
  const totalSuma = bonuri.reduce((s, b) => s + (b.suma || 0), 0)
  const combustibilBonuri = bonuri.filter(b => b.tip === 'combustibil')
  const combustibilSuma = combustibilBonuri.reduce((s, b) => s + (b.suma || 0), 0)
  const altulBonuri = bonuri.filter(b => b.tip !== 'combustibil')
  const altulSuma = altulBonuri.reduce((s, b) => s + (b.suma || 0), 0)
  const peLuna = new Map<string, { count: number; suma: number }>()
  for (const b of bonuri) {
    const luna = (b.data_bon || b.created_at || '').slice(0, 7)
    if (!luna) continue
    const cur = peLuna.get(luna) || { count: 0, suma: 0 }
    cur.count++; cur.suma += b.suma || 0
    peLuna.set(luna, cur)
  }
  const luniSortate = [...peLuna.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        {cameraOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: '50vh', borderRadius: '10px', background: '#000' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={capturePhoto} style={{ fontSize: '13px', fontWeight: 600, padding: '8px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent-mint)', color: 'var(--c-0a0a0a)', cursor: 'pointer' }}>Capturează</button>
              <button onClick={closeCamera} style={{ fontSize: '13px', fontWeight: 600, padding: '8px 16px', borderRadius: '7px', border: '1px solid var(--c-2a2a2a)', background: 'transparent', color: 'var(--c-999999)', cursor: 'pointer' }}>Anulează</button>
            </div>
          </div>
        ) : (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files) }}
              style={{ border: `1.5px dashed ${drag ? 'var(--c-555555)' : 'var(--c-2a2a2a)'}`, borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: 'var(--c-0d0d0d)' }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-888888)' }}>
                {uploading ? 'Se decupează și se citesc bonurile...' : '+ Adaugă bon fiscal'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--c-666666)', marginTop: '3px' }}>PDF, JPG, PNG · o poză poate avea mai multe bonuri alăturate, se decupează și se salvează automat separat, fără fundal - comerciantul, suma, data și tipul se citesc automat pentru fiecare</div>
            </div>
            <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={hiddenInputStyle} onChange={e => e.target.files?.length && uploadFiles(e.target.files)}/>
            <button onClick={openCamera} style={{ marginTop: '10px', fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '7px', border: '1px solid var(--c-2a2a2a)', background: 'var(--c-161616)', color: 'var(--c-cccccc)', cursor: 'pointer' }}>📷 Fotografiază bon (camera laptop)</button>
            {cameraError && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{cameraError}</p>}
            {uploadError && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{uploadError}</p>}
          </>
        )}
      </div>

      {notices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {notices.map((n, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'light-dark(rgba(5,150,105,.1), rgba(110,231,176,.06))', border: '1px solid light-dark(rgba(5,150,105,.3), rgba(110,231,176,.2))', borderRadius: '8px' }}>
              <span style={{ flex: 1, fontSize: '12px', color: 'var(--c-cccccc)' }}>↪ {n}</span>
              <button onClick={() => setNotices(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: '11px', color: 'var(--c-666666)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {bonuri.length > 0 && (
        <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Calcul</div>
            <a
              href={`/api/bonuri/pdf?firmaId=${encodeURIComponent(firmaId)}&firmaNume=${encodeURIComponent(firmaNume)}`}
              style={{ fontSize: '12px', fontWeight: 600, padding: '7px 12px', borderRadius: '7px', border: '1px solid var(--c-2a2a2a)', background: 'var(--c-161616)', color: 'var(--c-cccccc)', textDecoration: 'none', flexShrink: 0 }}
            >
              ↓ PDF ({bonuri.length} bonuri)
            </a>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', marginBottom: luniSortate.length ? '18px' : 0 }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--c-eeeeee)' }}>{fmtRon(totalSuma)} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-666666)' }}>RON total</span></div>
              <div style={{ fontSize: '11px', color: 'var(--c-666666)', marginTop: '2px' }}>{bonuri.length} bonuri · {asteptare.length} în așteptare · {asociate.length} asociate</div>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-cccccc)' }}>{fmtRon(combustibilSuma)} RON</div>
              <div style={{ fontSize: '11px', color: 'var(--c-666666)', marginTop: '2px' }}>Combustibil ({combustibilBonuri.length})</div>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-cccccc)' }}>{fmtRon(altulSuma)} RON</div>
              <div style={{ fontSize: '11px', color: 'var(--c-666666)', marginTop: '2px' }}>Altul ({altulBonuri.length})</div>
            </div>
          </div>
          {luniSortate.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {luniSortate.map(([luna, d]) => (
                <div key={luna} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                  <span style={{ width: '80px', color: 'var(--c-999999)', flexShrink: 0 }}>{lunaLabel(luna)}</span>
                  <span style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'var(--c-1e1e1e)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${totalSuma > 0 ? Math.max(3, (d.suma / totalSuma) * 100) : 0}%`, background: 'var(--accent-mint)' }} />
                  </span>
                  <span style={{ width: '110px', textAlign: 'right', color: 'var(--c-cccccc)', fontWeight: 600 }}>{fmtRon(d.suma)} RON</span>
                  <span style={{ width: '70px', textAlign: 'right', color: 'var(--c-666666)' }}>{d.count} buc.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>
          În așteptare ({asteptare.length})
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>Se sugerează automat la tranzacția potrivită din extras, după sumă și data la care ai încărcat bonul — max. 3 zile diferență față de tranzacția bancară.</p>

        {asteptare.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--c-555555)', padding: '4px 0' }}>Niciun bon în așteptare.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {asteptare.map(b => {
              const kind = isPreviewable(b.fisier_tip, b.fisier_nume)
              const open = previewIds.has(b.id)
              // Fuzzy, nu strict egal: o cifra citita gresit de AI (foarte frecvent, ex. "488872594"
              // in loc de "48872594") nu trebuie sa declanseze un avertisment fals cand bonul e deja
              // pe firma corecta - doar cazurile cu adevarat diferite raman semnalate.
              const cuiMatch = b.cui_client && firmaCui ? editDistanceMax1(norm(b.cui_client), norm(firmaCui)) : null
              const ghicitFirmaId = cuiMatch === false ? bestGuessFirma(b.cui_client, firmaId, firme) : null
              const movePickValue = movePick[b.id] ?? ghicitFirmaId ?? ''
              return (
                <div key={b.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px', padding: '10px 12px' }}>
                    <input
                      defaultValue={b.fisier_nume}
                      onBlur={e => e.target.value.trim() && e.target.value !== b.fisier_nume && patchBon(b.id, { fisier_nume: e.target.value.trim() })}
                      style={{ flex: '1 1 140px', minWidth: 0, fontSize: '12px', color: 'var(--c-dddddd)', background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                    />
                    <select
                      defaultValue={b.tip}
                      onChange={e => patchBon(b.id, { tip: e.target.value as Bon['tip'] })}
                      style={{ width: '96px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 6px', outline: 'none' }}
                    >
                      <option value="combustibil">Combustibil</option>
                      <option value="altul">Altul</option>
                    </select>
                    <input
                      defaultValue={b.comerciant || ''}
                      placeholder="comerciant"
                      onBlur={e => e.target.value.trim() !== (b.comerciant || '') && patchBon(b.id, { comerciant: e.target.value.trim() })}
                      style={{ width: '130px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        defaultValue={b.cui_client || ''}
                        placeholder="CUI client"
                        title="CUI-ul firmei beneficiare, citit din câmpul Client C.U.I./C.I.F. de pe bon (când există)"
                        onBlur={e => e.target.value.trim() !== (b.cui_client || '') && patchBon(b.id, { cui_client: e.target.value.trim() })}
                        style={{ width: '90px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                      />
                      {cuiMatch === true && <span title="CUI corespunde firmei" style={{ fontSize: '11px', color: 'var(--accent-mint)' }}>✓</span>}
                      {cuiMatch === false && <span title="CUI diferit de firma curentă" style={{ fontSize: '11px', color: 'var(--accent-red)' }}>⚠</span>}
                    </div>
                    {cuiMatch === false && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={ghicitFirmaId ? 'CUI-ul aproape se potrivește cu această firmă (probabil o cifră citită greșit) - preselectată automat' : undefined}>
                        <select
                          value={movePickValue}
                          onChange={e => setMovePick(prev => ({ ...prev, [b.id]: e.target.value }))}
                          style={{ width: '130px', fontSize: '11px', color: ghicitFirmaId && !movePick[b.id] ? 'var(--accent-mint)' : 'var(--c-cccccc)', fontWeight: ghicitFirmaId && !movePick[b.id] ? 700 : 400, background: 'var(--c-0d0d0d)', border: `1px solid ${ghicitFirmaId && !movePick[b.id] ? 'var(--accent-mint)' : 'var(--c-2a2a2a)'}`, borderRadius: '6px', padding: '4px 6px', outline: 'none' }}
                        >
                          <option value="">Mută pe firma...</option>
                          {firme.filter(f => f.id !== firmaId).map(f => <option key={f.id} value={f.id}>{f.nume}</option>)}
                        </select>
                        <button
                          onClick={() => moveBon(b.id, movePickValue)}
                          disabled={!movePickValue || movingId === b.id}
                          style={{ fontSize: '11px', fontWeight: 700, padding: '4px 9px', borderRadius: '6px', border: '1px solid var(--accent-red)', background: 'transparent', color: 'var(--accent-red)', cursor: 'pointer', opacity: (!movePickValue || movingId === b.id) ? .5 : 1 }}
                        >
                          {movingId === b.id ? '...' : 'Mută'}
                        </button>
                      </div>
                    )}
                    <input
                      type="number" step="0.01"
                      defaultValue={b.suma ?? ''}
                      placeholder="sumă"
                      onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== b.suma) patchBon(b.id, { suma: v }) }}
                      style={{ width: '80px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <input
                      type="date"
                      title="Data de pe bon — doar informativ, nu contează la asociere (se folosește data la care a fost încărcat)"
                      defaultValue={b.data_bon || ''}
                      onBlur={e => { const v = e.target.value || null; if (v !== b.data_bon) patchBon(b.id, { data_bon: v }) }}
                      style={{ width: '130px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    {kind && (
                      <button onClick={() => togglePreview(b.id)} style={{ fontSize: '11px', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        {open ? 'Ascunde' : 'Vezi'}
                      </button>
                    )}
                    <a href={`/api/bonuri/download?id=${b.id}`} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none' }}>↓</a>
                    <button onClick={() => deleteBon(b.id)} style={{ width: '22px', height: '22px', flexShrink: 0, background: 'var(--c-1a1a1a)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px', lineHeight: 1 }}>×</button>
                  </div>
                  {open && kind === 'pdf' && (
                    <iframe src={`/api/bonuri/download?id=${b.id}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                  )}
                  {open && kind === 'image' && (
                    <img src={`/api/bonuri/download?id=${b.id}&preview=1`} alt={b.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
        {moveError && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '10px' }}>{moveError}</p>}
      </div>

      {asociate.length > 0 && (
        <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '14px' }}>
            Deja asociate ({asociate.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {asociate.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-1a1a1a)', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-mint)', flexShrink: 0 }}>✓</span>
                <span style={{ flex: 1, fontSize: '12px', color: 'var(--c-777777)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.comerciant || b.fisier_nume}</span>
                {b.suma != null && <span style={{ fontSize: '11px', color: 'var(--c-666666)' }}>{b.suma.toFixed(2)} RON</span>}
                {b.data_bon && <span style={{ fontSize: '11px', color: 'var(--c-666666)' }}>{fmtData(b.data_bon)}</span>}
                <button onClick={() => deleteBon(b.id)} style={{ fontSize: '10px', color: 'var(--c-555555)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
