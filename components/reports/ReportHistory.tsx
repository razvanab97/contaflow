import RapoarteSalvate from './RapoarteSalvate'

interface Props {
  firmaId: string
  updatedAt: string | null
  fisierNume: string | null
}

// Istoricul rapoartelor: fiecare luna raportata ramane salvata in platforma, cate un document pe luna
// („Raport implementare <Luna> <An>”, vezi lib/proiectRaport.ts). Documentul din editor e cel curent si se inlocuieste la
// fiecare generare; aici raman toate lunile, cu previzualizare, descarcare si stergere.
export default function ReportHistory({ firmaId, updatedAt, fisierNume }: Props) {
  return (
    <RapoarteSalvate
      firmaId={firmaId}
      curent={fisierNume}
      actualizatLa={updatedAt}
      gol={<p style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-666666)' }}>Niciun raport salvat încă. Fiecare raport generat se păstrează aici, câte unul pe lună raportată.</p>}
    />
  )
}
