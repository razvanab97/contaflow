#!/usr/bin/env node
// Urmărește un folder de pe acest Mac (implicit ~/Desktop/Facturi ContaFlow) și urcă
// automat orice PDF/JPG/PNG găsit acolo într-o coadă globală (inbox_watch_files),
// fără să știe firma — firma se detectează abia la apăsarea „Sincronizează” din
// Dashboard (vezi app/api/inbox-facturi/global/sync/route.ts).
//
// Rulare: node scripts/watch-facturi-locale.js
// Oprire: Ctrl+C

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.join(__dirname, '..')
const envPath = path.join(ROOT, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Lipsesc NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY din .env.local')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

const WATCH_DIR = process.env.CONTAFLOW_WATCH_DIR || path.join(os.homedir(), 'Desktop', 'Facturi ContaFlow')
const DONE_DIR = path.join(WATCH_DIR, '_incarcat')
const ERROR_DIR = path.join(WATCH_DIR, '_erori')
const STAGING_DIR = path.join(WATCH_DIR, '_procesare')
const POLL_MS = 5000
const MIME_BY_EXT = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }

for (const dir of [WATCH_DIR, DONE_DIR, ERROR_DIR, STAGING_DIR]) fs.mkdirSync(dir, { recursive: true })

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('ro-RO')}] ${msg}`)
}

function safeName(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]+/g, '_').slice(0, 120) || 'document'
}

function moveTo(dir, filePath, fileName) {
  const dest = path.join(dir, `${Date.now()}_${fileName}`)
  fs.renameSync(filePath, dest)
  return dest
}

// Fara asta, un singur apel Supabase care ramane agatat (retea proasta, wifi cazut la mijlocul
// upload-ului) ar bloca la infinit tot watcher-ul - niciun fisier nou nu s-ar mai procesa
// niciodata, fara nicio eroare vizibila in log, exact ca un watcher "mort" din exterior.
const NETWORK_TIMEOUT_MS = 20000
function withTimeout(promise, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout (${NETWORK_TIMEOUT_MS / 1000}s) la ${label}`)), NETWORK_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Ținem minte dimensiunea fișierelor între două citiri, ca să nu procesăm un fișier
// încă în curs de copiere (ex. drag&drop dintr-un Finder pe rețea).
const stableSizes = new Map()

async function processFile(fileName) {
  const filePath = path.join(WATCH_DIR, fileName)
  const ext = path.extname(fileName).toLowerCase()
  const mediaType = MIME_BY_EXT[ext]
  if (!mediaType) {
    log(`Tip neacceptat, mut în _erori: ${fileName}`)
    moveTo(ERROR_DIR, filePath, fileName)
    stableSizes.delete(fileName)
    return
  }

  // Preluăm fișierul într-un folder privat de procesare ÎNAINTE de orice - dacă altceva
  // atinge folderul urmărit între timp (alt watcher pornit din greșeală, sincronizare
  // Google Drive/iCloud pe Desktop etc.), lucrăm deja pe propria copie și nu-l mai putem
  // pierde. Dacă renameSync eșuează, altcineva l-a preluat deja - îl ignorăm la acest tick.
  const stagingPath = path.join(STAGING_DIR, `${Date.now()}_${safeName(fileName)}`)
  try {
    fs.renameSync(filePath, stagingPath)
  } catch {
    stableSizes.delete(fileName)
    return
  }
  const restoreToWatch = () => { try { fs.renameSync(stagingPath, filePath) } catch {} }

  let bytes
  try {
    bytes = fs.readFileSync(stagingPath)
  } catch (err) {
    log(`Nu am putut citi fișierul preluat, îl pun înapoi: ${fileName} (${err.message})`)
    restoreToWatch()
    return
  }
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const storagePath = `_watch-global/${hash.slice(0, 12)}_${safeName(fileName)}`

  let uploadError
  try {
    ;({ error: uploadError } = await withTimeout(
      sb.storage.from('documente').upload(storagePath, bytes, { contentType: mediaType, upsert: true }),
      'urcare storage'
    ))
  } catch (err) {
    uploadError = err
  }
  if (uploadError) {
    log(`Eroare la urcare, reîncerc mai târziu: ${fileName} (${uploadError.message})`)
    restoreToWatch()
    return
  }

  let inserted, insertError
  try {
    ;({ data: inserted, error: insertError } = await withTimeout(
      sb.from('inbox_watch_files').insert({
        fisier_path: storagePath,
        fisier_nume: fileName,
        fisier_tip: mediaType,
        fisier_marime: bytes.length,
        document_hash: hash,
        status: 'pending',
      }).select('id').single(),
      'înregistrare bază de date'
    ))
  } catch (err) {
    insertError = err
  }
  const isDuplicate = !!insertError && /duplicate key|unique constraint/i.test(insertError.message || '')
  if (insertError && !isDuplicate) {
    log(`Eroare la înregistrare, reîncerc mai târziu: ${fileName} (${insertError.message})`)
    restoreToWatch()
    return
  }
  // Chiar fara eroare, ne asiguram ca randul chiar exista inainte sa consideram fisierul
  // "in siguranta" - altfel un raspuns neasteptat de la Supabase ar putea muta fisierul
  // in _incarcat fara nicio urma in baza de date.
  if (!isDuplicate && !inserted?.id) {
    log(`Înregistrare neconfirmată, reîncerc mai târziu: ${fileName}`)
    restoreToWatch()
    return
  }
  log(isDuplicate ? `Deja în coadă (fișier identic urcat anterior): ${fileName}` : `Urcat, în așteptare de sincronizare: ${fileName}`)
  moveTo(DONE_DIR, stagingPath, fileName)
  stableSizes.delete(fileName)
}

// Fisierele mutate chiar de noi in _incarcat incep mereu cu "{timestamp}_" (vezi moveTo).
// Orice altceva ajuns acolo e pus de utilizator din greseala (ex. Finder a ramas deschis
// in _incarcat cand a salvat un PDF nou) - _incarcat e arhiva "deja procesat", nu e
// urmarita de watcher, deci fisierul ar ramane invizibil la nesfarsit fara asta. Il
// recuperam automat inapoi in folderul urmarit, ca sa intre normal in coada.
const OWN_PREFIX = /^\d{13}_/
function recoverMisplacedFiles() {
  let entries
  try {
    entries = fs.readdirSync(DONE_DIR, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || OWN_PREFIX.test(entry.name)) continue
    const from = path.join(DONE_DIR, entry.name)
    const to = path.join(WATCH_DIR, entry.name)
    if (fs.existsSync(to)) continue // deja e un fisier cu acelasi nume in asteptare - nu suprascriem, il luam la urmatorul tick
    try {
      fs.renameSync(from, to)
      log(`Fișier găsit rătăcit în _incarcat (pus acolo din greșeală), recuperat pentru procesare: ${entry.name}`)
    } catch {}
  }
}

// Stergere ceruta din platforma ("Sterge" pe o factura venita din acest folder): randurile din coada
// marcate sterge_local -> fisierul local (cautat dupa nume si verificat dupa hash) e mutat in Cos
// (Trash), recuperabil, iar randul iese din coada. Daca watcher-ul nu ruleaza, se face la pornire.
const TRASH_DIR = path.join(os.homedir(), '.Trash')
const hashCache = new Map() // cale -> { mtimeMs, hash }
function hashFisier(cale) {
  const st = fs.statSync(cale)
  const c = hashCache.get(cale)
  if (c && c.mtimeMs === st.mtimeMs) return c.hash
  const hash = crypto.createHash('sha256').update(fs.readFileSync(cale)).digest('hex')
  hashCache.set(cale, { mtimeMs: st.mtimeMs, hash })
  return hash
}
function gasesteLocal(rand) {
  const variante = new Set([rand.fisier_nume, safeName(rand.fisier_nume)])
  const toate = []
  for (const dir of [DONE_DIR, ERROR_DIR, WATCH_DIR]) {
    let e = []
    try { e = fs.readdirSync(dir, { withFileTypes: true }) } catch {}
    for (const f of e) if (f.isFile() && !f.name.startsWith('.')) toate.push(path.join(dir, f.name))
  }
  const dupaNume = toate.filter(c => { const n = path.basename(c); return [...variante].some(v => n === v || n.endsWith(`_${v}`)) })
  // intai dupa nume (verificat cu hash), apoi orice fisier cu acelasi continut
  for (const c of [...dupaNume, ...toate.filter(x => !dupaNume.includes(x))]) {
    try { if (hashFisier(c) === rand.document_hash) return c } catch {}
  }
  return null
}
function mutaInCos(cale) {
  let dest = path.join(TRASH_DIR, path.basename(cale))
  if (fs.existsSync(dest)) dest = path.join(TRASH_DIR, `${Date.now()}_${path.basename(cale)}`)
  try { fs.renameSync(cale, dest) } catch { fs.copyFileSync(cale, dest); fs.unlinkSync(cale) }
}
let stergereIndisponibila = false
async function proceseazaStergeri() {
  if (stergereIndisponibila) return
  let randuri, error
  try {
    ;({ data: randuri, error } = await withTimeout(
      sb.from('inbox_watch_files').select('id,fisier_nume,fisier_path,document_hash').eq('sterge_local', true).limit(50),
      'citire ștergeri'
    ))
  } catch (err) { error = err }
  if (error) {
    if (/sterge_local/.test(error.message || '')) { stergereIndisponibila = true; log('Ștergerea locală nu e activă încă (lipsește coloana sterge_local - rulează migrarea SQL).') }
    return
  }
  for (const r of randuri || []) {
    const local = gasesteLocal(r)
    try {
      if (local) { mutaInCos(local); log(`Șters din platformă -> mutat în Coș: ${path.basename(local)}`) }
      else log(`Șters din platformă; fișierul local nu mai există (deja șters/mutat): ${r.fisier_nume}`)
    } catch (err) {
      log(`Nu am putut muta în Coș ${r.fisier_nume}: ${err.message} - reîncerc`)
      continue
    }
    try {
      await withTimeout(sb.storage.from('documente').remove([r.fisier_path]), 'ștergere storage')
      await withTimeout(sb.from('inbox_watch_files').delete().eq('id', r.id), 'ștergere din coadă')
    } catch (err) { log(`Fișierul e în Coș, dar rândul din coadă rămâne (${err.message})`) }
  }
}

async function tick() {
  recoverMisplacedFiles()
  await proceseazaStergeri()
  let entries
  try {
    entries = fs.readdirSync(WATCH_DIR, { withFileTypes: true })
  } catch (err) {
    log(`Nu pot citi folderul: ${err.message}`)
    return
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue
    const filePath = path.join(WATCH_DIR, entry.name)
    let size
    try {
      size = fs.statSync(filePath).size
    } catch {
      continue
    }
    const prev = stableSizes.get(entry.name)
    if (prev !== undefined && prev === size) {
      try {
        await processFile(entry.name)
      } catch (err) {
        log(`Eroare neașteptată la ${entry.name}: ${err.message}`)
      }
    } else {
      stableSizes.set(entry.name, size)
    }
  }
}

log(`Urmăresc: ${WATCH_DIR}`)
log('Pune aici PDF/JPG/PNG cu facturi — se urcă automat în coadă, pregătite de sincronizare.')
log('Apasă „Sincronizează fișiere din Personal Computer" pe Dashboard ca să le trimiți către firmele corecte.')
log('Oprești cu Ctrl+C.')

let stopped = false
process.on('SIGINT', () => { stopped = true; log('Oprit.'); process.exit(0) })

// Bataie de inima in log la fiecare ~2 minute - fara ea, un watcher blocat (ex. intr-un tick()
// care nu se mai termina din alt motiv decat retea) arata identic in log cu unul care sta
// linistit fara fisiere noi. Cu ea, o tacere neasteptata in log chiar inseamna ca s-a blocat.
const HEARTBEAT_TICKS = Math.round(120000 / POLL_MS)
let tickCount = 0

;(async function loop() {
  while (!stopped) {
    await tick()
    tickCount++
    if (tickCount % HEARTBEAT_TICKS === 0) log('(activ, aștept fișiere noi)')
    await new Promise(r => setTimeout(r, POLL_MS))
  }
})()
