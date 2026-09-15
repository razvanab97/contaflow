'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'
import BookingLocatiiSummary from './BookingLocatiiSummary'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  section: 'booking-facturi' | 'booking-borderou'
  checklistItems: ChecklistItem[]
}

const CONFIG = {
  'booking-facturi': {
    title: 'Booking · Facturi',
    description: 'Facturi individuale din platforma Booking.com',
    linkPlaceholder: 'Link PDF factură Booking.com',
    docTypes: [{ value: 'factura', label: 'Factură' }, { value: 'borderou', label: 'Borderou' }],
  },
  'booking-borderou': {
    title: 'Booking · Borderou lunar',
    description: 'Centralizator lunar descărcat din Booking.com (raport de rezervări)',
    linkPlaceholder: 'Link PDF borderou Booking.com',
    docTypes: [{ value: 'borderou', label: 'Borderou' }, { value: 'raport_csv', label: 'Raport CSV' }],
  },
}

// O singură pagină pentru tot Booking, indiferent din ce link al sidebar-ului s-a ajuns aici
// (Booking · Facturi sau Booking · Borderou) — ca factura de comision și borderoul aceleiași
// proprietăți să apară mereu împreună, nu pe pagini separate.
export default function BookingModule({ firma, lunaId, tasks, section, checklistItems }: Props) {
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

      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="booking-facturi"
        culoare={firma.culoare}
        title={CONFIG['booking-facturi'].title}
        description={CONFIG['booking-facturi'].description}
        showLinkImport
        linkPlaceholder={CONFIG['booking-facturi'].linkPlaceholder}
        documentTypeOptions={CONFIG['booking-facturi'].docTypes}
      />
      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="booking-borderou"
        culoare={firma.culoare}
        title={CONFIG['booking-borderou'].title}
        description={CONFIG['booking-borderou'].description}
        showLinkImport
        linkPlaceholder={CONFIG['booking-borderou'].linkPlaceholder}
        documentTypeOptions={CONFIG['booking-borderou'].docTypes}
      />
    </div>
  )
}
