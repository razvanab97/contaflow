import { getServiceSupabase } from '@/lib/supabase/server'
import {LEGACY_GROUPS} from '@/lib/proiect-workflow'
import {readWorkflow,writeWorkflow,WorkflowError} from '@/lib/proiect-workflow-store'

type Supabase = ReturnType<typeof getServiceSupabase>

// Scrierea efectivă a stării unei obligații - extrasă din POST /api/obligatii ca să poată fi
// apelată și de la confirmarea unei sugestii AI (/api/obligatii/sugestii/confirm), fără duplicare.
// Comportament identic cu POST-ul original: upsert pe obligatii_stari + oglindire în task_stari
// (ca progresul "N/M task-uri" de pe pagina firmei să rămână corect).
export async function applyObligatieState(sb: Supabase, lunaId: string, tipKey: string, patch: { scadenta?: string | null; trimis?: boolean }) {
  const { data: current } = await sb.from('obligatii_stari').select('scadenta,trimis').eq('luna_id', lunaId).eq('tip_key', tipKey).single()
  const scadenta = patch.scadenta !== undefined ? patch.scadenta : current?.scadenta ?? null
  const trimis = patch.trimis !== undefined ? patch.trimis : current?.trimis ?? false

  const { error } = await sb.from('obligatii_stari').upsert(
    { luna_id: lunaId, tip_key: tipKey, scadenta, trimis: !!trimis, updated_at: new Date().toISOString() },
    { onConflict: 'luna_id,tip_key' }
  )
  if (error) throw new Error(error.message)

  const { error: taskErr } = await sb.from('task_stari').upsert(
    { luna_id: lunaId, task_key: tipKey, completat: !!trimis, updated_at: new Date().toISOString() },
    { onConflict: 'luna_id,task_key' }
  )
  if (taskErr) throw new Error(taskErr.message)
  const keys=LEGACY_GROUPS[tipKey]
  if(!keys)return
  const {data:month,error:monthError}=await sb.from('luni_contabile').select('firma_id').eq('id',lunaId).single()
  if(monthError||!month)throw new Error('Luna nu a putut fi citită pentru sincronizarea rutinei')
  const prefix=`${month.firma_id}/workflow/month-${lunaId}`
  for(let attempt=0;attempt<3;attempt++){
    const state=await readWorkflow(prefix)
    if(!state.version)return
    for(const key of keys){const row=state.tasks[key];if(!row)continue
      if(patch.trimis!==undefined&&row.status!=='acceptat')row.status=patch.trimis?'trimis':'lipsa'
      if(patch.scadenta!==undefined)row.due=patch.scadenta
    }
    try{await writeWorkflow(prefix,state,state.version);return}catch(e){if(!(e instanceof WorkflowError)||e.status!==409||attempt===2)throw e}
  }
}
