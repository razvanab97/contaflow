export const PURCHASE_VAT_RATE = 0.21
export function purchaseNumber(value: string): number { return Number(value.trim().replace(',', '.')) }
export function purchaseAmounts(price: string, qty: string, rate: string, mode: 'gross' | 'net' = 'net') {
  const amount = purchaseNumber(price), quantity = purchaseNumber(qty), exchange = purchaseNumber(rate)
  if (!price.trim() || !qty.trim() || !rate.trim() || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(exchange) || exchange <= 0) return null
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  const netUnit = amount * exchange / (mode === 'gross' ? 1 + PURCHASE_VAT_RATE : 1)
  const grossTotal = round(amount * exchange * quantity * (mode === 'gross' ? 1 : 1 + PURCHASE_VAT_RATE))
  const netTotal = round(netUnit * quantity)
  if (![netUnit, netTotal, grossTotal].every(Number.isFinite)) return null
  return { netUnit, netTotal, vatTotal: round(grossTotal - netTotal), grossTotal }
}
