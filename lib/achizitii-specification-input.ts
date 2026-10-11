export function specificationInput(body: unknown): { product: string; keywords: string; type: string } {
  if (!body || typeof body !== 'object') throw new Error('Date lipsă.')
  const input = body as Record<string, unknown>
  if (typeof input.product !== 'string' || !input.product.trim() || input.product.length > 2000) throw new Error('Completează denumirea achiziției (maximum 2000 caractere).')
  if (typeof input.keywords !== 'string' || !input.keywords.trim() || input.keywords.length > 4000) throw new Error('Scrie câteva cuvinte la specificații (maximum 4000 caractere).')
  if (typeof input.type !== 'string' || !['Produse', 'Servicii', 'Lucrări'].includes(input.type)) throw new Error('Tip de achiziție invalid.')
  return { product: input.product.trim(), keywords: input.keywords.trim(), type: input.type }
}
