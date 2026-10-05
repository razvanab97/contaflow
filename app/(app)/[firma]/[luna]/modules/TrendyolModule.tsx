'use client'
import { useState } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'
import ConcluzieTrendyol from './ConcluzieTrendyol'
import BorderouriTrendyol from './BorderouriTrendyol'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; checklistItems: ChecklistItem[] }

export default function TrendyolModule({ firma, lunaId, tasks, checklistItems }: Props) {
  // creste la fiecare borderou adaugat / sters -> concluzia se recalculeaza
  const [versiune, setVersiune] = useState(0)
  const sorted = [...checklistItems].sort((a, b) => (a.checklist_templates?.ordine || 0) - (b.checklist_templates?.ordine || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      {/* Borderourile platilor (.xlsx) - data pentru eCap, descarcabile; din ele se face concluzia */}
      <BorderouriTrendyol firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare} onChange={() => setVersiune(v => v + 1)}/>

      {/* Concluzia Trendyol: vanzari -> comision -> transport separat -> taxe -> virat -> incasat in extras */}
      <ConcluzieTrendyol lunaId={lunaId} versiune={versiune}/>

      {sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-666666)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px', display: 'block' }}>
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
