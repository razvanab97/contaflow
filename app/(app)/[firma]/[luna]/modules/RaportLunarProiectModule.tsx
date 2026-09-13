import { TaskItem } from './TaskSection'
import ReportWorkspace from '@/components/reports/ReportWorkspace'
import { RAPORT_LUNAR_TEMPLATE } from '@/lib/documentWorkspace/raportLunarTemplate'

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
    />
  )
}
