// Anexa 1 (Nota de estimare) trebuie sa iasa 1 la 1 cu documentul aprobat (templates/proiect/nota-standard.docx,
// dosar "23. aer conditionat", 12.10.2026). Testul genereaza nota cu exact datele din referinta si compara:
// toate partile pachetului (antet, subsol, logo-uri, stiluri) identice la byte, geometria paginii / grila tabelului /
// randul de cap identice, iar textul fiecarui paragraf identic cu referinta. Plus formatul ingrosat din justificare.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { spawnSync } = require('node:child_process')
const JSZip = require('jszip')
const swc = require('next/dist/build/swc')
const cache = new Map()
function localModule(name) {
  const filename = path.resolve(__dirname, '../lib', name + '.ts')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const code = swc.transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }).code
  const localRequire = id => id.endsWith('.json') ? require(path.resolve(__dirname, '..', id.replace('@/', ''))) : id.startsWith('@/lib/') ? localModule(id.slice(6)) : id.startsWith('./') ? localModule(id.slice(2)) : require(id)
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(localRequire, module, module.exports)
  return module.exports
}
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
// Textul vizibil al unui paragraf; <w:br/> devine "\n" ca sa comparam si rupturile de rand.
const paragraphs = xml => (xml.match(/<w:p(?:\s[^>]*)?>[^]*?<\/w:p>/g) || [])
  .map(p => decode(p.replace(/<w:br\/>/g, '\u0001').replace(/<w:t(?:\s[^>]*)?>([^]*?)<\/w:t>/g, '\u0002$1\u0003').replace(/<[^>]+>/g, '').replace(/\u0002|\u0003/g, '')).replace(/\u0001/g, '\n'))
  .filter(t => t.trim())
  // In referinta specificatiile au spatii ramase in plus inainte de ruptura de rand ("18.000 \n") - nu se vad.
  .map(t => t.replace(/ +\n/g, '\n').trim())

async function main() {
  const { generateProjectDoc } = localModule('proiect-generate')
  const { emptyLine } = localModule('proiect-workflow')
  const { lowestNoteOffer } = localModule('achizitii-offer-prefill')
  const reference = await JSZip.loadAsync(fs.readFileSync(path.resolve(__dirname, '../templates/proiect/nota-standard.docx')))
  const referenceXml = await reference.file('word/document.xml').async('string')

  const specs = 'Putere min: 18.000\nFuncție de încălzire și răcire\nKit instalare inclus'
  const offers = [['ALTEX ROMANIA S.R.L.', 'altex.ro', '2644.55'], ['S.C. PC Garage S.R.L.', 'https://www.pcgarage.ro/', '3223.13'], ['FANPLACE IT S.R.L.', 'www.emag.ro', '2858.68']]
  const draft = { fields: { numar: '1', data: '12.10.2026', achizitie: 'Aer condiționat', tip: 'Produse' }, lines: offers.map(([supplier, website, price]) => ({ ...emptyLine(), supplier, website, product: 'Aer condiționat', specs, qty: '1', price, priceMode: 'net', source: 'Oferta.pdf' })) }
  const cheapest = lowestNoteOffer(draft)
  assert.ok(cheapest, 'justificarea automata trebuie propusa')
  draft.fields.justificare = cheapest.text
  const profile = { beneficiar: 'AB TEXTILE S.R.L.', reprezentant: 'Abunei Elena' }

  const output = await generateProjectDoc('nota', draft, profile)
  const zip = await JSZip.loadAsync(output)
  const xml = await zip.file('word/document.xml').async('string')
  fs.writeFileSync('/tmp/contaflow-nota-aer-conditionat.docx', output)

  // 1. Pachetul: aceleasi fisiere; tot ce nu e corpul documentului, identic la byte.
  const files = z => Object.keys(z.files).filter(n => !z.files[n].dir).sort()
  assert.deepEqual(files(zip), files(reference))
  for (const name of files(reference).filter(n => n !== 'word/document.xml')) assert.deepEqual(await zip.file(name).async('nodebuffer'), await reference.file(name).async('nodebuffer'), name)

  // 2. XML valid, geometria paginii, grila tabelului si randul de cap neschimbate.
  const parsed = spawnSync('/usr/bin/xmllint', ['--noout', '-'], { input: xml, encoding: 'utf8' })
  assert.equal(parsed.status, 0, parsed.stderr)
  for (const tag of ['sectPr', 'tblPr', 'tblGrid']) {
    const pattern = new RegExp(`<w:${tag}(?:\\s[^>]*)?>[^]*?</w:${tag}>`)
    assert.equal(xml.match(pattern)[0], referenceXml.match(pattern)[0], tag)
  }
  const rowPattern = /<w:tr(?:\s[^>]*)?>[^]*?<\/w:tr>/g
  assert.equal(xml.match(rowPattern).length, 4)
  assert.equal(xml.match(rowPattern)[0], referenceXml.match(rowPattern)[0], 'randul de cap al tabelului')
  assert.doesNotMatch(xml, /%%/)

  // 3. Textul: fiecare paragraf identic cu referinta, in aceeasi ordine.
  assert.deepEqual(paragraphs(xml), paragraphs(referenceXml))

  // 4. Justificarea: "NR 1" si "2644,55 lei fara TVA" ingrosate, restul normal - ca in referinta.
  const justificare = xml.match(/<w:p(?:\s[^>]*)?>(?:(?!<\/w:p>)[^])*În urma analizei[^]*?<\/w:p>/)[0]
  const bold = [...justificare.matchAll(/<w:r>(<w:rPr>[^]*?<\/w:rPr>)<w:t[^>]*>([^<]*)<\/w:t><\/w:r>/g)].filter(m => m[1].includes('<w:b/>')).map(m => m[2])
  assert.deepEqual(bold, ['NR 1', '2644,55 lei fara TVA ']) // spatiul de dupa TVA e ingrosat in referinta
  // Formatarea exacta a fragmentelor, comparata cu run-urile din referinta.
  const rprOf = (doc, fragment) => doc.match(new RegExp(`<w:r(?:\\s[^>]*)?>(<w:rPr>(?:(?!</w:rPr>)[^])*</w:rPr>)<w:t[^>]*>${fragment}`))[1]
  assert.equal(rprOf(xml, 'NR 1'), rprOf(referenceXml, 'NR '), 'formatarea NR')
  assert.equal(rprOf(xml, '2644,55 lei fara TVA'), rprOf(referenceXml, '2644,55'), 'formatarea valorii')
  assert.equal(rprOf(xml, '3</w:t>'), rprOf(referenceXml, '3</w:t>'), 'cifra ofertelor ingrosata')

  // 5. Fara site / fara specificatii cu liniuta: randul ramane corect (fara paranteze goale), liniuta se adauga.
  const minimal = await generateProjectDoc('nota', { ...draft, lines: draft.lines.map(l => ({ ...l, website: '' })) }, profile)
  const minimalXml = await (await JSZip.loadAsync(minimal)).file('word/document.xml').async('string')
  assert.doesNotMatch(minimalXml, /\(\)/)
  assert.ok(paragraphs(minimalXml).includes('ALTEX ROMANIA S.R.L.'))
  assert.ok(paragraphs(minimalXml).includes('- Putere min: 18.000\n- Funcție de încălzire și răcire\n- Kit instalare inclus'))

  console.log('OK: Anexa 1 iese 1 la 1 cu documentul aprobat (aer condiționat, 12.10.2026) - pachet, pagină, tabel, text și formatare. Fișier: /tmp/contaflow-nota-aer-conditionat.docx')
}
module.exports = { localModule }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
