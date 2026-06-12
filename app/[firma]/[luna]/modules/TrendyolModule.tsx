'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[] }

export default function TrendyolModule({ firma, lunaId, tasks }: Props) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>
      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="trendyol"
        culoare={firma.culoare}
        title="Trendyol · Documente"
        description="Facturi și documente din platforma Trendyol"
        documentTypeOptions={[
          { value:'factura', label:'Factură' },
          { value:'borderou', label:'Borderou' },
          { value:'raport_csv', label:'Raport CSV' },
        ]}
        showLinkImport
        linkPlaceholder="Link PDF Trendyol"
      />
    </div>
  )
}
