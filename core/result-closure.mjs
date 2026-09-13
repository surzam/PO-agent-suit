import {presentStatement,presentLimitation} from '../public/ui/statement-presentation.js';
import {metricStatements} from './epistemic-text.mjs';
export function resultClosure(synthesis,data){
 const observations=metricStatements(data),limits=presentLimitation(synthesis.textContext?.limitations);
 const difference=observations.find(s=>s.semanticUnit==='percentage-points');
 const missing=limits.length?limits:['Нет измеримого сравнения вариантов решения в предоставленных источниках.'];
 return {currentConclusion:difference?.text||'Предоставленных сведений недостаточно для выбора решения.',
  missingInformation:missing,limitations:limits,
  nextAction:difference?'Проверить сопоставимость групп и условия сбора исходных данных перед решением об изменении продукта.':`Запросить данные, закрывающие ограничение: ${missing[0]}`,
  statements:(synthesis.keyClaims||[]).map(presentStatement).filter(s=>s.text),numericBindings:difference?.metricRefs||[]};
}
// Lossless whitespace-bound pagination. Substantive words never disappear.
export function paginateText(text,limit=600){
 const words=String(text||'').match(/\S+\s*/gu)||[],pages=[];let page='';
 for(const word of words){if(page.length+word.length>limit&&page){pages.push(page.trim());page='';}page+=word;}
 if(page.trim())pages.push(page.trim());return pages.length?pages:[''];
}
