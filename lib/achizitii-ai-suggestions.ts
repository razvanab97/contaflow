import type { FormKind } from './proiect-workflow'

export interface PurchaseAiSuggestion { field: 'conditii' | 'specs'; line?: number; value: string; reason: string }

export function parsePurchaseAiSuggestions(raw: string, kind: FormKind, lineCount: number): PurchaseAiSuggestion[] {
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  if (!Array.isArray(parsed.suggestions)) throw new Error('AI-ul nu a returnat o listă validă de recomandări.')
  const seen = new Set<string>()
  const result: PurchaseAiSuggestion[] = []
  for (const item of parsed.suggestions.slice(0, 21)) {
    if (!item || !['conditii', 'specs'].includes(item.field) || typeof item.value !== 'string' || !item.value.trim() || item.value.length > 4000 || typeof item.reason !== 'string' || item.reason.length > 500) continue
    if (item.field === 'conditii' && kind !== 'oferta') continue
    if (item.field === 'specs' && (!Number.isInteger(item.line) || item.line < 0 || item.line >= lineCount)) continue
    const key = `${item.field}:${item.field === 'specs' ? item.line : ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ field: item.field, ...(item.field === 'specs' ? { line: item.line } : {}), value: item.value.trim(), reason: item.reason.trim() })
  }
  return result
}
