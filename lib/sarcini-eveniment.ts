// Anunta shell-ul (meniul lateral) ca s-a bifat / debifat o sarcina a lunii, ca bifele ✓ ale modulelor,
// contorul „X/N” si marcajul „in lucru” sa se actualizeze imediat, fara reincarcarea paginii.
export const EVENIMENT_SARCINI = 'cf:sarcini'
export function anuntaSarciniSchimbate() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENIMENT_SARCINI))
}
