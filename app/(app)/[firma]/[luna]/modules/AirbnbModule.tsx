'use client'
import TaskSection, { TaskItem } from './TaskSection'
import UploadPanel from './UploadPanel'
import OldItemDocs, { ChecklistItem } from './OldItemDocs'
import AirbnbRezervari from './AirbnbRezervari'
import FacturiRhVerificare from './FacturiRhVerificare'
import { getFirmaConfig } from '@/lib/firma-config'

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
    title: 'Airbnb · Facturi comision',
    description: 'Pasul 2: facturile de comision pe care Airbnb ți le emite ție (taxa de servicii), câte una pe rezervare — se potrivesc automat cu rezervările după cod sau sumă. Facturile de vânzare către clienți nu se pun aici.',
    linkPlaceholder: 'Link factură de comision Airbnb sau PDF',
    docTypes: [{ value: 'factura', label: 'Factură' }, { value: 'borderou', label: 'Borderou' }],
  },
  'airbnb-borderou': {
    title: 'Airbnb · Rezervări',
    description: 'Pasul 1: încarcă borderoul CSV din Airbnb — din el se creează rezervările lunii, cu codul de copiat',
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

      {/* Pasul 1 (Borderou): rezervarile din CSV, cu codul de copiat. Pasul 2 (Facturi): ce factura
          de comision lipseste dupa asociere, ca sa fie adusa. */}
      <AirbnbRezervari firmaId={firma.id} lunaId={lunaId} mod={section === 'airbnb-borderou' ? 'borderou' : 'facturi'} />

      {/* Firmele care factureaza cazarea in Oblio (AB Textile, seria RH din ApartPro) - in loc de 5StarDesk */}
      {section === 'airbnb-borderou' && getFirmaConfig(firma.slug)?.facturiCazareOblio && <FacturiRhVerificare firmaId={firma.id} lunaId={lunaId} />}

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
