'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[] }

export default function ActeModule({ firma, lunaId, tasks }: Props) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>
      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="acte-contabile"
        culoare={firma.culoare}
        title="Acte contabile"
        description="Acte și documente pentru dosarul contabil lunar"
        documentTypeOptions={[
          { value:'contract', label:'Contract' },
          { value:'factura', label:'Factură' },
          { value:'altul', label:'Alt document' },
        ]}
        showLinkImport
        linkPlaceholder="Link PDF document contabil"
      />
    </div>
  )
}
