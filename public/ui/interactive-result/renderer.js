const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const plural=(count,one,few,many)=>{const value=Math.abs(Number(count)||0)%100,tail=value%10;if(value>10&&value<20)return many;if(tail===1)return one;if(tail>1&&tail<5)return few;return many};
const sourceName=row=>row?.sourceTitle||'Источник не указан';
const valueText=row=>(row?.values||[]).filter(value=>String(value||'').trim()).join(' · ')||'Факт не содержит текста';

function surfaceModel(artifact){
  const surface=artifact?.data||artifact;
  const message=surface?.messages?.find(item=>item.createSurface);
  if(!message)throw new Error('Interactive Result surface is missing');
  return surface.dataModel||message.createSurface.dataModel||{};
}

function provenance(model,{kind,id}){
  if(kind==='metric'){
    const metric=model.metrics?.[id];
    return {title:metric?.label||'Метрика',kind:'Метрика',value:[metric?.value,metric?.unit].filter(Boolean).join(' '),evidenceIds:metric?.evidenceIds||[],claimIds:metric?.claimIds||[]};
  }
  const row=model.rows?.[id];
  return {title:valueText(row),kind:'Факт',value:sourceName(row),evidenceIds:row?.evidenceIds||[],claimIds:row?.claimIds||[]};
}

export function renderInteractiveResult(host,artifact,{onEvidence=()=>{}}={}){
  const model=surfaceModel(artifact);
  const rows=Object.values(model.rows||{}),metrics=Object.values(model.metrics||{}),insights=Object.values(model.insights||{});
  const tabs=[['overview','Обзор'],['facts','Факты'],['data','Данные'],['sources','Источники']];
  let active='overview',filter='',sort={index:null,direction:1};

  const evidenceButton=id=>`<button class="ir-link" data-evidence="${esc(id)}">Показать источник</button>`;
  const provenanceButton=(kind,id,label='Почему?')=>`<button class="ir-link" data-provenance-kind="${kind}" data-provenance-id="${esc(id)}">${label}</button>`;
  const facts=()=>rows.length?rows.map(row=>`<article class="ir-fact"><strong>ФАКТ</strong><p>${esc(valueText(row))}</p><small>${esc(sourceName(row))}</small><div>${provenanceButton('row',row.rowId)}${(row.evidenceIds||[]).slice(0,1).map(evidenceButton).join('')}</div></article>`).join(''):'<p class="ir-empty">Факты не были сохранены в данных этого результата.</p>';
  const insightCards=()=>insights.length?insights.map(item=>`<article class="ir-insight"><strong>ИНТЕРПРЕТАЦИЯ</strong><p>${esc(item.text||'Интерпретация отсутствует')}</p><small>${item.grounding==='grounded'?'Основана на сохранённых утверждениях':'Прямое основание не сохранено'}</small></article>`).join(''):'<p class="ir-empty">Интерпретации отсутствуют.</p>';
  const overview=()=>`<section class="ir-overview"><p class="ir-kicker">ИНТЕРАКТИВНЫЙ РЕЗУЛЬТАТ</p><h1 class="ir-heading">${esc(model.title||'Интерактивный результат')}</h1><p class="ir-lede">Исследуйте вывод, факты и их основания. Все значения ниже взяты из сохранённых данных запуска.</p><section class="ir-section"><h2>Ключевые метрики</h2><div class="ir-metric-grid">${metrics.length?metrics.slice(0,5).map(item=>`<article class="ir-metric"><small>МЕТРИКА · ${esc(item.origin||'сохранённые данные')}</small><strong>${esc(item.value)}</strong><span>${esc([item.label,item.unit].filter(Boolean).join(' '))}</span>${provenanceButton('metric',item.metricId)}</article>`).join(''):'<p class="ir-empty">Метрики не были выделены.</p>'}</div></section><section class="ir-section"><h2>Главные выводы</h2><div class="ir-insight-grid">${insightCards()}</div></section><section class="ir-section ir-preview"><h2>Проверяемые факты</h2>${facts().split('</article>').slice(0,3).join('</article>')}<button class="ir-primary" data-tab="facts">Все факты</button></section>`;
  const data=()=>{
    const q=filter.trim().toLowerCase();
    const visible=rows.filter(row=>!q||valueText(row).toLowerCase().includes(q)||sourceName(row).toLowerCase().includes(q));
    const ordered=sort.index==null?visible:[...visible].sort((a,b)=>String(a.values?.[sort.index]??'').localeCompare(String(b.values?.[sort.index]??''),'ru',{numeric:true})*sort.direction);
    return `<section class="ir-section ir-data"><header class="ir-section-head"><div><h2>Данные</h2><p>Сортируйте и фильтруйте таблицу локально: запуск не меняется.</p></div><label>Поиск<input data-table-filter value="${esc(filter)}" placeholder="Факт или источник"></label></header><p class="ir-count">${ordered.length} ${plural(ordered.length,'строка','строки','строк')} из ${rows.length}</p><div class="ir-table-wrap"><table class="ir-table"><thead><tr>${(model.columns||[]).map((column,index)=>`<th><button data-sort="${index}">${esc(column)}${sort.index===index?(sort.direction>0?' ↑':' ↓'):''}</button></th>`).join('')}<th>Основание</th></tr></thead><tbody>${ordered.map(row=>`<tr>${(row.values||[]).map(value=>`<td>${esc(value)}</td>`).join('')}<td>${provenanceButton('row',row.rowId,'Проверить')}</td></tr>`).join('')||`<tr><td colspan="${Math.max(2,(model.columns||[]).length+1)}">По этому запросу ничего не найдено.</td></tr>`}</tbody></table></div></section>`;
  };
  const sources=()=>{
    const groups=new Map();
    for(const row of rows){const title=sourceName(row),current=groups.get(title)||{title,rows:[],evidence:new Set()};current.rows.push(row);for(const id of row.evidenceIds||[])current.evidence.add(id);groups.set(title,current)}
    return `<section class="ir-section"><h2>Источники</h2><p class="ir-lede">Источник появляется здесь, только если он связан с сохранённым фактом.</p><div class="ir-source-list">${[...groups.values()].map(group=>`<article class="ir-source"><strong>${esc(group.title)}</strong><small>${group.rows.length} ${plural(group.rows.length,'факт','факта','фактов')}</small><div>${[...group.evidence].map(evidenceButton).join('')||'<span class="ir-muted">Ссылка на evidence не сохранена</span>'}</div></article>`).join('')||'<p class="ir-empty">Источники отсутствуют.</p>'}</div></section>`;
  };
  const panel=ref=>{const item=provenance(model,ref);return `<aside class="ir-provenance" aria-live="polite"><button class="ir-panel-close" data-close-provenance aria-label="Закрыть">×</button><p class="ir-kicker">${esc(item.kind)}</p><h2>${esc(item.title)}</h2><p>${esc(item.value||'')}</p><dl><dt>Evidence</dt><dd>${item.evidenceIds.length?item.evidenceIds.map(evidenceButton).join(' '):'Прямая ссылка не сохранена'}</dd><dt>Утверждения</dt><dd>${item.claimIds.length?item.claimIds.map(esc).join(', '):'Не сохранены'}</dd></dl></aside>`};
  const content=()=>active==='overview'?overview():active==='facts'?`<section class="ir-section"><h2>Факты</h2><p class="ir-lede">Факт — это сохранённая строка данных, а не интерпретация.</p><div class="ir-fact-grid">${facts()}</div></section>`:active==='data'?data():sources();
  const render=(currentPanel='')=>{
    host.innerHTML=`<div class="ir-shell"><nav class="ir-tabs" role="tablist" aria-label="Разделы интерактивного результата">${tabs.map(([id,label])=>`<button role="tab" aria-selected="${active===id}" class="${active===id?'active':''}" data-tab="${id}">${label}</button>`).join('')}</nav><main class="ir-content">${content()}</main>${currentPanel}</div>`;
    host.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{active=button.dataset.tab;render()});
    host.querySelector('[data-table-filter]')?.addEventListener('input',event=>{filter=event.target.value;render()});
    host.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.sort);sort={index,direction:sort.index===index?-sort.direction:1};render()});
    host.querySelectorAll('[data-evidence]').forEach(button=>button.onclick=()=>onEvidence(button.dataset.evidence));
    host.querySelectorAll('[data-provenance-kind]').forEach(button=>button.onclick=()=>render(panel({kind:button.dataset.provenanceKind,id:button.dataset.provenanceId})));
    host.querySelector('[data-close-provenance]')?.addEventListener('click',()=>render());
  };
  render();
  return host;
}
