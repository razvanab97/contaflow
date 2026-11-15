'use client'
import { useEffect } from 'react'

// Spune shell-ului (meniul lateral, antetul) ce luna arata Dashboard-ul (?luna=), ca firmele din meniu
// sa duca la aceeasi luna si procentele lor sa fie pe luna aleasa. Pe paginile firmelor luna vine din URL.
export const EVENIMENT_LUNA = 'cf:luna-dashboard'
export default function LunaShell({ luna }: { luna: string }) {
  useEffect(() => { window.dispatchEvent(new CustomEvent(EVENIMENT_LUNA, { detail: luna })) }, [luna])
  return null
}
