'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; checklistItems: ChecklistItem[] }

export default function TrendyolModule({ firma, lunaId, tasks, checklistItems }: Props) {
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
        section="trendyol"
        culoare={firma.culoare}
        title="Trendyol · Documente noi"
        description="Facturi și documente din platforma Trendyol"
        documentTypeOptions={[
          { value: 'factura', label: 'Factură' },
          { value: 'borderou', label: 'Borderou' },
          { value: 'raport_csv', label: 'Raport CSV' },
        ]}
        showLinkImport
        linkPlaceholder="Link PDF Trendyol"
      />
    </div>
  )
}
