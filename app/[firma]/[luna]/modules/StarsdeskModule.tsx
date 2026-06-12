'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[] }

export default function StarsdeskModule({ firma, lunaId, tasks }: Props) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>
      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="5stardesk"
        culoare={firma.culoare}
        title="5StarDesk · Facturi"
        description="Facturi din platforma 5StarDesk"
        documentTypeOptions={[
          { value:'factura', label:'Factură' },
          { value:'borderou', label:'Borderou' },
        ]}
        showLinkImport
        linkPlaceholder="Link PDF 5StarDesk"
      />
    </div>
  )
}
