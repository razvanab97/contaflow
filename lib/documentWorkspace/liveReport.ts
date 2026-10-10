import type { DocumentValues } from './types'
import type { ReportExtraSection } from './reportSections'

interface CustomValue { id: string; cheie: string; valoare: string; eticheta?: string }

export function liveReportHtml(template: string, values: DocumentValues, custom: CustomValue[], sections: ReportExtraSection[], editable: boolean): string {
  const doc = new DOMParser().parseFromString(template, 'text/html')
  const labels: Record<string, string> = { perioada: 'Perioada de raportare', autorizatii: 'Autorizații necesare', obiective: 'Obiective realizate', activitati: 'Activități derulate' }
  custom.forEach(value => { labels[`custom:${value.id}`] = value.eticheta || 'Câmp suplimentar' })
  sections.forEach(section => { labels[`section:${section.id}:title`] = 'Titlul secțiunii'; labels[`section:${section.id}:content`] = `Conținut: ${section.title}` })
  const field = (key: string, value: string, line?: number) => {
    const span = doc.createElement('span')
    span.textContent = value
    span.dataset.reportField = key
    if (line !== undefined) span.dataset.reportLine = String(line)
    if (editable) { span.contentEditable = 'true'; span.setAttribute('role', 'textbox'); span.setAttribute('aria-label', labels[key] || 'Câmp editabil'); span.spellcheck = true }
    span.style.whiteSpace = 'pre-wrap'
    return span
  }
  const replaceText = (marker: string, key: string, value: string) => {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent || ''
      const at = text.indexOf(marker)
      if (at < 0) continue
      const fragment = doc.createDocumentFragment()
      fragment.append(text.slice(0, at), field(key, value), text.slice(at + marker.length))
      node.parentNode?.replaceChild(fragment, node)
      break
    }
  }
  replaceText('%%PERIOADA%%', 'perioada', String(values.perioada || ''))
  for (const key of ['autorizatii', 'obiective', 'activitati']) {
    const marker = `%%${key.toUpperCase()}%%`
    const paragraph = Array.from(doc.querySelectorAll('p, li')).find(p => p.textContent?.includes(marker))
    if (!paragraph) continue
    const items = Array.isArray(values[key]) ? values[key] : []
    const list = doc.createElement('ul')
    items.forEach((item, index) => {
      const li = doc.createElement('li')
      li.append(field(key, item.text, index))
      list.append(li)
    })
    const markerItem = paragraph.closest('li')
    if (markerItem) markerItem.replaceWith(...Array.from(list.children))
    else paragraph.replaceWith(list)
  }
  for (const value of custom) replaceText(`%%CUSTOM_${value.cheie}%%`, `custom:${value.id}`, value.valoare)
  const table = Array.from(doc.querySelectorAll('table')).find(t => /4\.\s*(In|În) perioada/i.test(t.textContent || ''))
  const signature = Array.from(doc.querySelectorAll('p')).find(p => /reprezentant legal/i.test(p.textContent || ''))
  for (const section of sections) {
    const container = doc.createElement(table ? 'td' : 'div')
    const title = doc.createElement('p')
    const strong = doc.createElement('strong')
    strong.append(field(`section:${section.id}:title`, section.title))
    title.append(strong)
    const content = doc.createElement('p')
    content.append(field(`section:${section.id}:content`, section.content))
    container.append(title, content)
    if (table) { const row = doc.createElement('tr'); row.append(container); (table.tBodies[0] || table).append(row) }
    else if (signature) signature.before(container)
    else doc.body.append(container)
  }
  return doc.body.innerHTML
}
