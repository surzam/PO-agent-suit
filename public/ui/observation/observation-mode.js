import { AgentTerminal, recordText } from './agent-terminal.js';
import { EventKeyboard } from './event-keyboard.js';
import { FilesystemProjection } from './filesystem-projection.js';
import { CapabilityController } from '../session/capability-controller.js';
import { adaptComposition, rendererRegionAttributes } from '../session/composition-renderer.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const clip = (value, max = 170) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const boundary = text.lastIndexOf(' ', max - 1);
  return `${text.slice(0, boundary > Math.floor(max * .55) ? boundary : max - 1).trimEnd()}…`;
};

export const HUMAN_STAGE_LABELS = Object.freeze({
  'intent-discovery':'ПОИСК ВОПРОСА', intent:'ВОПРОС', brief:'КОНТЕКСТ', research:'ПОИСК',
  validation:'ПРОВЕРКА', synthesis:'ВЫВОД', data:'ДАННЫЕ', 'interactive-result':'ИНТЕРАКТИВНО',
  narrative:'РАССКАЗ', slides:'СЛАЙДЫ'
});
const RESEARCH_FLOW_STAGE_IDS = Object.freeze(['intent-discovery', 'intent', 'brief', 'research', 'validation', 'synthesis', 'data']);
const RENDERER_CAPABILITIES=Object.freeze({surfaces:['activity','workspace','source','evidence','validation','table','story','presentation','choice','approval','input','progress'],interactions:['select','expand','collapse','invoke','submit','sort','filter','navigate']});

const label = type => ({ Narrative:'Рассказ', DataArtifact:'Таблица', Presentation:'Слайды', InteractiveResult:'Интерактивный результат', SynthesisPlan:'Вывод', EvidenceSet:'Факты и источники', ValidationReport:'Проверка', Brief:'Контекст', Intent:'Вопрос' }[type] || type);
const humanStage = id => HUMAN_STAGE_LABELS[id] || String(id || '').toUpperCase();
const humanSourceState = value => ({ available:'Найден', opened:'Открыт', read:'Прочитан', 'used-as-evidence':'Использован', failed:'Ошибка' }[value] || value || 'Найден');
const stagePurpose = {
  'intent-discovery':'Находит новый вопрос через реальный Model inference.', intent:'Фиксирует пользовательский вопрос как общий Intent.', brief:'Определяет цель, аудиторию и ожидаемое решение.', research:'Читает доступные источники и собирает Evidence.', validation:'Сохраняет решение о доверии для каждого Evidence.', synthesis:'Выбирает смысл и claims через текущий профессиональный ракурс.', data:'Структурирует факты, метрики и интерпретации с provenance.', 'interactive-result':'Материализует проверяемый интерактивный результат из DataArtifact.', narrative:'Материализует структурированные данные в человеческий рассказ.', slides:'Материализует те же данные и framing в презентацию.'
};
const formatDuration = milliseconds => {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((value, index) => index ? String(value).padStart(2, '0') : String(value)).join(':');
};
const systemPanel = state => {
  const system = state?.system || {}, gpu = system.gpu?.[0], started = Date.parse(state?.startedAt || '');
  const elapsed = state?.status === 'running' && started ? Math.max(0, Date.now() - started) : Number(state?.elapsedMs || 0);
  const ram = system.process?.rssMiB ? `${system.process.rssMiB} MiB` : '—';
  const gpuText = gpu ? `${gpu.name || 'GPU'} · ${Number.isFinite(gpu.utilization) ? `${gpu.utilization}%` : '—'}` : 'НЕДОСТУПЕН';
  return `<aside class="system-readout" aria-label="Системное состояние"><span><i>RUN TIME</i><b>${formatDuration(elapsed)}</b></span><span><i>APP RAM</i><b>${esc(ram)}</b></span><span><i>GPU</i><b>${esc(gpuText)}</b></span></aside>`;
};

export class ObservationMode {
  constructor(root, { openArtifact, respondToInterrupt,invokeCapability } = {}) {
    this.root = root;
    this.openArtifact = openArtifact;
    this.respondToInterrupt=respondToInterrupt;this.submittingInterrupt=false;this.interruptError=null;
    this.invokeCapability=invokeCapability;
    this.state = null;
    this.meta = null;
    this.inspector = null;
    this.terminal = new AgentTerminal(() => this.render(this.state, this.meta));
    this.keyboard = new EventKeyboard();
    this.filesystem = new FilesystemProjection({onInspect:value=>this.inspect(value),onChange:()=>this.render(this.state,this.meta)});
    this.capabilityController=new CapabilityController({invoke:invokeCapability,onChange:()=>this.state&&this.render(this.state,this.meta)});
  }

  render(state, meta = {}) {
    this.state = state;
    this.meta = meta;
    const world = state.contextWorld || { roots:[], sources:[] };
    const stageById = new Map((state.stages || []).map(stage => [stage.id, stage]));
    const fallbackStage = id => ({ id, state:'future', result:{ artifacts:[], reusedArtifacts:[] } });
    const stageButton = (stage, { viewId = stage.id, labelText = humanStage(stage.id), inspectId = stage.id, canonicalStageId = stage.id } = {}) => `<button class="flow-stage ${esc(stage.state)}" data-flow-stage="${esc(viewId)}" data-canonical-stage="${esc(canonicalStageId)}" data-inspect="stage:${esc(inspectId)}" title="${esc(labelText)}"><span>${esc(labelText)}</span>${stage.state === 'reused' ? '<small>ПОВТОРНО</small>' : ''}</button>`;
    const mainStages = RESEARCH_FLOW_STAGE_IDS.map(id => stageById.get(id) || fallbackStage(id));
    const resultStages = [
      stageById.get('narrative') || fallbackStage('narrative'),
      { ...(stageById.get('data') || fallbackStage('data')), id:'data-table' },
      stageById.get('slides') || fallbackStage('slides')
    ];
    const intent = String(state.intent || 'Следующая история ещё не существует').replace(/\s+/g, ' ').trim();
    const displayIntent = clip(intent, 230);
    const composition=state.session?.surfaceComposition||{};
    const layout=adaptComposition({surfaces:state.session?.surfaceState?.items||[],composition,rendererCapabilities:RENDERER_CAPABILITIES,viewportClass:'wide',localUiState:{activeResultTab:this.activeResultTab}});
    const attrs=rendererRegionAttributes(layout);
    this.root.innerHTML = `<div class="obs-workstation" data-primary-surface="${esc(attrs['data-primary-surface'])}" data-supporting-surfaces="${esc(attrs['data-supporting-surfaces'])}" data-background-surfaces="${esc(attrs['data-background-surfaces'])}" data-composition-signature="${esc(attrs['data-composition-signature'])}"><nav class="flow-surface" aria-label="Ход исследования"><div class="flow-title"><small>ХОД ИССЛЕДОВАНИЯ</small><strong>${esc(humanStage(state.activeStage) || state.status || 'готово')}</strong></div><div class="flow-chain"><div class="flow-main" data-flow-region="main">${mainStages.map(stageButton).join('')}</div><div class="flow-results" data-flow-region="results"><small>РЕЗУЛЬТАТЫ</small><div class="flow-results-grid">${stageButton(resultStages[0])}${stageButton(resultStages[1], { viewId:'data-table', labelText:'ТАБЛИЦА', inspectId:'data', canonicalStageId:'data' })}${stageButton(resultStages[2])}</div></div></div></nav><div class="workstation-body">${this.filesystem.render(state.filesystem)}<main class="agent-work" data-semantic-region="primary"><section class="intent-strip"><div class="intent-copy"><small>${state.intent ? 'ВОПРОС' : 'ИЩУ НОВЫЙ РАКУРС'}</small><button class="intent-question" data-inspect="intent:current" title="${esc(intent)}" aria-label="Открыть полный вопрос в Inspector"><h2>${esc(displayIntent)}</h2></button></div>${systemPanel(state)}</section>${this.terminal.render(state)}${this.keyboard.render(state)}</main><aside class="right-rail" data-semantic-region="supporting">${this.inspector ? this.inspectorView(this.inspector) : this.defaultRail(state)}</aside></div></div>`;
    const interactionSurface=state.session?.surfaceState?.items?.find(item=>item.scope==='interrupt'&&item.lifecycle==='active'),interaction=interactionSurface?.content;if(interaction&&RENDERER_CAPABILITIES.surfaces.includes(interactionSurface.kind)&&interactionSurface.actions?.some(action=>action.capabilityId==='run.respond-to-interrupt'))this.root.querySelector('.agent-work')?.insertAdjacentHTML('afterbegin',this.interactionView(interaction));
    const draft=[...this.capabilityController.drafts.values()][0];if(draft&&RENDERER_CAPABILITIES.surfaces.includes('input'))this.root.querySelector('.agent-work')?.insertAdjacentHTML('afterbegin',this.capabilityInputView(draft.action.id,draft.surface));
    this.bind();
    this.bindSurfaceActions();
    this.filesystem.bind(this.root,state.filesystem);
    this.keyboard.play(this.root, meta.liveInput);
  }

  defaultRail(state) {
    const evidence = state.evidence?.items || [], outputs = (state.outputs || []).filter(item => ['Narrative', 'DataArtifact', 'Presentation'].includes(item.type));
    return `<div class="rail-default"><section><header><small>ФАКТЫ</small><strong>${evidence.length}</strong></header>${evidence.slice(0, 6).map(item => `<button data-inspect="evidence:${esc(item.id)}"><b>${esc(item.id)}</b><span>${esc(clip(item.claim, 70))}</span></button>`).join('') || '<p>Появятся после поиска</p>'}</section><section class="output-rail"><header><small>РЕЗУЛЬТАТЫ</small><strong>${outputs.length}</strong></header>${outputs.map(item => `<button data-inspect="artifact:${esc(item.artifactId)}"><b>${item.reused ? 'ПОВТОРНО · ' : ''}${esc(label(item.type))}</b><span>${item.reused ? 'Использован из предыдущего ракурса' : 'Готовится из этого исследования'}</span></button>`).join('') || '<p>Результаты ещё не созданы</p>'}</section><section><header><small>ИНСТРУМЕНТЫ</small></header><div class="rail-capabilities">${(state.capabilities || []).map(item => `<button class="${esc(item.state)}" data-inspect="capability:${esc(item.id)}">${esc(item.id)}<small>${esc(item.state === 'active' ? 'сейчас используется' : item.state === 'complete' ? 'готов' : item.state === 'failed' ? 'ошибка' : 'доступен')}</small></button>`).join('')}</div></section><button class="view-button" data-inspect="role:${esc(state.role?.id)}">РАКУРС <b>${esc(state.role?.label || '—')}</b></button></div>`;
  }

  interactionView(interaction){if(!interaction)return'';const options=interaction.kind==='choice'?interaction.options.map(item=>`<label><input type="radio" name="human-choice" value="${esc(item.id)}"> ${esc(item.label)}</label>`).join(''):interaction.kind==='approval'?'<label><input type="radio" name="human-choice" value="approve"> Одобрить</label><label><input type="radio" name="human-choice" value="reject"> Отклонить</label>':interaction.kind==='confirmation'?'<label><input type="radio" name="human-choice" value="yes"> Да</label><label><input type="radio" name="human-choice" value="no"> Нет</label>':'<textarea data-human-text maxlength="16384" aria-label="Ваш ответ"></textarea>';return`<section class="human-interrupt" aria-live="polite"><small>НУЖНО ВАШЕ РЕШЕНИЕ</small><h3>${esc(interaction.prompt)}</h3><div class="human-interrupt-options">${options}</div>${this.interruptError?`<p class="human-interrupt-error">${esc(this.interruptError)}</p>`:''}<button data-human-submit data-interrupt-id="${esc(interaction.interruptId)}" ${this.submittingInterrupt?'disabled':''}>${this.submittingInterrupt?'ОТПРАВЛЯЮ РЕШЕНИЕ…':'ПРОДОЛЖИТЬ'}</button></section>`;}
  capabilityInputView(actionId,inputSurface){const content=inputSurface.content,fields=content.fields.map(field=>field.kind==='text'?`<label>${esc(field.label)}<textarea data-capability-field="${esc(field.id)}" maxlength="${Number(field.constraints?.maxLength||500)}">${esc(content.values[field.id]||'')}</textarea></label>`:field.kind==='choice'?`<fieldset><legend>${esc(field.label)}</legend>${(field.options||[]).map(option=>`<label><input type="radio" name="capability-${esc(field.id)}" data-capability-field="${esc(field.id)}" value="${esc(option.id)}">${esc(option.label)}</label>`).join('')}</fieldset>`:`<label><input type="checkbox" data-capability-field="${esc(field.id)}"> ${esc(field.label)}</label>`).join('');return`<section class="human-interrupt capability-input" aria-live="polite" data-capability-draft="${esc(actionId)}"><small>ПАРАМЕТРЫ ДЕЙСТВИЯ</small><h3>${esc(content.title)}</h3><div class="human-interrupt-options">${fields}</div>${content.error?`<p class="human-interrupt-error">${esc(content.error)}</p>`:''}<div><button data-capability-dismiss>ЗАКРЫТЬ</button><button data-capability-submit>${esc(content.submitLabel)}</button></div></section>`;}

  inspectorView(selection) {
    const { kind, id } = selection, state = this.state;
    let title = id, body = '', technical = { kind, id };
    if (kind === 'intent') { title = 'Вопрос'; body = `<h4>Полный вопрос</h4><p>${esc(state.intent || 'Вопрос ещё не сформирован')}</p>`; technical = { canonicalIntent:state.intent || null }; }
    else if (kind === 'stage') { const stage = state.stages.find(item => item.id === id), artifacts = [...(stage?.result?.artifacts || []), ...(stage?.result?.reusedArtifacts || [])]; title = humanStage(stage?.id || id); body = `<p>${esc(stagePurpose[id] || 'Этап workflow.')}</p><dl><dt>Состояние</dt><dd>${esc(stage?.state || 'future')}</dd></dl>${stage?.result?.failure ? `<h4>Причина</h4><p>${esc(stage.result.failure.message)}</p>` : ''}${artifacts.map(item => this.artifactSummary(item)).join('')}${!artifacts.length && stage?.state === 'future' ? '<p class="expectation">Ожидаемый результат появится здесь после реального выполнения этапа.</p>' : ''}`; technical = stage; }
    else if (kind === 'artifact') { const item = state.artifactRefs.find(item => item.artifactId === id); title = label(item?.type); body = this.artifactSummary(item, true); technical = { artifactId:id, type:item?.type, sourceArtifactIds:item?.sourceArtifactIds, producedByOperationId:item?.producedByOperationId }; }
    else if (kind === 'source') { const item = state.contextWorld.sources.find(item => item.sourceId === id), evidence = (item?.evidenceIds || []).map(eid => state.evidence.items.find(item => String(item.id) === String(eid))).filter(Boolean); title = item?.safeDisplayName || id; body = `<dl><dt>Откуда</dt><dd>${esc(item?.contextRootId || '—')}</dd><dt>Tracking</dt><dd>${esc(item?.tracking || 'UNTRACKED')}</dd><dt>Использовал</dt><dd>${esc(item?.capability || '—')}</dd></dl><h4>Что появилось</h4>${evidence.map(item => `<button data-inspect="evidence:${esc(item.id)}">${esc(item.id)} · ${esc(clip(item.claim, 90))}</button>`).join('') || '<p>Evidence не связан.</p>'}`; technical = item; }
    else if (kind === 'evidence') { const item = state.evidence.items.find(item => String(item.id) === id); title = `Evidence ${id}`; body = `<h4>Что установлено</h4><p>${esc(item?.claim || '—')}</p><dl><dt>Источник</dt><dd>${esc(item?.sourceTitle || item?.sourceId || '—')}</dd><dt>Проверка</dt><dd>${esc(item?.validation?.status || String(item?.validation?.valid ?? 'unknown'))}</dd><dt>Kind</dt><dd>${esc(item?.kind || '—')}</dd></dl><h4>Claims</h4><p>${(item?.usedBy || []).map(esc).join(', ') || '—'}</p><h4>Structured Data</h4><p>${Object.entries(item?.dataRefs || {}).flatMap(([, ids]) => ids).map(esc).join(', ') || '—'}</p>`; technical = item; }
    else if (kind === 'action') { const item = state.agentActions.find(item => item.id === id); title = item?.displayInput || 'Agent Action'; body = `<dl><dt>Capability</dt><dd>${esc(item?.capability || '—')}</dd><dt>Status</dt><dd>${esc(item?.status || '—')}</dd><dt>Result</dt><dd>${esc(item?.resultSummary || '—')}</dd></dl>`; technical = item; }
    else if (kind === 'event') { const item = state.consoleLines.find(item => item.eventId === id); title = item?.type || 'Runtime Event'; body = `<p>${esc(recordText({ event:item }))}</p>`; technical = { eventId:item?.eventId, sequence:item?.sequence, stage:item?.stage, capability:item?.capability }; }
    else if (kind === 'capability') { const item = state.capabilities.find(item => item.id === id); title = id; body = `<p>Реальная Runtime capability. Инспекция ничего не запускает.</p><dl><dt>Состояние</dt><dd>${esc(item?.state || '—')}</dd></dl>`; technical = item; }
    else if (kind === 'role') { title = state.role?.label || 'VIEW'; body = '<p>Профессиональная оптика, через которую Synthesis выбирает значение фактов.</p>'; technical = state.role; }
    body+=this.surfaceActionView(kind,id);
    return `<div class="inspector-lens"><header><button data-inspector-close aria-label="Назад">←</button><div><small>INSPECTOR · ${esc(kind)}</small><h3>${esc(title)}</h3></div></header>${body}<details><summary>Технические детали</summary><pre>${esc(JSON.stringify(technical, null, 2))}</pre></details></div>`;
  }

  artifactSummary(item, open = false) {
    if (!item) return '';
    let details = '';
    if (item.type === 'Intent') details = `<p>${esc(item.question || this.state.intent || 'Intent создан')}</p><dl><dt>Почему</dt><dd>${esc(item.reason || '—')}</dd><dt>Решение</dt><dd>${esc(item.expectedDecision || '—')}</dd></dl>`;
    if (item.type === 'Brief') details = `<dl><dt>Цель</dt><dd>${esc(item.goal || '—')}</dd><dt>Решение</dt><dd>${esc(item.expectedDecision || '—')}</dd></dl>`;
    if (item.type === 'EvidenceSet') details = `<p>${item.count || 0} Evidence</p>`;
    if (item.type === 'ValidationReport') details = `<p>${item.decisions?.length || 0} validation decisions · ${item.valid ? 'completed' : 'attention required'}</p>`;
    if (item.type === 'SynthesisPlan') details = `<p>${(item.claims || []).map(item => esc(item.claim)).join('<br>') || 'SynthesisPlan создан'}</p>`;
    if (item.type === 'DataArtifact') details = `<p>${item.rows?.length || 0} rows · ${item.metrics?.length || 0} metrics · ${item.insights?.length || 0} insights</p>${(item.rows || []).slice(0, 3).map((row, index) => `<p><b>${esc(item.provenance?.rows?.[index]?.rowId || 'row')}</b> · ${esc(row.join?.(' · ') || row)}</p>`).join('')}`;
    if (item.type === 'Narrative') details = `<p>${esc(item.excerpt || 'Narrative создан')}</p>`;
    if (item.type === 'Presentation') details = `<p>${item.slides?.length || 0} slides</p>${(item.slides || []).slice(0, 4).map(slide => `<p>${esc(slide.index)} · ${esc(slide.title || 'Slide')}</p>`).join('')}`;
    const deps = (item.sourceArtifactIds || []).map(sourceId => this.state.dependencies.find(edge => edge.fromArtifactId === sourceId && edge.toArtifactId === item.artifactId)).filter(Boolean);
    return `<article class="artifact-summary"><h4>${item.reused ? 'REUSED · ' : ''}${esc(label(item.type))}</h4>${details}${deps.length ? `<h5>Direct upstream</h5>${deps.map(item => `<p>${esc(item.fromType)} <b>${esc(item.relation)}</b></p>`).join('')}` : ''}${open || ['Narrative', 'DataArtifact', 'Presentation'].includes(item.type) ? `<button data-open-artifact="${esc(item.artifactId)}">Открыть ${esc(label(item.type))}</button>` : ''}</article>`;
  }

  surfaceActionView(kind,id){const surfaceId=kind==='source'?`surface:source:${id}`:kind==='evidence'?`surface:evidence:${id}`:kind==='stage'&&id==='validation'?`surface:validation:${this.state.runId}`:null,surface=this.state.session?.surfaceState?.items?.find(item=>item.id===surfaceId);return(surface?.actions||[]).map(action=>`<section class="surface-action"><button data-surface-action="${esc(action.id)}" data-capability-id="${esc(action.capabilityId)}">${esc(action.label)}</button><small>Действие изменит Runtime только после подтверждения.</small></section>`).join('');}
  bindSurfaceActions(){this.root.querySelectorAll('[data-surface-action]').forEach(button=>button.onclick=async()=>{const surface=this.state.session?.surfaceState?.items?.find(item=>item.actions?.some(action=>action.id===button.dataset.surfaceAction)),action=surface?.actions?.find(item=>item.id===button.dataset.surfaceAction);if(!action)return;button.disabled=true;try{await this.capabilityController.begin(action)}catch(error){button.disabled=false;button.textContent='ПОВТОРИТЬ';button.title=error.message}});}

  inspect(value) { const [kind, ...rest] = String(value).split(':'); this.inspector = { kind, id:rest.join(':') }; this.render(this.state, this.meta); }
  bind() { this.terminal.bind(this.root); this.root.querySelectorAll('[data-inspect]').forEach(button => button.onclick = () => this.inspect(button.dataset.inspect)); this.root.querySelector('[data-inspector-close]')?.addEventListener('click', () => { this.inspector = null; this.render(this.state, this.meta); }); this.root.querySelectorAll('[data-open-artifact]').forEach(button => button.onclick = () => this.openArtifact?.(button.dataset.openArtifact));const submit=this.root.querySelector('[data-human-submit]');if(submit)submit.onclick=async()=>{const interaction=this.state.session?.ui?.pendingInteraction,selected=this.root.querySelector('input[name="human-choice"]:checked'),field=this.root.querySelector('[data-human-text]');let response;if(interaction.kind==='choice')response={optionId:selected?.value};else if(interaction.kind==='approval')response={decision:selected?.value};else if(interaction.kind==='confirmation')response={confirmed:selected?.value==='yes'};else response={text:field?.value||''};this.submittingInterrupt=true;this.interruptError=null;this.render(this.state,this.meta);try{await this.respondToInterrupt?.(interaction.interruptId,response)}catch(error){this.interruptError=error.message}finally{this.submittingInterrupt=false;this.render(this.state,this.meta)}};const draft=this.root.querySelector('[data-capability-draft]');if(draft){const actionId=draft.dataset.capabilityDraft;draft.querySelectorAll('[data-capability-field]').forEach(field=>field.oninput=()=>this.capabilityController.setValue(actionId,field.dataset.capabilityField,field.type==='checkbox'?field.checked:field.value));draft.querySelector('[data-capability-dismiss]').onclick=()=>this.capabilityController.dismiss(actionId);draft.querySelector('[data-capability-submit]').onclick=()=>this.capabilityController.submitDraft(actionId);} }
}
