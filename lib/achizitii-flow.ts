export type PurchaseFlow = 'cerere' | 'trei_oferte'
export function purchaseFlow(note: string | null | undefined): PurchaseFlow | null {
  const value = note?.match(/\[flux-achizitie:(cerere|trei_oferte)\]/)?.[1]
  return value === 'cerere' || value === 'trei_oferte' ? value : null
}
export function withPurchaseFlow(note: string | null | undefined, flow: PurchaseFlow): string {
  return `[flux-achizitie:${flow}] ${(note || '').replace(/\[flux-achizitie:(cerere|trei_oferte)\]\s*/g, '').trim()}`.trim()
}
