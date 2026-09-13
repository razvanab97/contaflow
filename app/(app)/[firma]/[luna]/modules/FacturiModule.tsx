'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props {
  firma: Firma
  lunaId: string
  tasks: TaskItem[]
  section: 'facturi-chitanta' | 'facturi-restante'
}

const CONFIG = {
  'facturi-chitanta': {
    title: 'Facturi + chitanță',
    description: 'Asociază separat factura și chitanța pentru aceeași plată cash.',
  },
  'facturi-restante': {
    title: 'Facturi restante',
    description: 'Facturi neachitate — rămân vizibile până le marchezi achitate.',
  },
}

export default function FacturiModule({ firma, lunaId, tasks, section }: Props) {
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
        documentTypeOptions={[
          { value:'factura', label:'Factură' },
          { value:'chitanta', label:'Chitanță' },
        ]}
        showLinkImport
        linkPlaceholder="Link PDF Oblio sau altă platformă"
        showPaidToggle={section === 'facturi-restante'}
      />
    </div>
  )
}
