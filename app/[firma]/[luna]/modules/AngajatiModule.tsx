'use client'
import { useRef } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import AngajatiRezumat, { AngajatiRezumatHandle } from './AngajatiRezumat'

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[] }

export default function AngajatiModule({ firma, lunaId, tasks }: Props) {
  const rezumatRef = useRef<AngajatiRezumatHandle>(null)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>
      <UploadPanel
        firmaId={firma.id}
        lunaId={lunaId}
        section="angajati"
        culoare={firma.culoare}
        title="Documente angajați"
        description="Pontaj lunar semnat, stat de plată, documente HR"
        documentTypeOptions={[
          { value:'foaie_prezenta', label:'Pontaj' },
          { value:'stat_plata', label:'Stat de plată' },
          { value:'chenzina', label:'Chenzina' },
          { value:'altul', label:'Alt document' },
        ]}
        onChange={() => rezumatRef.current?.reload()}
      />
      <AngajatiRezumat ref={rezumatRef} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare}/>
    </div>
  )
}
