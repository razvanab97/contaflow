'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  section: 'booking-facturi' | 'booking-borderou'
}

const CONFIG = {
  'booking-facturi': {
    title: 'Booking · Facturi',
    description: 'Facturi individuale din platforma Booking.com',
    linkPlaceholder: 'Link PDF factură Booking.com',
    docTypes: [{ value:'factura', label:'Factură' }, { value:'borderou', label:'Borderou' }],
  },
  'booking-borderou': {
    title: 'Booking · Borderou lunar',
    description: 'Centralizator lunar descărcat din Booking.com (raport de rezervări)',
    linkPlaceholder: 'Link PDF borderou Booking.com',
    docTypes: [{ value:'borderou', label:'Borderou' }, { value:'raport_csv', label:'Raport CSV' }],
  },
}

export default function BookingModule({ firma, lunaId, tasks, section }: Props) {
  const cfg = CONFIG[section]
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>
      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section={section}
        culoare={firma.culoare}
        title={cfg.title}
        description={cfg.description}
        showLinkImport
        linkPlaceholder={cfg.linkPlaceholder}
        documentTypeOptions={cfg.docTypes}
      />
    </div>
  )
}
