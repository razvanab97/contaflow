export function offerPrice(value: unknown, currency: unknown) {
  const text = typeof value === 'string' ? value.trim().replace(',', '.') : ''
  if (typeof value !== 'number' && !/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Completează totalul cu TVA, cu maximum două zecimale.')
  const suma = typeof value === 'number' ? value : Number(text)
  if (!Number.isFinite(suma) || suma <= 0 || suma > 1e9 || Math.abs(suma * 100 - Math.round(suma * 100)) > 0.00001) throw new Error('Prețul ofertei este invalid.')
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('Moneda este invalidă.')
  return { suma, valuta: currency }
}
