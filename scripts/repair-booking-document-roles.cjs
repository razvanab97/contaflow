const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createHash } = require('node:crypto')
const { createClient } = require('@supabase/supabase-js')
const swc = require('next/dist/build/swc')

const cache = new Map()
function local(name) {
  if (cache.has(name)) return cache.get(name).exports
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  const module = { exports: {} }; cache.set(name, module)
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(key => {
    if (key === '@/lib/ai/campuri-document') return {}
    return key.startsWith('./') ? local(key.slice(2)) : require(key)
  }, module, module.exports)
  return module.exports
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

async function main() {
  const args = process.argv.slice(2)
  const value = key => args[args.indexOf(key) + 1]
  if (!args.includes('--firma-id') || !args.includes('--work-month') || !args.includes('--expected-count')) throw new Error('Required: --firma-id ID --work-month YYYY-MM --expected-count N [--apply]')
  const firmaId = value('--firma-id'), workMonth = value('--work-month'), expectedCount = Number(value('--expected-count'))
  if (!/^\d{4}-\d{2}$/.test(workMonth) || !Number.isInteger(expectedCount) || expectedCount < 1) throw new Error('Invalid scope')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: month, error: monthError } = await sb.from('luni_contabile').select('id').eq('firma_id', firmaId).eq('luna', `${workMonth}-01`).single()
  if (monthError) throw monthError
  const { data: docs, error } = await sb.from('documente')
    .select('id,firma_id,luna_id,tip_document,fisier_path,fisier_nume,fisier_tip,numar_document,furnizor,data_document,suma,valuta,cod_unitate_booking,in_zip')
    .eq('firma_id', firmaId).eq('luna_id', month.id)
    .or('fisier_path.like.%/booking-borderou-contabil/%,fisier_path.like.%/booking-borderou-lucru/%')
  if (error) throw error
  if (docs.length !== expectedCount) throw new Error(`Expected ${expectedCount} documents, found ${docs.length}; no changes applied`)
  const { identifyBookingPdf } = local('booking-document-pdf')
  const { bookingSection } = local('booking-documents')
  const { numeDescriptiv, furnizorAfisat } = local('denumire-document')
  const plan = []
  for (const doc of docs) {
    if (doc.fisier_tip !== 'application/pdf') throw new Error(`Non-PDF document ${doc.id}; no changes applied`)
    const { data: file, error: downloadError } = await sb.storage.from('documente').download(doc.fisier_path)
    if (downloadError) throw downloadError
    const bytes = Buffer.from(await file.arrayBuffer())
    const identified = await identifyBookingPdf(bytes)
    if (!identified.code || !['borderou-rezervari', 'borderou-plati'].includes(identified.type)) throw new Error(`Ambiguous PDF ${doc.id}; no changes applied`)
    const patch = {
      tip_document: identified.type,
      cod_unitate_booking: identified.code,
      in_zip: identified.type === 'borderou-plati',
      fisier_path: `${firmaId}/${month.id}/${bookingSection(identified.type)}/${doc.id}.pdf`,
      ...(identified.amount != null ? { suma: identified.amount } : {}),
      fisier_nume: numeDescriptiv({ firma: 'ABXHomes', tip: identified.type, numar: doc.numar_document, furnizor: furnizorAfisat(doc.furnizor), data: doc.data_document, suma: identified.amount ?? doc.suma, valuta: doc.valuta, extensie: 'pdf' }),
    }
    plan.push({ doc, bytes, patch, sha256: hash(bytes) })
  }
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', workMonth, count: plan.length, documents: plan.map(({ doc, patch, sha256 }) => ({ id: doc.id, code: patch.cod_unitate_booking, before: doc.tip_document, after: patch.tip_document, export: patch.in_zip, amount: patch.suma ?? doc.suma, name: patch.fisier_nume, sha256 })) }, null, 2))
  if (!args.includes('--apply')) return
  for (const { doc, bytes, patch, sha256 } of plan) {
    // Keep the old storage object as a rollback copy; never delete the source PDF.
    if (doc.fisier_path !== patch.fisier_path) {
      const { error: uploadError } = await sb.storage.from('documente').upload(patch.fisier_path, bytes, { contentType: 'application/pdf', upsert: false })
      if (uploadError) {
        const { data: existing } = await sb.storage.from('documente').download(patch.fisier_path)
        if (!existing || hash(Buffer.from(await existing.arrayBuffer())) !== sha256) throw uploadError
      }
    }
    const { data: saved, error: updateError } = await sb.from('documente').update(patch)
      .eq('id', doc.id).eq('firma_id', firmaId).eq('luna_id', month.id).eq('fisier_path', doc.fisier_path).eq('tip_document', doc.tip_document)
      .select('id,tip_document,fisier_path,fisier_nume,in_zip').single()
    if (updateError) throw updateError
    const { data: checked, error: checkError } = await sb.storage.from('documente').download(saved.fisier_path)
    if (checkError || !checked || hash(Buffer.from(await checked.arrayBuffer())) !== sha256) throw new Error(`PDF verification failed: ${doc.id}`)
    console.log(`Verified ${saved.id}: ${saved.tip_document}, export=${saved.in_zip}, bytes unchanged`)
  }
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1 })
