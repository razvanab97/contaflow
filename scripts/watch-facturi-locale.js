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

  const { error: uploadError } = await sb.storage.from('documente').upload(storagePath, bytes, { contentType: mediaType, upsert: true })
  if (uploadError) {
    log(`Eroare la urcare, reîncerc mai târziu: ${fileName} (${uploadError.message})`)
    restoreToWatch()
    return
  }

  const { data: inserted, error: insertError } = await sb.from('inbox_watch_files').insert({
    fisier_path: storagePath,
    fisier_nume: fileName,
    fisier_tip: mediaType,
    fisier_marime: bytes.length,
    document_hash: hash,
    status: 'pending',
  }).select('id').single()
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

async function tick() {
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

;(async function loop() {
  while (!stopped) {
    await tick()
    await new Promise(r => setTimeout(r, POLL_MS))
  }
})()
