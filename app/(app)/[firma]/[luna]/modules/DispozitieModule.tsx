'use client'
import { deschideDocument } from '@/lib/vizualizare'
import { useState, useCallback, useEffect, useRef } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import { Proprietar } from '@/lib/firma-config'
import EditorDispozitie from './EditorDispozitie'
import Icon from '@/components/ui/Icon'
import css from './Dispozitie.module.css'
import { accountingPeriod, workMonthLabel } from '@/lib/accounting-period'

interface Firma { id:string; slug:string; nume:string; culoare:string; luna_id?:string; cui?:string|null; nrRegCom?:string|null; adresa?:string|null; judet?:string|null; tara?:string|null }
interface Props { firma: Firma; firmeDisponibile: Firma[]; lunaId: string; tasks: TaskItem[]; proprietari?: Proprietar[] }

type AttachmentDoc = { id:string; fisier_nume:string; furnizor?:string|null; data_document?:string|null; created_at?:string|null; locatie?:string|null; utilitate?:string|null; suma?:number|null; valuta?:string|null; suma_ron?:number|null; curs_bnr?:number|null }
type DispDoc = { id:string; fisier_nume:string; numar_document:string; furnizor:string; suma?:number|null; locatie?:string|null; utilitate?:string|null; data?:Record<string,string|number>; attachments?:AttachmentDoc[] }
type BuletinResult = { prenume:string; nume:string; serieCi:string; numarCi:string }
type ProprietarLocatie = { id:string; eticheta:string; proprietar_id:string; proprietari?: { nume:string; serie_ci:string|null; numar_ci:string|null } | null }
type DuplicateWarning = {
  fisierNume:string
  motiv:'fisier_identic'|'numar_factura'|'detalii_factura'|'suma_apartament_perioada'
  createdAt?:string|null
  existingDocumentId?:string|null
}

function dpLabel(doc: DispDoc): string {
  const parts = [doc.utilitate, doc.locatie ? `ap. ${doc.locatie}` : null, invoicePeriodLabel(doc)].filter(Boolean)
  return parts.length ? parts.join(' · ') : String(doc.data?.purpose || doc.furnizor || doc.fisier_nume)
}

function roDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ro-RO')
}

function periodFromFurnizor(value?: string | null) {
  const text = String(value || '')
  const match = text.match(/\bluna\s+([^|]+?)(?:\s+\|\s+HASH:|$)/i)
  return match?.[1]?.replace(/\s+-\s*$/, '').trim() || ''
}

function invoicePeriodLabel(doc: DispDoc) {
  const labels = new Set<string>()
  for (const attachment of doc.attachments || []) {
    const period = periodFromFurnizor(attachment.furnizor)
    if (period) labels.add(`luna ${period}`)
    else if (attachment.data_document) labels.add(`fact. ${roDate(attachment.data_document)}`)
  }
  return [...labels].slice(0, 2).join(' / ')
}

function duplicateReasonLabel(warning: DuplicateWarning) {
  if (warning.motiv === 'fisier_identic') return 'fișier identic'
  if (warning.motiv === 'numar_factura') return 'același număr de factură'
  if (warning.motiv === 'detalii_factura') return 'aceeași sumă + utilitate + apartament/perioadă'
  return 'aceeași sumă + apartament + perioadă'
}

function duplicateDateLabel(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `, încărcată pe ${date.toLocaleDateString('ro-RO')}`
}

// Extrage numărul de apartament dintr-un text (etichetă de proprietate sau adresa citită de AI
// de pe factură): "... apartament 83" / "... ap. 83" -> "83", iar un text care e doar un număr
// ("83") e luat ca atare. Ignoră celelalte numere din adresă (nr. stradă, bloc etc.).
function apartmentNumberFromEticheta(eticheta: string): string {
  const match = String(eticheta || '').match(/\bap(?:artament(?:ul)?)?\.?\s*(?:nr\.?)?\s*(\d+)/i)
  if (match) return match[1].replace(/^0+(?=\d)/, '')
  const bare = String(eticheta || '').trim().match(/^(\d+)$/)
  return bare ? bare[1].replace(/^0+(?=\d)/, '') : ''
}

const STOPWORDS = new Set(['strada','stradă','str','numarul','numărul','nr','bloc','bl','ap','apartament','apartamentul','villa','vila'])

// Cuvinte "semnificative" (nume de stradă/loc) și numere dintr-un text, pentru potrivire
// când adresa nu are un apartament explicit (case, vile) - facturile de utilități (curent,
// gaz) au adesea doar adresa de livrare, nu un identificator de apartament din lista noastră.
function wordsAndNumbers(text: string): { words:string[]; numbers:string[] } {
  const clean = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const tokens = clean.split(/\s+/).filter(Boolean)
  const words = tokens.filter(t => /[a-z]/.test(t) && t.length >= 4 && !STOPWORDS.has(t))
  const numbers = tokens.filter(t => /^\d+$/.test(t)).map(n => n.replace(/^0+(?=\d)/, ''))
  return { words, numbers }
}

function findLocatieMatch(locatii: ProprietarLocatie[], apartmentRaw?: string | null) {
  const raw = String(apartmentRaw || '').trim()
  if (!raw) return undefined
  const apartment = apartmentNumberFromEticheta(raw)
  if (apartment) {
    const byApartment = locatii.find(l => apartmentNumberFromEticheta(l.eticheta) === apartment)
    if (byApartment) return byApartment
  }
  // Proprietăți fără "apartament" în etichetă (case/vile identificate prin stradă + număr):
  // cerem și un cuvânt comun (numele străzii), nu doar un număr, ca să evităm potriviri
  // întâmplătoare pe un simplu "nr. 7" care ar putea apărea pe orice altă adresă.
  const invoice = wordsAndNumbers(raw)
  if (!invoice.words.length) return undefined
  return locatii.find(l => {
    if (apartmentNumberFromEticheta(l.eticheta)) return false
    const et = wordsAndNumbers(l.eticheta)
    return et.words.some(w => invoice.words.includes(w)) && et.numbers.some(n => invoice.numbers.includes(n))
  })
}

export default function DispozitieModule({ firma, firmeDisponibile, lunaId, tasks, proprietari = [] }: Props) {
  const [firmaId, setFirmaId] = useState(firma.id)
  const selectedFirma = firmeDisponibile.find(f => f.id === firmaId) || firma
  const legal = { cif: selectedFirma.cui || '', nrRegCom: selectedFirma.nrRegCom || '', adresa: selectedFirma.adresa || '', judet: selectedFirma.judet || '', tara: selectedFirma.tara || '' }
  const selectedLunaId = selectedFirma.luna_id || lunaId

  const [number, setNumber] = useState('')
  const [documents, setDocuments] = useState<DispDoc[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [beneficiary, setBeneficiary] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [owner, setOwner] = useState('')
  const [beneficiaryFunction, setBeneficiaryFunction] = useState('')
  const [identitySeries, setIdentitySeries] = useState('')
  const [identityNumber, setIdentityNumber] = useState('')
  const [preset, setPreset] = useState('')
  const [editId, setEditId] = useState('')
  const [editorDoc, setEditorDoc] = useState<DispDoc | null>(null)
  const [attachedInvoices, setAttachedInvoices] = useState<AttachmentDoc[]>([])
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [duplicateWarnings, setDuplicateWarnings] = useState<{ docId:string; text:string; existingDocumentId?:string|null }[]>([])
  const [removingInvoiceId, setRemovingInvoiceId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState('')
  // Mutarea unei dispozitii pe alta luna (ex. emisa pe luna gresita de contabilizare)
  const [mutaId, setMutaId] = useState('')
  const [luni, setLuni] = useState<{ id: string; luna: string }[]>([])
  const [mutaTinta, setMutaTinta] = useState('')
  const [mutaBusy, setMutaBusy] = useState(false)
  const [mutaMesaj, setMutaMesaj] = useState('')
  const [trasFacturi, setTrasFacturi] = useState(false)
  const invoiceRef = useRef<HTMLInputElement>(null)
  const buletinRef = useRef<HTMLInputElement>(null)

  // Proprietari salvați local (adăugați din buletin)
  const lsKey = `contaflow:proprietari:${firma.id}`
  const [localProprietari, setLocalProprietari] = useState<Proprietar[]>([])
  const [buletinBusy, setBuletinBusy] = useState(false)
  const [buletinResult, setBuletinResult] = useState<BuletinResult|null>(null)
  const [bPrenume, setBPrenume] = useState(''); const [bNume, setBNume] = useState('')
  const [bSerie, setBSerie] = useState(''); const [bNumar, setBNumar] = useState('')

  // Proprietăți (adrese) legate de proprietari, ca la selectarea uneia să se precompleteze
  // automat proprietarul, fără să mai cauți numele lui manual.
  const [locatii, setLocatii] = useState<ProprietarLocatie[]>([])
  const [selectedLocatieId, setSelectedLocatieId] = useState('')
  const [showLocatieForm, setShowLocatieForm] = useState(false)
  const [newLocatieEticheta, setNewLocatieEticheta] = useState('')
  const [newLocatieProprietarId, setNewLocatieProprietarId] = useState('')
  const [locatieBusy, setLocatieBusy] = useState(false)

  const loadLocatii = useCallback(async () => {
    const res = await fetch(`/api/proprietari/locatii?firmaId=${encodeURIComponent(selectedFirma.id)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setLocatii(data.locatii || [])
  }, [selectedFirma.id])

  useEffect(() => { loadLocatii() }, [loadLocatii])

  useEffect(() => {
    try { setLocalProprietari(JSON.parse(localStorage.getItem(lsKey) || '[]')) } catch {}
  }, [lsKey])

  const loadNumber = useCallback(async () => {
    const res = await fetch(`/api/chitante/dispozitie?lunaId=${encodeURIComponent(selectedLunaId)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setNumber(data.nextNumber); setDocuments(data.documents || []) }
  }, [selectedLunaId])

  const loadTemplate = useCallback(async () => {
    const res = await fetch(`/api/chitante/dispozitie/template?firmaId=${encodeURIComponent(selectedFirma.id)}`)
    const data = await res.json().catch(() => ({}))
    const t = data.template || {}
    setOwner(t.owner || ''); setBeneficiaryFunction(t.beneficiaryFunction || '')
    setIdentitySeries(t.identitySeries || ''); setIdentityNumber(t.identityNumber || '')
    if (t.defaultPurpose) setPurpose(t.defaultPurpose)
  }, [selectedFirma.id])

  useEffect(() => { loadNumber(); loadTemplate() }, [loadNumber, loadTemplate])

  async function saveTemplate() {
    setTemplateBusy(true)
    await fetch('/api/chitante/dispozitie/template', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:selectedFirma.id, lunaId:selectedLunaId, template:{ owner, beneficiaryFunction, identitySeries, identityNumber, defaultPurpose:purpose } }) })
    setTemplateBusy(false)
  }

  async function resetNumber() {
    if (!confirm('Resetezi numerotarea la 01?')) return
    const res = await fetch('/api/chitante/dispozitie', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:selectedFirma.id, lunaId:selectedLunaId }) })
    if (res.ok) setNumber('01')
  }

  async function savePdf() {
    setPdfBusy(true)
    const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId:selectedLunaId, title:`Dispozitii_plata_${selectedFirma.nume}`, scope:{ section:'dispozitii-plata' } }) })
    if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`Dispozitii_plata_${selectedFirma.nume}.pdf`; a.click(); URL.revokeObjectURL(u) }
    setPdfBusy(false)
  }

  async function deleteDisposition(doc: DispDoc) {
    if (!confirm(`Ștergi dispoziția „${doc.fisier_nume}"?`)) return
    setDeletingId(doc.id)
    const res = await fetch(`/api/chitante/dispozitie?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) setError(data.error || 'Eroare ștergere')
    else { setNumber(data.nextNumber || number); setDocuments(prev=>prev.filter(e=>e.id!==doc.id)) }
    setDeletingId('')
  }

  const lunaCurenta = luni.find(l => l.id === selectedLunaId)?.luna || ''
  const lunaUrm = (k: string) => { const [y, m] = k.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
  // Lunile deja deschise + luna urmatoare celei curente (se deschide automat la mutare)
  const optiuniLuni = [...new Set([...luni.map(l => l.luna), ...(lunaCurenta ? [lunaUrm(lunaCurenta)] : [])])].filter(k => k !== lunaCurenta).sort().reverse()
  const etichetaLunaDp = (k: string) => `${workMonthLabel(k)} · contabilizare ${accountingPeriod(k).monthName} ${accountingPeriod(k).year}${luni.some(l => l.luna === k) ? '' : ' (lună nouă)'}`

  async function deschideMuta(doc: DispDoc) {
    setMutaMesaj('')
    if (mutaId === doc.id) { setMutaId(''); return }
    setMutaId(doc.id)
    const res = await fetch(`/api/chitante/dispozitie/muta?firmaId=${encodeURIComponent(selectedFirma.id)}`)
    const data = await res.json().catch(() => ({}))
    const lista: { id: string; luna: string }[] = data.luni || []
    setLuni(lista)
    const cur = lista.find(l => l.id === selectedLunaId)?.luna
    setMutaTinta(cur ? lunaUrm(cur) : '')
  }

  async function mutaDispozitie(doc: DispDoc) {
    if (!mutaTinta) return
    setMutaBusy(true); setError('')
    const res = await fetch('/api/chitante/dispozitie/muta', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      id:doc.id, firmaId:selectedFirma.id, luna:mutaTinta, firmaNume:selectedFirma.nume, cif:legal.cif, nrRegCom:legal.nrRegCom, adresa:legal.adresa,
    }) })
    const data = await res.json().catch(() => ({}))
    setMutaBusy(false)
    if (!res.ok) { setError(data.error || 'Dispoziția nu a putut fi mutată'); return }
    setDocuments(prev => prev.filter(e => e.id !== doc.id)); setNumber(data.nextNumber || number); setMutaId('')
    setMutaMesaj(`Dispoziția nr. ${data.vechi} a fost mutată pe ${workMonthLabel(mutaTinta)} (contabilizare ${accountingPeriod(mutaTinta).monthName} ${accountingPeriod(mutaTinta).year}) ca nr. ${data.numar}${data.facturi ? `, cu ${data.facturi} ${data.facturi === 1 ? 'factură atașată' : 'facturi atașate'}` : ''}.`)
  }

  async function generate() {
    setError('')
    const res = await fetch('/api/chitante/dispozitie', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      firmaId:selectedFirma.id, lunaId:selectedLunaId, firmaNume:selectedFirma.nume,
      cif:legal?.cif, nrRegCom:legal?.nrRegCom, adresa:legal?.adresa, judet:legal?.judet, tara:legal?.tara,
      editId, date, beneficiary:beneficiary||owner, function:beneficiaryFunction, amount, purpose, identitySeries, identityNumber, attachmentIds:attachedInvoices.map(i=>i.id),
      locatieEticheta: locatii.find(l=>l.id===selectedLocatieId)?.eticheta || null,
    }) })
    if (!res.ok) { setError((await res.json().catch(()=>({}))).error||'Generarea nu a reușit'); return }
    const assigned=res.headers.get('X-Disposition-Number')||number; const isZip=(res.headers.get('Content-Type')||'').includes('zip'); const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`dispozitie_plata_${assigned}.${isZip?'zip':'pdf'}`; a.click(); URL.revokeObjectURL(url)
    setEditId(''); setAttachedInvoices([]); setPreset(''); setSelectedLocatieId(''); setBeneficiary(''); setAmount(''); setPurpose(''); await loadNumber()
  }

  const allProprietari = [...proprietari, ...localProprietari.filter(l => !proprietari.some(s => s.nume === l.nume))]

  function applyPreset(val: string) {
    setPreset(val)
    const p = allProprietari.find(e => e.nume === val)
    if (!p) return
    setBeneficiary(p.nume); setOwner(p.nume); setBeneficiaryFunction('Proprietar')
    setIdentitySeries(p.serieCi); setIdentityNumber(p.numarCi)
  }

  function applyLocatie(id: string) {
    setSelectedLocatieId(id)
    const loc = locatii.find(l => l.id === id)
    if (!loc?.proprietari) return
    setPreset('')
    setBeneficiary(loc.proprietari.nume); setOwner(loc.proprietari.nume); setBeneficiaryFunction('Proprietar')
    setIdentitySeries(loc.proprietari.serie_ci || ''); setIdentityNumber(loc.proprietari.numar_ci || '')
  }

  async function addLocatie() {
    if (!newLocatieEticheta.trim() || !newLocatieProprietarId) return
    setLocatieBusy(true); setError('')
    const res = await fetch('/api/proprietari/locatii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId: selectedFirma.id, proprietarId: newLocatieProprietarId, eticheta: newLocatieEticheta.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Nu am putut adăuga proprietatea')
    else { setNewLocatieEticheta(''); setNewLocatieProprietarId(''); await loadLocatii() }
    setLocatieBusy(false)
  }

  async function removeLocatie(loc: ProprietarLocatie) {
    if (!confirm(`Ștergi legătura „${loc.eticheta}" → ${loc.proprietari?.nume || '?'}?`)) return
    const res = await fetch(`/api/proprietari/locatii?id=${encodeURIComponent(loc.id)}`, { method: 'DELETE' })
    if (res.ok) { setLocatii(prev => prev.filter(l => l.id !== loc.id)); if (selectedLocatieId === loc.id) setSelectedLocatieId('') }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Nu am putut șterge proprietatea') }
  }

  async function analyzeBuletin(file: File) {
    setBuletinBusy(true); setError(''); setBuletinResult(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/proprietar/analyze', { method:'POST', body:fd })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setError(data.error||'AI nu a putut citi buletinul'); setBuletinBusy(false); return }
    setBuletinResult(data)
    setBPrenume(data.prenume||''); setBNume(data.nume||'')
    setBSerie(data.serieCi||''); setBNumar(data.numarCi||'')
    setBuletinBusy(false)
  }

  function saveProprietar() {
    const numeComplet = `${bPrenume} ${bNume}`.trim()
    if (!numeComplet) return
    const p: Proprietar = { nume: numeComplet, serieCi: bSerie, numarCi: bNumar }
    const updated = [...localProprietari.filter(x => x.nume !== numeComplet), p]
    setLocalProprietari(updated)
    try { localStorage.setItem(lsKey, JSON.stringify(updated)) } catch {}
    setBuletinResult(null)
    // auto-select
    setPreset(numeComplet); setBeneficiary(numeComplet); setOwner(numeComplet)
    setBeneficiaryFunction('Proprietar'); setIdentitySeries(bSerie); setIdentityNumber(bNumar)
  }

  function deleteLocalProprietar(nume: string) {
    const updated = localProprietari.filter(p => p.nume !== nume)
    setLocalProprietari(updated)
    try { localStorage.setItem(lsKey, JSON.stringify(updated)) } catch {}
    if (preset === nume) setPreset('')
  }

  async function analyzeInvoices(files: FileList) {
    setInvoiceBusy(true); setError(''); setDuplicateWarnings([])
    const newWarnings: { docId:string; text:string; existingDocumentId?:string|null }[] = []
    let locatieAlreadyChosen = !!selectedLocatieId
    const attachedIdsSoFar = attachedInvoices.map(i => i.id)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file); fd.append('firmaId', selectedFirma.id); fd.append('lunaId', selectedLunaId); fd.append('number', number)
      fd.append('existingAttachmentIds', attachedIdsSoFar.join(','))
      const res = await fetch('/api/chitante/dispozitie/analyze', { method:'POST', body:fd })
      const data = await res.json().catch(()=>({}))
      if (!res.ok) { setError(data.error||'Analiza nu a reușit'); break }
      setAttachedInvoices(prev=>[...prev, data.document])
      if (data.document?.id) attachedIdsSoFar.push(data.document.id)
      if (data.purpose) setPurpose(prev=>prev ? `${prev}; ${data.purpose}` : data.purpose)
      if (data.amount) setAmount(prev => String(Math.round(((Number(prev) || 0) + data.amount) * 100) / 100))
      if (data.currency && data.currency !== 'RON' && !data.amount) setError(`„${data.document?.fisier_nume || file.name}” e în ${data.currency}, dar cursul BNR nu a putut fi citit — completează suma în lei manual.`)
      if (data.duplicateWarning) {
        const warning = data.duplicateWarning as DuplicateWarning
        newWarnings.push({
          docId: data.document?.id,
          text: `„${data.document?.fisier_nume || file.name}" pare duplicat cu „${warning.fisierNume}" (${duplicateReasonLabel(warning)}${duplicateDateLabel(warning.createdAt)}) — verifică să nu fie factura de luna trecută sau deja salvată.`,
          existingDocumentId: warning.existingDocumentId,
        })
      }
      // Dacă factura are un apartament recunoscut și nicio proprietate nu a fost aleasă încă
      // (nici manual, nici de o factură anterioară din același lot), recomandăm automat proprietarul.
      if (!locatieAlreadyChosen && data.locatie) {
        const match = findLocatieMatch(locatii, data.locatie)
        if (match) { applyLocatie(match.id); locatieAlreadyChosen = true }
      }
    }
    if (newWarnings.length) setDuplicateWarnings(newWarnings)
    setInvoiceBusy(false)
  }

  async function removeAttachedInvoice(doc: AttachmentDoc) {
    if (!confirm(`Ștergi definitiv factura „${doc.fisier_nume}"? Nu va mai putea fi recuperată.`)) return
    setRemovingInvoiceId(doc.id)
    const res = await fetch(`/api/chitante/dispozitie/analyze?id=${encodeURIComponent(doc.id)}`, { method:'DELETE' })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) setError(data.error || 'Nu am putut șterge factura')
    else {
      setAttachedInvoices(prev => prev.filter(i => i.id !== doc.id))
      setDuplicateWarnings(prev => prev.filter(w => w.docId !== doc.id))
    }
    setRemovingInvoiceId('')
  }

  function editDisposition(doc: DispDoc) {
    const d = doc.data||{}
    setEditId(doc.id); setNumber(doc.numar_document); setDate(String(d.date||date)); setBeneficiary(String(d.beneficiary||''))
    setOwner(String(d.beneficiary||'')); setBeneficiaryFunction(String(d.function||''))
    setAmount(String(d.amount||'')); setPurpose(String(d.purpose||''))
    setIdentitySeries(String(d.identitySeries||'')); setIdentityNumber(String(d.identityNumber||''))
    setAttachedInvoices(doc.attachments||[])
  }

  const monedaLei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sumaFacturiLei = Math.round(attachedInvoices.reduce((a, i) => a + Number(i.suma_ron ?? (!i.valuta || i.valuta === 'RON' ? i.suma : 0) ?? 0), 0) * 100) / 100
  const pas1 = !!number, pas2 = !!(beneficiary || owner), pas3 = attachedInvoices.length > 0
  const hidden: React.CSSProperties = { position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }

  return (
    <div className={css.root}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <div className={css.card}>
        <div className={css.hero}>
          <div className={css.heroLeft}>
            <div className={css.heroIcon}><Icon name="send" size={20} /></div>
            <div>
              <div className={css.heroTitle}>Dispoziții de plată</div>
              <div className={css.heroSub}>Generator numerotat lunar, salvat automat în dosarul contabilității.</div>
            </div>
          </div>
          <div className={css.tools}>
            <span className={css.heroNr}>Următorul nr. <b>{number || '—'}</b></span>
            <button className={css.tool} onClick={savePdf} disabled={pdfBusy}><Icon name="download" size={14} />{pdfBusy?'Se pregătește…':'Salvează PDF'}</button>
            <button className={css.tool} onClick={saveTemplate} disabled={templateBusy}>{templateBusy?'Se salvează…':'Salvează șablon'}</button>
            <button className={`${css.tool} ${css.toolDanger}`} onClick={resetNumber}>Reset 01</button>
          </div>
        </div>

        <div className={css.issued}>
          <div className={css.secHead}><span className={css.eyebrow}>Dispoziții emise · {documents.length}</span></div>
          {mutaMesaj && <div className={css.mutaOk}>✓ {mutaMesaj}</div>}
          {documents.length === 0 && <div className={css.muted}>Nu există încă dispoziții generate pentru luna selectată.</div>}
          <div className={css.dpList}>
            {documents.map(doc => (
              <div key={doc.id} className={css.dpWrap}>
              <div className={css.dp}>
                <div className={css.dpNr}>{doc.numar_document}</div>
                <div className={css.dpMain}>
                  <div className={css.dpTitle} title={dpLabel(doc)}>{dpLabel(doc)}</div>
                  <div className={css.dpMeta}>{doc.attachments?.length ? `${doc.attachments.length} ${doc.attachments.length === 1 ? 'anexă' : 'anexe'}` : 'fără anexe'}{doc.data?.beneficiary ? ` · ${doc.data.beneficiary}` : ''}</div>
                </div>
                <div className={css.dpSum}>{doc.suma != null ? `${monedaLei(Number(doc.suma))} lei` : ''}</div>
                <div className={css.dpActions}>
                  <a className={css.iconBtn} href={`/api/chitante/dispozitie?download=${encodeURIComponent(doc.id)}`} title="Descarcă dispoziția (cu anexele)" aria-label="Descarcă"><Icon name="download" size={14} /></a>
                  <button className={css.iconBtn} onClick={()=>setEditorDoc(doc)} title="Vezi facturile, modifică sumele sau șterge facturi">Editează</button>
                  <button className={css.iconBtn} onClick={()=>editDisposition(doc)} title="Încarcă dispoziția în formularul de mai jos">Modifică</button>
                  <button className={css.iconBtn} onClick={()=>deschideMuta(doc)} aria-expanded={mutaId===doc.id} title="Mută dispoziția (cu facturile atașate) pe altă lună">Mută</button>
                  <button className={`${css.iconBtn} ${css.iconDanger}`} onClick={()=>deleteDisposition(doc)} disabled={deletingId===doc.id} aria-label="Șterge dispoziția" title="Șterge dispoziția">{deletingId===doc.id?'…':'✕'}</button>
                </div>
              </div>
              {mutaId === doc.id && (
                <div className={css.muta}>
                  <label className={css.mutaField}>Mută pe luna
                    <select className={css.input} value={mutaTinta} onChange={e=>setMutaTinta(e.target.value)} disabled={!luni.length}>
                      {!luni.length && <option value="">Se încarcă lunile…</option>}
                      {optiuniLuni.map(k => <option key={k} value={k}>{etichetaLunaDp(k)}</option>)}
                    </select>
                  </label>
                  <div className={css.mutaActions}>
                    <button className={`${css.btn} ${css.btnPrimary}`} onClick={()=>mutaDispozitie(doc)} disabled={!mutaTinta||mutaBusy}>{mutaBusy ? 'Se mută…' : 'Mută'}</button>
                    <button className={css.btn} onClick={()=>setMutaId('')}>Anulează</button>
                  </div>
                  <div className={css.mutaHint}>Pe luna aleasă primește următorul număr liber, iar PDF-ul se regenerează cu numărul nou; facturile atașate se mută împreună cu ea. Data dispoziției ({doc.data?.date ? String(doc.data.date).split('-').reverse().join('.') : '—'}) rămâne aceeași — o poți schimba apoi cu „Modifică”.</div>
                </div>
              )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={css.steps}>
        <section className={`${css.card} ${css.step}`}>
          <div className={css.stepHead}><div className={css.stepTitle}><span className={css.stepNr} data-done={pas1}>{pas1 ? '✓' : '1'}</span><div><div className={css.stepName}>Firmă, număr și dată</div><div className={css.stepHint}>Numărul se calculează automat pe luna selectată; data poate fi schimbată pentru dispoziții emise retroactiv.</div></div></div></div>
          <div className={`${css.grid} ${css.g3}`}>
            <label className={css.field}>Firma<select className={css.input} value={firmaId} onChange={e=>setFirmaId(e.target.value)}>{firmeDisponibile.map(f=><option key={f.id} value={f.id}>{f.nume}</option>)}</select></label>
            <label className={css.field}>Număr<input className={`${css.input} ${css.inputStrong}`} readOnly value={number} placeholder="automat"/></label>
            <label className={css.field}>Data<input className={css.input} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
          </div>
          <div className={css.legal}>
            {[['Reg. Com.', legal.nrRegCom], ['CIF', legal.cif], ['Sediu', [legal.adresa, legal.judet, legal.tara].filter(Boolean).join(', ')]].map(([k, v]) => <span key={k} className={css.legalChip}>{k} <b>{v || '—'}</b></span>)}
          </div>
        </section>

        <section className={`${css.card} ${css.step}`}>
          <div className={css.stepHead}>
            <div className={css.stepTitle}><span className={css.stepNr} data-done={pas2}>{pas2 ? '✓' : '2'}</span><div><div className={css.stepName}>Beneficiar / proprietar</div><div className={css.stepHint}>Alege proprietatea și proprietarul se completează singur, sau alege-l direct / citește-l din buletin.</div></div></div>
            <button className={css.btn} onClick={()=>setShowLocatieForm(v=>!v)}>{showLocatieForm ? 'Ascunde proprietățile' : 'Gestionează proprietăți'}</button>
          </div>
          <label className={css.field}>Proprietate
            <select className={css.input} value={selectedLocatieId} onChange={e=>applyLocatie(e.target.value)}>
              <option value="">{locatii.length ? 'Selectează proprietatea (precompletează proprietarul)…' : 'Nicio proprietate configurată încă'}</option>
              {locatii.map(l => <option key={l.id} value={l.id}>{l.eticheta} → {l.proprietari?.nume || '?'}</option>)}
            </select>
          </label>
          {showLocatieForm && (
            <div className={css.sub}>
              <div className={`${css.grid} ${css.g3}`}>
                <input className={css.input} value={newLocatieEticheta} onChange={e=>setNewLocatieEticheta(e.target.value)} placeholder="Denumire proprietate (ex. Villa MV07 - Munteni nr 07)"/>
                <select className={css.input} value={newLocatieProprietarId} onChange={e=>setNewLocatieProprietarId(e.target.value)}>
                  <option value="">Alege proprietar…</option>
                  {proprietari.filter(p => p.id).map(p => <option key={p.id} value={p.id}>{p.nume}</option>)}
                </select>
                <button className={`${css.btn} ${css.btnPrimary}`} onClick={addLocatie} disabled={locatieBusy || !newLocatieEticheta.trim() || !newLocatieProprietarId}>Adaugă</button>
              </div>
              {locatii.map(l => <div key={l.id} className={css.locRow}><span style={{ flex:1 }}>{l.eticheta} → <b>{l.proprietari?.nume || '?'}</b></span><button className={`${css.iconBtn} ${css.iconDanger}`} onClick={()=>removeLocatie(l)} aria-label="Șterge proprietatea">✕</button></div>)}
            </div>
          )}
          <div className={`${css.grid} ${css.g4}`}>
            <label className={css.field}>Proprietar / beneficiar<input className={css.input} value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Nume complet"/></label>
            <label className={css.field}>Calitate<input className={css.input} value={beneficiaryFunction} onChange={e=>setBeneficiaryFunction(e.target.value)} placeholder="ex. Proprietar"/></label>
            <label className={css.field}>Serie CI<input className={css.input} value={identitySeries} onChange={e=>setIdentitySeries(e.target.value)}/></label>
            <label className={css.field}>Număr CI<input className={css.input} value={identityNumber} onChange={e=>setIdentityNumber(e.target.value)}/></label>
          </div>
          <div className={`${css.grid} ${css.g2a}`}>
            <select className={css.input} value={preset} onChange={e=>applyPreset(e.target.value)} aria-label="Proprietar salvat">
              <option value="">{allProprietari.length ? 'Selectează un proprietar salvat…' : 'Niciun proprietar configurat'}</option>
              {allProprietari.map(p=><option key={p.nume} value={p.nume}>{p.nume}{localProprietari.some(l=>l.nume===p.nume) ? ' ✓' : ''}</option>)}
            </select>
            <button className={css.btn} onClick={()=>buletinRef.current?.click()} disabled={buletinBusy}><Icon name="idCard" size={15} />{buletinBusy?'AI citește…':'Citește din buletin'}</button>
            <input ref={buletinRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={hidden} onChange={e=>e.target.files?.[0]&&analyzeBuletin(e.target.files[0])}/>
          </div>
          {localProprietari.length>0 && <div className={css.chips}>{localProprietari.map(p=><span key={p.nume} className={css.chip}>{p.nume} · {p.serieCi} {p.numarCi}<button onClick={()=>deleteLocalProprietar(p.nume)} aria-label={`Șterge ${p.nume}`}>✕</button></span>)}</div>}
          {buletinResult && (
            <div className={css.sub}>
              <div className={css.subTitle}>Proprietar extras din buletin — confirmă și salvează</div>
              <div className={`${css.grid} ${css.g4}`}>
                <input className={css.input} value={bPrenume} onChange={e=>setBPrenume(e.target.value)} placeholder="Prenume"/>
                <input className={css.input} value={bNume} onChange={e=>setBNume(e.target.value)} placeholder="Nume familie"/>
                <input className={css.input} value={bSerie} onChange={e=>setBSerie(e.target.value.toUpperCase())} placeholder="Serie CI"/>
                <input className={css.input} value={bNumar} onChange={e=>setBNumar(e.target.value)} placeholder="Nr. CI"/>
              </div>
              <div className={css.tools}><button className={`${css.btn} ${css.btnPrimary}`} onClick={saveProprietar} disabled={!bPrenume&&!bNume}>Salvează proprietarul</button><button className={css.btn} onClick={()=>setBuletinResult(null)}>Anulează</button></div>
            </div>
          )}
        </section>

        <section className={`${css.card} ${css.step}`}>
          <div className={css.stepHead}><div className={css.stepTitle}><span className={css.stepNr} data-done={pas3}>{pas3 ? '✓' : '3'}</span><div><div className={css.stepName}>Facturi atașate · verificare AI</div><div className={css.stepHint}>AI citește suma și moneda, apartamentul, utilitatea și luna facturii, apoi verifică duplicatele. Facturile în EUR/USD se convertesc în lei la cursul BNR din data facturii.</div></div></div>{pas3 && <span className={css.muted}>Total facturi <b style={{ color:'var(--text-primary)' }}>{monedaLei(sumaFacturiLei)} lei</b></span>}</div>
          <label className={css.drop} data-over={trasFacturi}
            onDragOver={e=>{ e.preventDefault(); setTrasFacturi(true) }} onDragLeave={()=>setTrasFacturi(false)}
            onDrop={e=>{ e.preventDefault(); setTrasFacturi(false); if (!invoiceBusy && e.dataTransfer.files?.length) analyzeInvoices(e.dataTransfer.files) }}>
            <Icon name="download" size={16} style={{ transform:'rotate(180deg)' }} />
            <span>{invoiceBusy ? 'AI analizează facturile…' : <>Trage facturile aici sau <b>alege fișierele</b></>}</span>
            <small>PDF, JPG, PNG · mai multe odată · lei, euro, dolari</small>
            <input ref={invoiceRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={hidden} disabled={invoiceBusy} onChange={e=>{ if (e.target.files?.length) analyzeInvoices(e.target.files); e.target.value='' }}/>
          </label>
          {attachedInvoices.length>0 && <div className={css.inv}>{attachedInvoices.map(i=>{
            const isDuplicate = duplicateWarnings.some(w=>w.docId===i.id)
            const valuta = (i.valuta || 'RON').toUpperCase()
            const ext = (i.fisier_nume.split('.').pop() || '').toUpperCase().slice(0, 4)
            return (
              <div key={i.id} className={css.invRow} data-dup={isDuplicate}>
                <div className={css.invIcon}>{ext || 'DOC'}</div>
                <div style={{ minWidth:0 }}>
                  <div className={css.invName} title={i.fisier_nume}>{isDuplicate && '⚠ '}{i.fisier_nume}</div>
                  <div className={css.invMeta}>{[i.utilitate, i.locatie ? `ap. ${i.locatie}` : null, periodFromFurnizor(i.furnizor) ? `luna ${periodFromFurnizor(i.furnizor)}` : i.data_document ? `fact. ${roDate(i.data_document)}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={css.invSum}>
                  {i.suma != null && <b>{monedaLei(Number(i.suma))} {valuta === 'RON' ? 'lei' : <span className={css.cur}>{valuta}</span>}</b>}
                  {valuta !== 'RON' && <span>{i.suma_ron != null ? `≈ ${monedaLei(Number(i.suma_ron))} lei · BNR ${Number(i.curs_bnr).toFixed(4)}` : 'curs BNR indisponibil — verifică suma'}</span>}
                </div>
                <button className={`${css.iconBtn} ${css.iconDanger}`} onClick={()=>removeAttachedInvoice(i)} disabled={removingInvoiceId===i.id} title="Șterge definitiv factura" aria-label="Șterge factura">{removingInvoiceId===i.id?'…':'✕'}</button>
              </div>
            )
          })}</div>}
          {duplicateWarnings.length>0 && (
            <div className={css.warn}>
              {duplicateWarnings.map(w=>(
                <div key={w.docId}>⚠ {w.text}{w.existingDocumentId && <> <a href={`/api/chitante/document?id=${encodeURIComponent(w.existingDocumentId)}&preview=1`} onClick={e => { e.preventDefault(); deschideDocument(`/api/chitante/document?id=${encodeURIComponent(w.existingDocumentId || "")}`) }}>Vezi factura originală ↗</a></>}</div>
              ))}
            </div>
          )}
        </section>
      </div>

      {error && <div className={css.err} role="alert">{error}</div>}

      <div className={css.final}>
        <label className={css.field}>Beneficiar<input className={css.input} value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} placeholder={owner || 'Beneficiar'}/></label>
        <label className={css.total}><span className={css.field}>Suma de plată</span><span className={css.totalBox}><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" aria-label="Suma în lei"/><span>RON</span></span></label>
        <label className={css.field}>Scopul plății<input className={css.input} value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="ex. Fact. curent - ap. 12 - luna septembrie"/></label>
        <div className={css.finalActions}>
          {editId && <button className={css.btn} onClick={()=>{setEditId('');setAttachedInvoices([]);setPreset('');loadNumber()}}>Anulează</button>}
          <button className={`${css.btn} ${css.btnPrimary}`} onClick={generate} disabled={!(beneficiary||owner)||!amount||!purpose}>{editId?'Salvează':'Generează PDF'} <Icon name="arrowRight" size={14} /></button>
        </div>
      </div>

      {editorDoc && (
        <EditorDispozitie
          key={editorDoc.id}
          dp={editorDoc}
          firma={{ id:selectedFirma.id, nume:selectedFirma.nume, cif:legal.cif, nrRegCom:legal.nrRegCom, adresa:legal.adresa, judet:legal.judet, tara:legal.tara }}
          lunaId={selectedLunaId}
          onClose={()=>setEditorDoc(null)}
          onSaved={()=>{ loadNumber() }}
        />
      )}
    </div>
  )
}
