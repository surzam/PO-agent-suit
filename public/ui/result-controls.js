const $=selector=>document.querySelector(selector);
const outputLabels={Narrative:'Рассказ',DataArtifact:'Таблица',Presentation:'Презентация'};
let lastRunId=null;

function show(name){
  document.querySelectorAll('.screen').forEach(node=>node.classList.toggle('active',node.id===name));
  document.querySelectorAll('#runTabs button').forEach(node=>node.classList.toggle('active',node.dataset.view===name));
  $('#startControls').hidden=name!=='start';
}
function reset(){
  lastRunId=null;$('#runTabs').hidden=true;$('#ctoFork').hidden=true;$('#resultArtifacts').replaceChildren();
  $('#resultTitle').textContent='AgentSuite';$('#resultStatus').textContent='Следующая история ещё не существует.';show('start');
}
async function currentRun(){
  const runs=await fetch('/api/runs').then(response=>response.json()).catch(()=>({runs:[]}));
  return runs.runs?.[0]||null;
}
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function markdown(value){return String(value).split('\n').map(line=>{const safe=esc(line);if(/^# /.test(line))return`<h1>${safe.slice(2)}</h1>`;if(/^## /.test(line))return`<h2>${safe.slice(3)}</h2>`;if(/^[-*] /.test(line))return`<li>${safe.slice(2)}</li>`;return line.trim()?`<p>${safe}</p>`:''}).join('')}
async function openArtifact(id){
  const artifact=await fetch('/api/artifacts/'+id).then(response=>response.json()).catch(()=>null);if(!artifact)return;
  $('#artifact').hidden=false;$('#windowControl').textContent='←';$('#artifactContent').style.display='block';$('#artifactFrame').style.display='none';
  if(artifact.type==='Presentation'){$('#artifactContent').style.display='none';$('#artifactFrame').style.display='block';$('#artifactFrame').srcdoc=artifact.data.html}
  else if(artifact.type==='DataArtifact'){$('#artifactContent').innerHTML=`<h1>${esc(artifact.data.title||'Таблица')}</h1><table><thead><tr>${(artifact.data.columns||[]).map(column=>`<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${(artifact.data.rows||[]).map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
  else $('#artifactContent').innerHTML=markdown(artifact.data.content||'');
}
async function syncResult(){
  if($('#runTabs').hidden||!$('#result').classList.contains('active'))return;
  const run=await currentRun();if(!run||run.id===lastRunId&&$('#resultArtifacts').children.length)return;lastRunId=run.id;
  $('#resultTitle').textContent=run.intent||'Run завершён';$('#resultArtifacts').replaceChildren();$('#ctoFork').hidden=true;
  const context=[...run.events].reverse().find(event=>event.type==='ResearchContextRequired'||event.type==='IntentDiscoveryInsufficientContext');
  const failure=[...run.events].reverse().find(event=>event.type==='RunFailed'||event.type==='IntentDiscoveryFailed');
  if(context){
    const required=context.payload?.requiredContext||[];
    $('#resultStatus').textContent=context.payload?.message||`Для следующего ракурса мне не хватает информации о ${required.join(', ')}.`;
    if(context.type==='ResearchContextRequired'&&context.payload?.canAddSource){const add=document.createElement('button');add.textContent='Добавить источник';add.onclick=()=>document.querySelector('#addSource')?.click();$('#resultArtifacts').append(add)}
  }else if(failure){
    $('#resultStatus').textContent=failure.payload?.message||'Выполнение завершилось ошибкой.';
  }else if(run.status==='completed'){
    $('#resultStatus').textContent='Результаты собраны из Runtime artifacts.';
    for(const artifact of run.artifacts.filter(item=>outputLabels[item.type])){const button=document.createElement('button');button.textContent=outputLabels[artifact.type];button.onclick=()=>openArtifact(artifact.id);$('#resultArtifacts').append(button)}
    $('#ctoFork').hidden=false;
  }else $('#resultStatus').textContent='Откройте Наблюдение, чтобы видеть текущую работу.';
}

$('#resultObservation').onclick=()=>show('observation');
$('#newGeneration').onclick=reset;
const observer=new MutationObserver(()=>{syncResult()});observer.observe($('#runTabs'),{attributes:true,attributeFilter:['hidden']});observer.observe($('#resultTitle'),{childList:true,characterData:true,subtree:true});
setInterval(syncResult,1000);
