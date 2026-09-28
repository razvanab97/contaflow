import {NextRequest,NextResponse} from 'next/server'
import {randomUUID} from 'node:crypto'
import {FORM_LABELS,TASKS,type FormKind,type Asset} from '@/lib/proiect-workflow'
import {generateProjectDoc} from '@/lib/proiect-generate'
import {scopeContext,readWorkflow,writeWorkflow,sameOrigin,WorkflowError} from '@/lib/proiect-workflow-store'
const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
function failure(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Eroare document'},{status:e instanceof WorkflowError?e.status:500})}
export async function GET(req:NextRequest){try{
 const {prefix,sb}=await scopeContext(req.nextUrl.searchParams.get('firmaId')||'',req.nextUrl.searchParams.get('scope')||'')
 const state=await readWorkflow(prefix),asset=state.assets.find(a=>a.id===req.nextUrl.searchParams.get('id'))
 if(!asset)throw new WorkflowError('Document inexistent',404)
 const {data,error}=await sb.storage.from('documente').download(`${prefix}/files/${asset.id}`)
 if(error||!data)throw new WorkflowError('Descărcarea a eșuat',503)
 return new NextResponse(new Uint8Array(await data.arrayBuffer()),{headers:{'Content-Type':asset.type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
 }catch(e){return failure(e)}}
export async function POST(req:NextRequest){try{
 sameOrigin(req)
 const upload=req.headers.get('content-type')?.startsWith('multipart/form-data')
 const fd=upload?await req.formData():null,body=upload?Object.fromEntries(fd!):await req.json()
 const {firmaId,scope}=body
 if(scope==='settings')throw new WorkflowError('Documentele aparțin unei luni sau achiziții')
 const {prefix,sb,lunaId}=await scopeContext(String(firmaId),String(scope)),state=await readWorkflow(prefix)
 if(Number(body.version)!==state.version)throw new WorkflowError('Date modificate în altă fereastră. Reîncarcă pagina.',409)
 if(state.assets.length>=200)throw new WorkflowError('Limita de 200 documente pe dosar a fost atinsă')
 let bytes:Buffer,name:string,type:string,task:string
 if(upload){
 const file=fd!.get('file');task=String(body.task||'')
 if(!TASKS.some(t=>t.key===task)&&!Object.hasOwn(FORM_LABELS,task))throw new WorkflowError('Categorie invalidă')
 if(!(file instanceof File)||file.size>4*1024*1024||!file.size)throw new WorkflowError('Fișier lipsă sau mai mare de 4 MB')
 if(!['application/pdf','image/jpeg','image/png',MIME].includes(file.type))throw new WorkflowError('Acceptăm PDF, Word, JPG și PNG')
 bytes=Buffer.from(await file.arrayBuffer());name=file.name.slice(0,180);type=file.type
 }else{
 task=String(body.kind)
 if(!Object.hasOwn(FORM_LABELS,task))throw new WorkflowError('Formular invalid')
 if(!(String(scope).startsWith('purchase-')?['oferta','nota','receptie']:['raport','restituire']).includes(task))throw new WorkflowError('Formularul nu aparține acestui tip de dosar')
 const kind=task as FormKind,draft=state.forms[kind]
 if(!draft)throw new WorkflowError('Salvează formularul înainte de generare')
 try{bytes=await generateProjectDoc(kind,draft,state.profile)}catch(e){throw new WorkflowError(e instanceof Error?e.message:'Formular incomplet')}
 name=`${FORM_LABELS[kind]}_${new Date().toISOString().slice(0,10)}_v${state.version}.docx`;type=MIME
 }
 const asset:Asset={id:randomUUID(),task,name,type,createdAt:new Date().toISOString(),kind:upload?'upload':'generated'}
 const path=`${prefix}/files/${asset.id}`
 const {error}=await sb.storage.from('documente').upload(path,bytes,{contentType:type,upsert:false})
 if(error)throw new WorkflowError('Încărcarea a eșuat: '+error.message,503)
 const {error:dbError}=await sb.from('documente').insert({id:asset.id,firma_id:firmaId,luna_id:lunaId,achizitie_id:String(scope).startsWith('purchase-')?String(scope).slice(9):null,modul:String(scope).startsWith('purchase-')?'achizitii':'obligatii',tip_document:task,fisier_path:path,fisier_nume:name,fisier_tip:type,fisier_marime:bytes.length,in_zip:true})
 if(dbError){await sb.storage.from('documente').remove([path]);throw new WorkflowError('Documentul nu a putut fi înregistrat pentru export: '+dbError.message,503)}
 let next
 try{next=await writeWorkflow(prefix,{...state,assets:[...state.assets,asset]},state.version)}catch(e){await sb.from('documente').delete().eq('id',asset.id);await sb.storage.from('documente').remove([path]);throw e}
 return NextResponse.json({state:next,asset})
 }catch(e){return failure(e)}}
