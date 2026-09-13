// Model generic de document - schema (structura) separata de valori (datele completate).
// Scopul: orice document viitor (raport trimestrial, cerere, proces verbal etc.) sa poata
// refolosi acelasi DocumentWorkspace, definind doar propriul DocumentTemplate.
// Nimic de aici nu stie despre "AB Textile" sau "raport lunar" in mod specific.

export type DocumentFieldType = 'text' | 'textarea' | 'richtext' | 'list' | 'date' | 'date-range' | 'select'

export interface DocumentFieldSchema {
  id: string
  key: string
  label: string
  type: DocumentFieldType
  required?: boolean
  placeholder?: string
}

export interface DocumentSectionSchema {
  id: string
  title: string
  description?: string
  fields: DocumentFieldSchema[]
  collapsible?: boolean
}

export interface DocumentTemplate {
  id: string
  title: string
  description?: string
  sections: DocumentSectionSchema[]
  /** Daca generatorul de document nu suporta sectiuni noi arbitrare, ramane false si
   * butonul "+ Adaugă secțiune" nu se afiseaza deloc - vezi ReportEditor. */
  allowCustomSections?: boolean
}

export interface ListItem {
  id: string
  text: string
}

/** Valorile completate de utilizator, indexate dupa `key`-ul campului din template.
 * Un camp de tip "list" are ca valoare ListItem[], restul au string. */
export type DocumentValues = Record<string, string | ListItem[]>

let itemSeq = 0
function newItemId() {
  itemSeq += 1
  return `i${Date.now().toString(36)}${itemSeq}`
}

/** Puntea catre backend-ul existent, care stocheaza listele ca text cu newline intre
 * elemente - nu rupem API-ul vechi, doar convertim la/de la reprezentarea UI noua. */
export function parseMultilineToItems(text: string): ListItem[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(t => ({ id: newItemId(), text: t }))
}

export function itemsToMultiline(items: ListItem[]): string {
  return items.map(i => i.text).join('\n')
}
