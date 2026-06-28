export function rgb(hex: string) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

// Varianta pastelata a culorii de brand — pastreaza nuanta dar e mult mai lizibila
// ca text pe fundal intunecat. Foloseste pentru text/iconite, nu pentru accente
// decorative (puncte, bare progres, borduri, fundaluri tintate cu rgba()).
export function legibil(hex: string, mix = 0.55) {
  const c = [hex.slice(1,3), hex.slice(3,5), hex.slice(5,7)].map(h => parseInt(h, 16))
  return `#${c.map(v => Math.round(v + (255 - v) * mix).toString(16).padStart(2, '0')).join('')}`
}
