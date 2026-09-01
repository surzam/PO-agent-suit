import {parseAgUiInput} from './input-adapter.mjs';
import {isAgUiTerminal,projectAgUiRun} from './projection.mjs';
import {serializeSse} from './serializer.mjs';
import {readJson} from '../../api/request-body.mjs';
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))};
const cursorSequence=value=>{const match=String(value||'').match(/:(\d{8})(?::\d{2})?$/);return match?Number(match[1]):0};

export function createAgUiEndpoint({inspect,observation,subscribe,launch,cancel,artifact,threadIdForRun}){
  async function stream(req,res,runId,threadId,afterEventId=''){
    let sentSequence=cursorSequence(afterEventId),sentIds=new Set(),closed=false,unsubscribe=()=>{},chain=Promise.resolve(),heartbeat=null,started=false;
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive'});
    const pump=()=>chain=chain.then(async()=>{if(closed)return;const run=await inspect(runId),view=await observation(run);for(const record of projectAgUiRun(run,{observation:view,threadId})){const framing=/^(?:RUN_|STEP_|TOOL_CALL_|STATE_SNAPSHOT)/.test(record.event.type);if(sentIds.has(record.projectedId))continue;if(!framing&&(record.sequence<sentSequence||record.sequence===sentSequence&&afterEventId&&record.projectedId<=afterEventId))continue;res.write(serializeSse(record));if(record.event.type==='RUN_STARTED')started=true;sentSequence=Math.max(sentSequence,record.sequence);sentIds.add(record.projectedId);if(isAgUiTerminal(record)){closed=true;if(heartbeat)clearInterval(heartbeat);unsubscribe();res.end();break}}}).catch(error=>{if(closed)return;try{const sequence=sentSequence+1,base={runId,eventId:`${runId}:interop:${String(sequence).padStart(8,'0')}`,sequence},safe={type:'RUN_ERROR',message:'AgentSuite interoperability stream failed',code:'AGUI_PROJECTION_ERROR',threadId,runId};if(started){res.write(`id: ${base.eventId}:01\ndata: ${JSON.stringify({type:'CUSTOM',name:'agentsuite.interop.error',value:{schemaVersion:1,...base,data:{code:'AGUI_PROJECTION_ERROR',message:'AgentSuite interoperability stream failed'}}})}\n\n`)}res.write(`id: ${base.eventId}:02\ndata: ${JSON.stringify(safe)}\n\n`)}catch{}closed=true;if(heartbeat)clearInterval(heartbeat);unsubscribe();res.end()});
    unsubscribe=subscribe(runId,()=>void pump());
    await pump();
    if(closed)return;
    heartbeat=setInterval(()=>{if(!closed)res.write(': ag-ui-live\n\n')},15000);
    req.on('close',()=>{clearInterval(heartbeat);unsubscribe();closed=true});
  }
  return async function handleAgUi(req,res,url){
    try{
      if(req.method==='POST'&&url.pathname==='/api/ag-ui'){
        const value=parseAgUiInput(await readJson(req));let run=await inspect(value.runId).catch(()=>null);
        if(run&&!value.observe)throw Object.assign(new Error('Run identity already exists'),{code:'RUN_ID_CONFLICT',statusCode:409});
        if(!run)run=await launch(value);
        const canonicalThread=run.interopMetadata?.agUi?.threadId||await threadIdForRun?.(run)||value.threadId;
        if(value.threadId!==canonicalThread)throw Object.assign(new Error('AG-UI threadId does not match persisted Run lineage'),{code:'THREAD_LINEAGE_MISMATCH',statusCode:409});
        return stream(req,res,run.id,canonicalThread,value.input.forwardedProps?.agentsuite?.afterEventId||'');
      }
      const cancellation=url.pathname.match(/^\/api\/ag-ui\/runs\/([^/]+)\/cancel$/);
      if(req.method==='POST'&&cancellation){const run=await cancel(decodeURIComponent(cancellation[1]));json(res,{runId:run.id,status:run.status,reasonCode:run.reasonCode},202);return true}
      const artifactRoute=url.pathname.match(/^\/api\/ag-ui\/runs\/([^/]+)\/artifacts\/([^/]+)$/);
      if(req.method==='GET'&&artifactRoute){const value=await artifact(decodeURIComponent(artifactRoute[1]),decodeURIComponent(artifactRoute[2]));json(res,value||{error:'Artifact not found in Run output lineage'},value?200:404);return true}
      json(res,{error:'AG_UI_ROUTE_NOT_FOUND'},404);return true;
    }catch(error){json(res,{error:error.code||'AG_UI_ERROR',message:String(error.message||error)},error.statusCode||500);return true}
  }
}
