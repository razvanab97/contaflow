'use client'
import { TaskItem } from './TaskSection'
import ReportWorkspace from '@/components/reports/ReportWorkspace'
import { RAPORT_LUNAR_TEMPLATE } from '@/lib/documentWorkspace/raportLunarTemplate'
import { parseMultilineToItems } from '@/lib/documentWorkspace/types'
import RaportDinMemorie from '@/components/proiect/RaportDinMemorie'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[]; luna: string; lunaLabel: string; modulSlug: string }

// Punct de intrare subtire: toata logica/UI-ul traiesc in ReportWorkspace (generic, reutilizabil
// pentru orice document viitor) - aici doar legam template-ul specific "Raport lunar".
export default function RaportLunarProiectModule({ firma, lunaId, tasks, luna, lunaLabel, modulSlug }: Props) {
  return (
    <ReportWorkspace
      firma={firma} lunaId={lunaId} tasks={tasks}
      luna={luna} lunaLabel={lunaLabel} modulSlug={modulSlug}
      template={RAPORT_LUNAR_TEMPLATE}
      renderAssist={api => (
        <RaportDinMemorie firmaId={firma.id} luna={luna} onApply={p => {
          api.applyValues({
            perioada: p.perioada,
            autorizatii: parseMultilineToItems(p.autorizatii.join('\n')),
            obiective: parseMultilineToItems(p.obiective.join('\n')),
            activitati: parseMultilineToItems(p.activitati.join('\n')),
          })
          api.setCustomByLabel('data', p.dataRaport)
        }} />
      )}
    />
  )
}
