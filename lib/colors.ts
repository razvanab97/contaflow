export function rgb(hex: string) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

function mixHex(hex: string, mix: number, toward: 'white' | 'black') {
  const c = [hex.slice(1,3), hex.slice(3,5), hex.slice(5,7)].map(h => parseInt(h, 16))
  const target = toward === 'white' ? 255 : 0
  return `#${c.map(v => Math.round(v + (target - v) * mix).toString(16).padStart(2, '0')).join('')}`
}

// Varianta lizibila a culorii de brand ca text/iconite — pe fundal intunecat se pastelizeaza
// spre alb, pe fundal deschis se inchide spre negru, ca sa ramana citeata pe ambele.
// Foloseste light-dark() (citeste color-scheme din :root / :root[data-theme="light"]),
// nu pentru accente decorative (puncte, bare progres — acolo culoarea brandului merge direct).
// light-dark() ia (valoare-pe-light, valoare-pe-dark) — in ordinea asta, nu invers.
export function legibil(hex: string, mixDark = 0.55, mixLight = 0.5) {
  return `light-dark(${mixHex(hex, mixLight, 'black')}, ${mixHex(hex, mixDark, 'white')})`
}

// Tenta de fundal a culorii de brand (checkbox-uri bifate, butoane fantoma, stari active) —
// alfa mai mica pe intunecat (unde orice tenta se vede clar pe negru), mai mare pe deschis
// (altfel se pierde pe alb).
export function tint(rgbCsv: string, alphaDark: number, alphaLight = Math.min(alphaDark * 2.5, 0.6)) {
  return `light-dark(rgba(${rgbCsv},${alphaLight}), rgba(${rgbCsv},${alphaDark}))`
}
