const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const swc = require('next/dist/build/swc')
const { NextRequest } = require('next/server')
const { PDFDocument } = require('pdf-lib')

const root = path.resolve(__dirname, '..')
const cache = new Map()
const stored = []
const files = new Map()
let aiType = 'borderou'
let reservationResult = null
let sb = {
  storage: { from: () => ({ upload: async (key, bytes) => { files.set(key, Buffer.from(bytes)); return {} }, remove: async () => ({}) }) },
  from: () => ({ insert: row => ({ select: () => ({ single: async () => { const doc = { id: String(stored.length + 1), ...row }; stored.push(doc); return { data: doc } } }) }) }),
}
class MockAnthropic {
  messages = { create: async () => ({ content: [{ type: 'text', text: JSON.stringify(reservationResult || { furnizor: 'Booking.com', tipDocumentBooking: aiType }) }] }) }
}
const mocks = {
  '@/lib/supabase/server': { getServiceSupabase: () => sb },
  '@/lib/denumire-document': { finalizeazaDocument: async () => null },
  '@/lib/eonInvoice': { isFirstPageOnlyInvoice: () => false, isFirstPageOnlyPdf: async () => false },
  '@/lib/suma-ron-pdf': { sumaRonDinPdf: async () => null },
  '@anthropic-ai/sdk': MockAnthropic,
  '@/lib/pdfBatch': { extractInBatches: async (bytes, size, extract) => extract(bytes) },
  '@/lib/stardeskVerify': { computeVerification: async () => ({ ok: true }) },
  '@/lib/notePdf': { generateNotePdfBytes: async () => null },
  '@/lib/discrepante-lista': { generateDiscrepantePdfBytes: async () => null },
  '@/lib/bonuriPdf': { generateBonuriPdfBytes: async () => null },
  '@/lib/firma-config': { FIRMA_CONFIGS: { test: { module: ['booking-facturi'] } }, MODULE_DEFS: {} },
}
function load(relative) {
  const filename = path.resolve(root, relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(key => {
    if (mocks[key]) return mocks[key]
    if (key.startsWith('@/')) return load(key.slice(2) + '.ts')
    if (key.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(filename), key + '.ts')))
    return require(key)
  }, module, module.exports)
  return module.exports
}
async function fixture(text) {
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText(text, { x: 20, y: 750, size: 10 })
  return Buffer.from(await pdf.save())
}
async function main() {
  const helpers = load('lib/booking-documents.ts')
  assert.equal(helpers.normalizeBookingType('borderou'), null)
  assert.equal(helpers.normalizeBookingType('inventat'), null)
  assert.equal(helpers.bookingTypeFromText('Reservation Statement - 2026-10 Invoice number'), 'borderou-contabil')
  assert.equal(helpers.bookingTypeFromText('Booking.com Sumarul plăților pentru octombrie'), 'borderou-plati')
  assert.equal(helpers.bookingTypeFromText('Factura Booking.com Suma totala de plata'), null)
  assert.equal(helpers.bookingTypeFromText('Airbnb Payment statement'), null)
  const readPdf = load('lib/booking-document-pdf.ts').identifyBookingPdf
  const upload = load('app/api/chitante/route.ts').POST
  for (const [name, title, type, section] of [
    ['reservation_statements_overview_2026-10-7.pdf', 'Reservation Statement - 2026-10\nSkyPort ID: 15331624', 'borderou-contabil', 'booking-borderou-contabil'],
    ['2026-10-2.pdf', 'Booking.com Sumarul platilor pentru octombrie\nNumarul unitatii de cazare\n15331624', 'borderou-plati', 'booking-borderou-lucru'],
  ]) {
    const original = path.join(os.homedir(), 'Downloads', name)
    const bytes = fs.existsSync(original) ? fs.readFileSync(original) : await fixture(title)
    assert.deepEqual(await readPdf(bytes), { type, code: '15331624' })
    const fd = new FormData()
    fd.set('file', new File([bytes], name, { type: 'application/pdf' }))
    fd.set('firmaId', 'test-firma'); fd.set('lunaId', 'test-luna'); fd.set('section', 'booking-auto')
    const response = await upload(new NextRequest('http://localhost/api/chitante', { method: 'POST', body: fd }))
    assert.equal(response.status, 200, JSON.stringify(await response.json()))
    const doc = stored.at(-1)
    assert.equal(doc.tip_document, type)
    assert.equal(doc.cod_unitate_booking, '15331624')
    assert.ok(doc.fisier_path.includes(`/${section}/`))
    assert.equal(doc.in_zip, type === 'borderou-contabil')
    assert.deepEqual(files.get(doc.fisier_path), bytes)
  }
  aiType = null
  const fd = new FormData()
  fd.set('file', new File([await fixture('Document necunoscut')], 'unknown.pdf', { type: 'application/pdf' }))
  fd.set('firmaId', 'test-firma'); fd.set('lunaId', 'test-luna'); fd.set('section', 'booking-auto')
  const response = await upload(new NextRequest('http://localhost/api/chitante', { method: 'POST', body: fd }))
  assert.equal(response.status, 422)
  assert.equal(stored.length, 2)
  for (const format of ['pdf', 'zip']) {
    const source = fs.readFileSync(path.join(root, `app/api/export/${format}/route.ts`), 'utf8')
    assert.ok(source.includes(".not('fisier_path', 'like', '%/booking-borderou-lucru/%')"))
    assert.ok(source.includes("p.includes('/booking-borderou-contabil/')"))
  }
  const verification = fs.readFileSync(path.join(root, 'app/api/5stardesk/verifica/route.ts'), 'utf8')
  const selection = verification.match(/\.or\('([^']+)'\)/)[1]
  assert.ok(selection.includes('/booking-borderou-lucru/'))
  assert.ok(selection.includes('/booking-borderou/'))
  assert.ok(!selection.includes('/booking-borderou-contabil/'))
  assert.ok(verification.includes('!bookingCodes.has(code)'))
  const documents = [
    { id: 'accounting', fisier_path: 'f/m/booking-borderou-contabil/a.pdf' },
    { id: 'working-1', fisier_path: 'f/m/booking-borderou-lucru/b.pdf' },
    { id: 'working-2', fisier_path: 'f/m/booking-borderou-lucru/c.pdf' },
  ]
  const reservations = [{ document_id: 'old', platforma: 'booking', cod_rezervare: '111' }]
  const downloaded = []
  reservationResult = { rezervari: [
    { codRezervare: '111', suma: 100 },
    { codRezervare: '222', suma: 200 },
    { codRezervare: '222', suma: 200 },
    { codRezervare: '', suma: 999 },
  ] }
  sb = {
    storage: { from: () => ({ download: async key => { downloaded.push(key); return { data: new Blob(['test']) } } }) },
    from: table => {
      let rows = table === 'documente' ? documents : table === 'borderou_rezervari' ? [...reservations] : []
      const query = {
        select: () => query, eq: () => query,
        like: () => { rows = []; return query },
        or: value => {
          const paths = value.split(',').map(part => part.split('.like.%')[1].slice(0, -1))
          rows = rows.filter(row => paths.some(p => row.fisier_path.includes(p)))
          return query
        },
        insert: async additions => { reservations.push(...additions); return {} },
        then: resolve => resolve({ data: rows }),
      }
      return query
    },
  }
  const verify = load('app/api/5stardesk/verifica/route.ts').POST
  const result = await verify(new NextRequest('http://localhost/api/5stardesk/verifica', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firmaId: 'test', lunaId: 'month', categorie: 'client' }),
  }))
  assert.equal(result.status, 200)
  assert.equal(downloaded.length, 2)
  assert.ok(downloaded.every(p => p.includes('/booking-borderou-lucru/')))
  assert.deepEqual(reservations.map(row => row.cod_rezervare), ['111', '222'])
  const exportDownloads = []
  sb = {
    storage: { from: () => ({ download: async key => { exportDownloads.push(key); return { data: new Blob([files.get(key)]) } } }) },
    from: table => {
      let rows = table === 'documente' ? [...stored] : []
      const query = {
        select: () => query, eq: () => query, is: () => query, order: () => query,
        not: (field, operator, value) => { rows = rows.filter(row => !String(row[field] || '').includes(value.replaceAll('%', ''))); return query },
        then: resolve => resolve({ data: rows }),
      }
      return query
    },
  }
  for (const format of ['pdf', 'zip']) {
    const exportResult = await load(`app/api/export/${format}/route.ts`).POST(new NextRequest(`http://localhost/api/export/${format}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId: 'test-firma', lunaId: 'test-luna', firmaSlug: 'test', firmaNume: 'Test', luna: '2026-11' }),
    }))
    assert.equal(exportResult.status, 200)
    const bytes = Buffer.from(await exportResult.arrayBuffer())
    if (format === 'pdf') assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2)
    else {
      const zip = await require('jszip').loadAsync(bytes)
      const entries = Object.values(zip.files).filter(entry => !entry.dir)
      assert.equal(entries.length, 1)
      assert.ok(entries[0].name.includes(stored[0].fisier_nume))
    }
  }
  assert.equal(exportDownloads.length, 2)
  assert.ok(exportDownloads.every(p => p.includes('/booking-borderou-contabil/')))
  console.log('PASS: real PDFs (or fixtures), deterministic upload classification, property code, unchanged bytes, unreadable rejection, working-only extraction, duplicate reservation protection, actual accounting PDF/ZIP generation without internal statements, legacy compatibility.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
