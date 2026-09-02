import { ObservationStore } from './observation/observation-store.js';
import { ObservationMode } from './observation/observation-mode.js';
import { renderInteractiveResult } from './interactive-result/renderer.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const TERMINAL=new Set(['completed','failed','cancelled','interrupted']);
const outputLabels={Narrative:'Рассказ',DataArtifact:'Таблица',Presentation:'Презентация',InteractiveResult:'Интерактивный результат'};
const statusText={created:'Подготавливаем исследование.',launching:'Создаём исследование.',running:'Исследование идёт. Откройте его, чтобы видеть текущую операцию.',completed:'Готово. Начните с интерактивного результата или выберите другой формат.',cancelled:'Исследование отменено. Незавершённые действия больше не меняют результат.',interrupted:'Исследование было прервано перезапуском AgentSuite.',failed:'Исследование не завершилось.'};
let mode='random',view='start',currentRunId=localStorage.getItem('agentsuite.currentRunId'),run=null,briefReady=false,session='session-'+crypto.randomUUID(),beforeArtifact='result',launching=false,pendingLaunchRequestId=null;

const obsMode=new ObservationMode($('#observation'),{openArtifact});
const store=new ObservationStore((state,meta)=>{
  obsMode.render(state,meta);
  if([...TERMINAL,'needs-context'].includes(state.status))renderResult(state.runId).then(()=>{
    if(currentRunId===state.runId&&$('#artifact').hidden)screen('result');
  });
});

function screen(name){
  view=name;
  document.querySelectorAll('.screen').forEach(node=>node.classList.toggle('active',node.id===name));
  document.querySelectorAll('#runTabs button').forEach(node=>node.classList.toggle('active',node.dataset.view===name));
  $('#startControls').hidden=name!=='start';
}

function add(text,who){
  const box=$('#messages'),near=box.scrollHeight-box.scrollTop-box.clientHeight<70;
  box.insertAdjacentHTML('beforeend',`<div class="message ${who}">${esc(text)}</div>`);
  if(near)box.scrollTop=box.scrollHeight;
}

function setMode(next){
  mode=next;
  $('#randomMode').classList.toggle('active',next==='random');
  $('#customMode').classList.toggle('active',next==='custom');
  $('.start-copy').hidden=next==='custom';
  $('#customChat').hidden=next!=='custom';
  if(next==='custom')$('#prompt').focus();
}

function setLaunching(value){
  launching=value;
  $('#generate').disabled=value;
  $('#generate').setAttribute('aria-busy',String(value));
  $('#generate').textContent=value?'СОЗДАЮ ИССЛЕДОВАНИЕ…':'ГЕНЕРИРОВАТЬ';
}

function rememberRun(id){currentRunId=id;localStorage.setItem('agentsuite.currentRunId',id)}

async function launch(){
  if(launching)return;
  setLaunching(true);
  pendingLaunchRequestId=pendingLaunchRequestId||crypto.randomUUID();
  try{
    let intent='';
    if(mode==='custom'){
      const text=$('#prompt').value.trim();
      if(text){
        add(text,'user');
        $('#prompt').value='';
        const response=await fetch('/api/brief/turn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:session,message:text})});
        const value=await response.json();
        if(!value.ready){add(value.clarification,'agent');pendingLaunchRequestId=null;return}
        briefReady=true;intent=value.brief.question;
      }
      if(!briefReady){
        $('#customHint').textContent='Сначала опишите вопрос, который хотите исследовать.';
        $('#prompt').focus();pendingLaunchRequestId=null;return;
      }
    }
    const response=await fetch('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({launchRequestId:pendingLaunchRequestId,mode,intent,workflow:'research-presentation',role:'product-owner'})});
    const value=await response.json();
    if(response.status===409&&value.activeRunId){rememberRun(value.activeRunId);await attachRun(value.activeRunId,'observation');return}
    if(!response.ok)throw Error(value.error);
    rememberRun(value.runId);pendingLaunchRequestId=null;
    await attachRun(value.runId,'observation');
  }finally{setLaunching(false)}
}

async function attachRun(id,target='result'){
  rememberRun(id);$('#runTabs').hidden=false;
  $('#resultTitle').textContent='Вопрос принят';
  $('#resultStatus').textContent='Создано исследование. Показываем первое действие агента.';
  screen(target);await store.attach(id);await renderResult(id);
}

function reasonText(value){
  return ({'provider-unavailable':'Локальная модель недоступна. Запустите модель и попробуйте снова.','inference-timeout':'Модель не успела завершить действие. Попробуйте ещё раз.','research-timeout':'Исследование достигло безопасного предела времени.','malformed-response':'Модель вернула ответ, который нельзя безопасно использовать. Попробуйте ещё раз.','source-unavailable':'Один из источников недоступен.','source-timeout':'Один из источников не ответил вовремя.','artifact-unavailable':'Результат не был сохранён или не открывается.','user-cancelled':'Исследование отменено пользователем.','runtime-interrupted':'AgentSuite был перезапущен до завершения исследования.'}[value]||statusText.failed);
}

function appendOutputButton(container,artifact,{primary=false}={}){
  const button=document.createElement('button');
  button.textContent=outputLabels[artifact.type];button.className=primary?'primary-output':'';
  button.onclick=()=>openArtifact(artifact.id);container.append(button);
}

async function renderResult(id=currentRunId){
  if(!id)return;
  const value=await fetch('/api/runs/'+encodeURIComponent(id)).then(response=>response.ok?response.json():null).catch(()=>null);
  if(!value||id!==currentRunId)return;
  run=value;
  const title=value.intent||'Новое исследование';
  $('#resultTitle').textContent=title;$('#resultTitle').title=title;
  $('#resultArtifacts').replaceChildren();$('#ctoFork').hidden=true;
  $('#cancelRun').hidden=!['created','launching','running'].includes(value.status);
  $('#newGeneration').hidden=!TERMINAL.has(value.status)&&value.status!=='needs-context';
  if(value.status==='completed'){
    const outputs=value.artifacts.filter(item=>outputLabels[item.type]);
    const interactive=outputs.find(item=>item.type==='InteractiveResult');
    if(interactive){
      const primary=document.createElement('div');primary.className='output-group primary';primary.innerHTML='<small>ОСНОВНОЙ РЕЗУЛЬТАТ</small>';appendOutputButton(primary,interactive,{primary:true});$('#resultArtifacts').append(primary);
    }
    const alternatives=outputs.filter(item=>item.id!==interactive?.id);
    if(alternatives.length){const group=document.createElement('div');group.className='output-group';group.innerHTML='<small>ДРУГИЕ ФОРМАТЫ</small>';alternatives.forEach(item=>appendOutputButton(group,item));$('#resultArtifacts').append(group)}
    $('#resultStatus').textContent=statusText.completed;$('#ctoFork').hidden=false;return;
  }
  if(value.status==='needs-context'){
    const event=[...value.events].reverse().find(item=>item.type==='ResearchContextRequired'||item.type==='IntentDiscoveryInsufficientContext');
    $('#resultStatus').textContent=event?.payload?.message||reasonText(value.reasonCode);
    if(event?.payload?.canAddSource){const button=document.createElement('button');button.textContent='Добавить источник';button.onclick=addSource;$('#resultArtifacts').append(button)}
    return;
  }
  $('#resultStatus').textContent=['failed','cancelled','interrupted'].includes(value.status)?reasonText(value.reasonCode):statusText[value.status]||statusText.running;
}

async function addSource(){
  const input=document.createElement('input');input.type='file';input.accept='.md,.txt,.json,.csv,.tsv,.yaml,.yml,.js,.mjs,.ts,.html,.css';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const response=await fetch('/api/context',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,content:await file.text()})}),value=await response.json();if(!response.ok)return alert(value.error);await rerun('research',run.role)};
  input.click();
}

async function rerun(from,role){
  const response=await fetch(`/api/runs/${encodeURIComponent(currentRunId)}/rerun`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({launchRequestId:crypto.randomUUID(),from,role,workflow:'research-presentation'})});
  const value=await response.json();if(response.status===409&&value.activeRunId)return attachRun(value.activeRunId,'observation');if(!response.ok)return alert(value.error);await attachRun(value.runId,'observation');
}

function presentationHtml(value){
  const fallback='--bg:#071321;--ink:#f7fbff;--accent:#4f7cff;--soft:#b8f3e8;--hot:#ff805d;--font-display:Inter,system-ui,sans-serif;--font-body:Inter,system-ui,sans-serif;--font-mono:ui-monospace,monospace';
  let html=String(value||'').replace(':root{undefined;',`:root{${fallback};`);
  if(!html.includes('id="deckPrev"')){
    html=html.replace('</head>','<style>.deck-controls{display:flex!important;align-items:center;gap:10px}.deck-controls button{width:34px;height:30px;border:1px solid #ffffff66;border-radius:99px;background:#ffffff18;color:#fff;font:700 16px ui-monospace,monospace;cursor:pointer}.deck-controls span{min-width:48px;text-align:center}</style></head>');
    html=html.replace(/<div class="deck-controls">[\s\S]*?<\/div><script>/,'<div class="deck-controls"><button id="deckPrev" aria-label="Предыдущий слайд">←</button><span id="deckPosition">1 / ?</span><button id="deckNext" aria-label="Следующий слайд">→</button></div><script>');
    html=html.replace('</body>',`<script>document.getElementById('deckPosition').textContent=(current+1)+' / '+slides.length;document.getElementById('deckPrev').onclick=()=>{go(current-1);document.getElementById('deckPosition').textContent=(current+1)+' / '+slides.length};document.getElementById('deckNext').onclick=()=>{go(current+1);document.getElementById('deckPosition').textContent=(current+1)+' / '+slides.length};</script></body>`);
  }
  return html;
}

async function showEvidence(content,evidenceId){
  const meta=run?.artifacts?.find(item=>item.type==='EvidenceSet');
  if(!meta)throw Error('В этом результате не найдено сохранённых evidence.');
  const validationMeta=run?.artifacts?.find(item=>item.type==='ValidationReport'),dataMeta=run?.artifacts?.find(item=>item.type==='DataArtifact');
  const [response,validationResponse,dataResponse]=await Promise.all([fetch(`/api/runs/${encodeURIComponent(currentRunId)}/artifacts/${encodeURIComponent(meta.id)}`),validationMeta?fetch(`/api/runs/${encodeURIComponent(currentRunId)}/artifacts/${encodeURIComponent(validationMeta.id)}`):null,dataMeta?fetch(`/api/runs/${encodeURIComponent(currentRunId)}/artifacts/${encodeURIComponent(dataMeta.id)}`):null]);
  const evidence=await response.json();if(!response.ok)throw Error(evidence.error||'Evidence недоступна');
  const validation=validationResponse?.ok?await validationResponse.json():null,data=dataResponse?.ok?await dataResponse.json():null;
  const item=(evidence.data?.items||[]).find(candidate=>String(candidate.id)===String(evidenceId));
  const decision=(validation?.data?.items||[]).find(candidate=>String(candidate.evidenceId)===String(evidenceId));
  const usedBy=[];for(const group of ['rows','metrics','insights'])for(const ref of data?.data?.provenance?.[group]||[])if((ref.evidenceIds||[]).map(String).includes(String(evidenceId)))usedBy.push(ref.rowId||ref.metricId||ref.insightId);
  const panel=document.createElement('aside');panel.className='ir-evidence-panel';
  panel.innerHTML=item?`<button aria-label="Закрыть" class="ir-panel-close">×</button><p class="ir-kicker">ПРОВЕРЯЕМОЕ ОСНОВАНИЕ</p><strong>${esc(item.id)}</strong><p>${esc(item.claim||'')}</p><small>${esc(item.sourceTitle||item.sourceId||'Источник не указан')} · ${esc(item.confidence||'не указана')}</small><dl><dt>Проверка</dt><dd>${esc(decision?.status||String(decision?.valid??'не сохранена'))}</dd><dt>Использовано в</dt><dd>${usedBy.length?usedBy.map(esc).join(', '):'Связь с данными не сохранена'}</dd></dl>`:'<strong>Основание не найдено</strong>';
  panel.querySelector('.ir-panel-close')?.addEventListener('click',()=>panel.remove());content.querySelector('.ir-evidence-panel')?.remove();content.prepend(panel);
}

async function openArtifact(id){
  if(!currentRunId||!id)return;
  beforeArtifact=['result','observation','history'].includes(view)?view:'result';
  const artifact=$('#artifact'),content=$('#artifactContent'),frame=$('#artifactFrame');artifact.hidden=false;
  $('#artifactTitle').textContent='Загрузка…';content.style.display='grid';content.className='artifact-content';content.innerHTML='<p class="artifact-loading">Открываю сохранённый результат…</p>';frame.style.display='none';frame.srcdoc='';$('#windowControl').textContent='←';
  try{
    const response=await fetch(`/api/runs/${encodeURIComponent(currentRunId)}/artifacts/${encodeURIComponent(id)}`),a=await response.json();
    if(!response.ok)throw Error(a.error||'Artifact unavailable');
    $('#artifactTitle').textContent=outputLabels[a.type]||'Результат';content.style.display='block';
    if(a.type==='Presentation'){content.style.display='none';frame.style.display='block';frame.srcdoc=presentationHtml(a.data?.html)||'<main style="color:white;padding:3rem">Презентация не содержит HTML.</main>';frame.onload=()=>frame.contentWindow?.focus()}
    else if(a.type==='DataArtifact'){content.className='artifact-content data-surface';content.innerHTML=`<h1>${esc(a.data.title||'Таблица')}</h1><table><thead><tr>${(a.data.columns||[]).map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${(a.data.rows||[]).map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
    else if(a.type==='InteractiveResult'){content.className='artifact-content interactive-result';renderInteractiveResult(content,a,{onEvidence:evidenceId=>showEvidence(content,evidenceId).catch(error=>alert(error.message))})}
    else {content.className='artifact-content narrative-surface';content.innerHTML=markdown(a.data?.content||'');}
  }catch(error){
    $('#artifactTitle').textContent='Не удалось открыть результат';content.style.display='block';
    content.innerHTML=`<h1>Не удалось открыть ${id&&run?.artifacts?.find(item=>item.id===id)?.type==='InteractiveResult'?'интерактивный результат':'результат'}</h1><p>${esc(error.message)}</p><button class="artifact-inline-back">Вернуться к результату</button>`;
    content.querySelector('.artifact-inline-back').onclick=closeArtifact;
  }
}

function markdown(value){return String(value).split('\n').map(line=>{const text=esc(line);if(/^# /.test(line))return`<h1>${text.slice(2)}</h1>`;if(/^## /.test(line))return`<h2>${text.slice(3)}</h2>`;if(/^[-*] /.test(line))return`<li>${text.slice(2)}</li>`;return line.trim()?`<p>${text}</p>`:''}).join('')}
function closeArtifact(){if($('#artifact').hidden)return false;$('#artifact').hidden=true;$('#artifactFrame').srcdoc='';$('#artifactFrame').removeAttribute('src');$('#artifactContent').replaceChildren();$('#windowControl').textContent='×';screen(['result','observation','history'].includes(beforeArtifact)?beforeArtifact:'result');return true}
function newGeneration(){store.close();run=null;currentRunId=null;localStorage.removeItem('agentsuite.currentRunId');pendingLaunchRequestId=null;briefReady=false;$('#runTabs').hidden=true;$('#ctoFork').hidden=true;$('#resultArtifacts').replaceChildren();screen('start')}
async function cancelRun(){if(!currentRunId)return;$('#cancelRun').disabled=true;$('#cancelRun').textContent='Отмена…';const response=await fetch(`/api/runs/${encodeURIComponent(currentRunId)}/cancel`,{method:'POST'}),value=await response.json();if(!response.ok){$('#cancelRun').disabled=false;$('#cancelRun').textContent='Отменить';return alert(value.error)}await renderResult(currentRunId)}
async function copyDiagnostics(){const value=await fetch('/api/diagnostics').then(response=>response.json());await navigator.clipboard.writeText(JSON.stringify(value,null,2));$('#copyDiagnostics').textContent='Скопировано';setTimeout(()=>$('#copyDiagnostics').textContent='Диагностика',1200)}

const humanStatus=status=>({completed:'Готово',running:'Идёт исследование',launching:'Подготавливается',created:'Подготавливается',failed:'Не завершено',cancelled:'Отменено',interrupted:'Прервано','needs-context':'Нужны данные'}[status]||'Неизвестно');
function historyTitle(item){return item.intent||'Случайный ракурс'}
async function openHistory(){
  screen('history');const list=$('#historyList');list.innerHTML='<p>Загружаю историю…</p>';
  const value=await fetch('/api/runs').then(response=>response.ok?response.json():null).catch(()=>null);
  if(!value){list.innerHTML='<p>История сейчас недоступна.</p>';return}
  const runs=value.runs||[];
  const byId=new Map(runs.map(item=>[item.id,item]));
  const rootFor=item=>{let current=item,guard=0;while(current?.parentRunId&&byId.has(current.parentRunId)&&guard++<100)current=byId.get(current.parentRunId);return current||item};
  const groups=new Map();for(const item of runs){const root=rootFor(item),items=groups.get(root.id)||{root,items:[]};items.items.push(item);groups.set(root.id,items)}
  list.innerHTML=[...groups.values()].map(group=>`<section class="history-group"><header><small>ВОПРОС</small><h3>${esc(historyTitle(group.root))}</h3></header>${group.items.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).map(item=>`<article class="history-item ${item.id===currentRunId?'current':''}"><div><small>${esc(humanStatus(item.status))}${item.id!==group.root.id?' · другой ракурс':''}</small><h4>${esc(item.role==='cto'?'Ракурс CTO':item.role==='product-owner'?'Продуктовый ракурс':item.role||'Исследование')}</h4><p>${item.id===group.root.id?'Исходное исследование':'Те же сохранённые факты, другая интерпретация'}</p></div><button data-history-run="${esc(item.id)}">Открыть</button></article>`).join('')}</section>`).join('')||'<p>Здесь появятся завершённые и незавершённые исследования.</p>';
  list.querySelectorAll('[data-history-run]').forEach(button=>button.onclick=()=>attachRun(button.dataset.historyRun,'result'));
}

$('#randomMode').onclick=()=>setMode('random');$('#customMode').onclick=()=>setMode('custom');
$('#generate').onclick=()=>launch().catch(error=>{pendingLaunchRequestId=null;if(mode==='custom')add('Ошибка: '+error.message,'agent');else alert(error.message)});
$('#prompt').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();launch()}};
$('#runTabs').onclick=event=>{if(event.target.dataset.view){if(event.target.dataset.view==='history')openHistory();else screen(event.target.dataset.view)}};
$('#resultObservation').onclick=()=>screen('observation');$('#resultHistory').onclick=openHistory;$('#historyBack').onclick=()=>screen(currentRunId?'result':'start');
$('#cancelRun').onclick=cancelRun;$('#copyDiagnostics').onclick=()=>copyDiagnostics().catch(error=>alert(error.message));$('#newGeneration').onclick=newGeneration;
$('#artifactBack').onclick=closeArtifact;$('#artifactClose').onclick=closeArtifact;
$('#windowControl').addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();
  if(closeArtifact())return;
  if(typeof window.poDesktop?.close==='function')window.poDesktop.close();
  else window.close();
});
$('#ctoFork').onclick=()=>rerun('synthesis','cto');
window.addEventListener('keydown',event=>{const mod=event.ctrlKey||event.metaKey;if(mod&&event.shiftKey&&event.key.toLowerCase()==='o'){event.preventDefault();screen(view==='observation'?'result':'observation')}if(mod&&event.key==='1'&&currentRunId){event.preventDefault();screen('result')}if(mod&&event.key==='2'&&currentRunId){event.preventDefault();screen('observation')}if(event.key==='Escape'){if(closeArtifact())return;if(view==='history')screen(currentRunId?'result':'start')}});
const observationTestMode=new URLSearchParams(location.search).has('observation-test');
if(observationTestMode){
  window.__AGENTSUITE_OBSERVATION_TEST__=Object.freeze({
    render(state,meta={}){obsMode.inspector=null;obsMode.render(state,meta);screen('observation');return true;}
  });
}
if(currentRunId&&!observationTestMode)attachRun(currentRunId,'result').catch(()=>newGeneration());
