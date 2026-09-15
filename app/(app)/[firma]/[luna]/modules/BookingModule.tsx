'use client'
import TaskSection, { TaskItem } from './TaskSection'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'
import BookingLocatiiSummary from './BookingLocatiiSummary'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  section: 'booking-facturi'
  checklistItems: ChecklistItem[]
}

// O singură pagină pentru tot Booking (facturi de comision + borderouri lunare), grupate pe
// proprietate — vezi BookingLocatiiSummary pentru gestionarea locațiilor și upload-ul unificat.
export default function BookingModule({ firma, lunaId, tasks, checklistItems }: Props) {
  const sorted = [...checklistItems].sort((a, b) => (a.checklist_templates?.ordine || 0) - (b.checklist_templates?.ordine || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      {sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-666666)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px', display: 'block' }}>
            Documente salvate anterior
          </span>
          {sorted.map(item => (
            <OldItemDocs key={item.id} item={item} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare}/>
          ))}
        </div>
      )}

      <BookingLocatiiSummary firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare}/>
    </div>
  )
}
