'use client'
import { useState } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import RecomandariChitanta from './RecomandariChitanta'

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
  // Documentele recomandate si adaugate se vad imediat in lista de mai jos (remontare UploadPanel).
  const [versiune, setVersiune] = useState(0)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>
      {section === 'facturi-chitanta' && <RecomandariChitanta firmaId={firma.id} lunaId={lunaId} onAdaugat={() => setVersiune(v => v + 1)} />}
      <UploadPanel
        key={versiune}
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
