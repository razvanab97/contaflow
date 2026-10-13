import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { scopeContext, readWorkflow, WorkflowError } from '@/lib/proiect-workflow-store'
import { SALARY_PACKAGE, salaryZipEntry } from '@/lib/salary-package'

export const maxDuration = 120
const MAX_BYTES = 64 * 1024 * 1024

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get('scope') || ''
    if (!scope.startsWith('month-')) throw new WorkflowError('Pachetul de salarizare aparține unei luni de proiect.')
    const { prefix, sb, month } = await scopeContext(req.nextUrl.searchParams.get('firmaId') || '', scope)
    const state = await readWorkflow(prefix)
    const assets = state.assets.filter(asset => SALARY_PACKAGE.some(group => group.task === asset.task))
    if (!assets.length) throw new WorkflowError('Nu există documente de salarizare încărcate în această lună.', 404)
    if (assets.length > 200) throw new WorkflowError('Pachetul depășește limita de 200 de documente.')
    const zip = new JSZip(), used = new Set<string>()
    const notes = [`AB TEXTILE S.R.L. - Documente salarizare`, `Luna de lucru: ${month}`, '', 'Fișiere salvate în rutina lunii; conținutul original este păstrat.', 'Prezența fișierelor nu confirmă completitudinea, semnarea, trimiterea sau acceptarea.', '']
    let total = 0
    for (const group of SALARY_PACKAGE) {
      const documents = assets.filter(asset => asset.task === group.task)
      notes.push(`${group.label}: ${documents.length} fișiere${documents.length ? '' : ' - LIPSESC DOCUMENTE'}`)
      for (const asset of documents) {
        if (!/^[a-f0-9-]{36}$/i.test(asset.id)) throw new WorkflowError('Un document are un identificator invalid; verifică dosarul.')
        const { data, error } = await sb.storage.from('documente').download(`${prefix}/files/${asset.id}`)
        if (error || !data) throw new WorkflowError(`Nu a putut fi citit documentul „${asset.name}”. Arhiva nu a fost generată incomplet.`, 503)
        if (total + data.size > MAX_BYTES) throw new WorkflowError('Documentele depășesc 64 MB. Descarcă fișierele individual.', 413)
        const bytes = new Uint8Array(await data.arrayBuffer())
        total += bytes.byteLength
        if (total > MAX_BYTES) throw new WorkflowError('Documentele depășesc 64 MB. Descarcă fișierele individual.', 413)
        const entry = salaryZipEntry(group.folder, asset.name, used)
        zip.file(entry, bytes)
        notes.push(`  ${entry}`)
      }
      notes.push('')
    }
    zip.file('Citeste-ma.txt', notes.join('\n'))
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const name = `Dosar_salarizare_AB_TEXTILE_luna_lucru_${month}.zip`
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Arhiva nu a putut fi generată.' }, { status: error instanceof WorkflowError ? error.status : 500 })
  }
}
