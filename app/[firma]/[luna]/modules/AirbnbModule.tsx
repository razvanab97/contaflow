'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  section: 'airbnb-facturi' | 'airbnb-borderou'
  checklistItems: ChecklistItem[]
}

const CONFIG = {
  'airbnb-facturi': {
    title: 'Airbnb · Facturi',
    description: 'Facturi individuale din platforma Airbnb',
    linkPlaceholder: 'Link PDF factură Airbnb',
    docTypes: [{ value: 'factura', label: 'Factură' }, { value: 'borderou', label: 'Borderou' }],
  },
  'airbnb-borderou': {
    title: 'Airbnb · Borderou lunar',
    description: 'Centralizator lunar descărcat din Airbnb (raport de rezervări)',
    linkPlaceholder: 'Link PDF borderou Airbnb',
    docTypes: [{ value: 'borderou', label: 'Borderou' }, { value: 'raport_csv', label: 'Raport CSV' }],
  },
}

export default function AirbnbModule({ firma, lunaId, tasks, section, checklistItems }: Props) {
  const cfg = CONFIG[section]
  const sorted = [...checklistItems].sort((a, b) => (a.checklist_templates?.ordine || 0) - (b.checklist_templates?.ordine || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      {sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px', display: 'block' }}>
            Documente salvate anterior
          </span>
          {sorted.map(item => (
            <OldItemDocs key={item.id} item={item} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare}/>
          ))}
        </div>
      )}

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
