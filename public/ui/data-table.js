const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

const normalizeRows=data=>{
  const provenance=data?.provenance?.rows||[];
  const structured=data?.structuredRows||[];
  const source=structured.length?structured:(data?.rows||[]).map((values,index)=>({values,rowId:provenance[index]?.rowId}));
  return source.map((row,index)=>{
    const proof=provenance.find(item=>String(item.rowId)===String(row.rowId))||provenance[index]||{};
    return {rowId:row.rowId||proof.rowId||`row-${index+1}`,values:row.values||row,evidenceIds:row.evidenceIds||proof.evidenceIds||[],sourceTitle:row.sourceTitle||proof.sourceTitle||''};
  });
};

export function renderDataTable(host,artifact,{onEvidence=()=>{}}={}){
  const data=artifact?.data||artifact||{},columns=data.columns||[],rows=normalizeRows(data);
  let filter='',sort={index:null,direction:1};
  const render=()=>{
    const query=filter.trim().toLowerCase();
    const visible=rows.filter(row=>!query||[...row.values,row.sourceTitle].join(' ').toLowerCase().includes(query));
    const ordered=sort.index==null?visible:[...visible].sort((a,b)=>String(a.values[sort.index]??'').localeCompare(String(b.values[sort.index]??''),'ru',{numeric:true})*sort.direction);
    host.innerHTML=`<div class="data-table-shell"><header class="data-table-head"><div><h1>${esc(data.title||'Таблица')}</h1><p>Сортируйте данные и открывайте сохранённое основание строки.</p></div><label>ПОИСК<input data-data-filter value="${esc(filter)}" placeholder="Факт или источник"></label></header><p class="data-table-count">${ordered.length} из ${rows.length} строк</p><div class="data-table-wrap"><table><thead><tr>${columns.map((column,index)=>`<th><button data-data-sort="${index}">${esc(column)}${sort.index===index?(sort.direction>0?' ↑':' ↓'):''}</button></th>`).join('')}<th>ОСНОВАНИЕ</th></tr></thead><tbody>${ordered.map(row=>`<tr>${row.values.map(value=>`<td>${esc(value)}</td>`).join('')}<td>${row.evidenceIds[0]?`<button class="data-evidence-link" data-data-evidence="${esc(row.evidenceIds[0])}">Проверить</button>`:'<span>Не сохранено</span>'}</td></tr>`).join('')||`<tr><td colspan="${Math.max(2,columns.length+1)}">По этому запросу ничего не найдено.</td></tr>`}</tbody></table></div></div>`;
    host.querySelector('[data-data-filter]')?.addEventListener('input',event=>{filter=event.target.value;render()});
    host.querySelectorAll('[data-data-sort]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.dataSort);sort={index,direction:sort.index===index?-sort.direction:1};render()});
    host.querySelectorAll('[data-data-evidence]').forEach(button=>button.onclick=()=>onEvidence(button.dataset.dataEvidence));
  };
  render();
  return host;
}
