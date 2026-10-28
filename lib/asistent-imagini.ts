// Imagini lipite (Ctrl/⌘+V) sau atasate in asistentul AI: capturi de ecran, poze cu documente, mailuri, erori.
// AI-ul le VEDE si lucreaza pe baza lor; nu se salveaza in platforma (facturile de pastrat se atasteaza cu agrafa,
// ca sa intre in Inbox Facturi). Imaginile se micsoreaza in browser, ca cererea sa ramana mica.

export interface ImagineAi { nume: string; mediaType: 'image/jpeg'; data: string; previzualizare: string }
export const MAX_IMAGINI = 5
const LATURA_MAX = 1568          // peste asta modelul le micsoreaza oricum
const MAX_CARACTERE = 1_300_000  // ~1 MB de imagine, in base64

export async function pregatesteImagine(file: File, nr: number): Promise<ImagineAi> {
  const bmp = await createImageBitmap(file)
  let scara = Math.min(1, LATURA_MAX / Math.max(bmp.width, bmp.height))
  for (;;) {
    const w = Math.max(1, Math.round(bmp.width * scara)), h = Math.max(1, Math.round(bmp.height * scara))
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Imaginea nu a putut fi citită.')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) // PNG-urile transparente nu devin negre in JPEG
    ctx.drawImage(bmp, 0, 0, w, h)
    for (let calitate = 0.9; calitate >= 0.5; calitate -= 0.1) {
      const url = canvas.toDataURL('image/jpeg', calitate)
      if (url.length <= MAX_CARACTERE) { bmp.close?.(); return { nume: file.name && file.name !== 'image.png' ? file.name : `captură-${nr}.jpg`, mediaType: 'image/jpeg', data: url.split(',')[1], previzualizare: url } }
    }
    if (scara < 0.2) throw new Error('Imaginea e prea mare.')
    scara *= 0.75
  }
}

type Bloc = { type?: string; [k: string]: unknown }
type Mesaj = { role?: string; content?: unknown }
const PLACEHOLDER = '[imagine atașată mai devreme în conversație — nu mai e disponibilă]'

const areImagini = (m: Mesaj) => m.role === 'user' && Array.isArray(m.content) && (m.content as Bloc[]).some(b => b?.type === 'image')
const faraImaginiMesaj = (m: Mesaj): Mesaj => ({ ...m, content: (m.content as Bloc[]).map(b => b?.type === 'image' ? { type: 'text', text: PLACEHOLDER } : b) })

// Pentru salvarea in localStorage: imaginile (base64) nu se pastreaza, ar umple spatiul browserului.
export function faraImagini<T>(mesaje: T[]): T[] {
  return mesaje.map(m => areImagini(m as Mesaj) ? faraImaginiMesaj(m as Mesaj) as T : m)
}

// Pentru fiecare cerere: raman imaginile din ultimele `pastreaza` mesaje cu imagini (ca sa poti intreba mai departe despre ele);
// restul devin text, ca cererea sa nu creasca la nesfarsit.
export function limiteazaImagini<T>(mesaje: T[], pastreaza = 2): T[] {
  const cuImagini = mesaje.map((m, i) => areImagini(m as Mesaj) ? i : -1).filter(i => i >= 0)
  const vechi = new Set(cuImagini.slice(0, Math.max(0, cuImagini.length - pastreaza)))
  return mesaje.map((m, i) => vechi.has(i) ? faraImaginiMesaj(m as Mesaj) as T : m)
}
