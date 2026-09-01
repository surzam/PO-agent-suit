import { JSDOM } from 'jsdom';

const requiredThemeTokens=['--bg','--ink','--accent','--font-display'];

function invalid(message){
  return Object.assign(new Error(`Presentation materialization is invalid: ${message}`),{code:'ARTIFACT_UNAVAILABLE'});
}

export function validatePresentationMaterialization(presentation){
  const data=presentation?.data||presentation||{};
  const html=String(data.html||'');
  const declaredSlides=Array.isArray(data.slides)?data.slides.length:null;
  if(!html.trim())throw invalid('HTML is empty');
  if(!/<!doctype\s+html/i.test(html)||!/<html[\s>]/i.test(html)||!/<head[\s>]/i.test(html)||!/<body[\s>]/i.test(html))throw invalid('document structure is incomplete');
  let dom;
  try{dom=new JSDOM(html)}catch{throw invalid('HTML cannot be parsed')}
  try{
    const document=dom.window.document;
    const root=document.querySelector('.deck-viewport');
    const stage=document.getElementById('deckStage');
    const slides=[...document.querySelectorAll('#deckStage > .slide')];
    if(!root||!stage)throw invalid('presentation root is missing');
    if(!slides.length)throw invalid('presentation contains no slides');
    if(declaredSlides!==null&&declaredSlides!==slides.length)throw invalid(`slide count mismatch (${declaredSlides} != ${slides.length})`);
    for(const id of ['deckPrev','deckNext','deckPosition'])if(!document.getElementById(id))throw invalid(`navigation control ${id} is missing`);
    const bootstrap=[...document.scripts].map(item=>item.textContent||'').find(text=>text.includes("querySelectorAll('.slide')"));
    if(!bootstrap||!bootstrap.includes("getElementById('deckStage')")||!bootstrap.includes('function go(')||!bootstrap.includes("addEventListener('keydown'"))throw invalid('renderer bootstrap is incomplete');
    const styles=[...document.querySelectorAll('style')].map(item=>item.textContent||'').join('\n');
    const rootBlock=styles.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
    if(!rootBlock)throw invalid('theme root is missing');
    for(const token of requiredThemeTokens){
      const value=rootBlock.match(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*:\\s*([^;}]*)`))?.[1]?.trim();
      if(!value||/^(?:undefined|null)$/i.test(value))throw invalid(`theme token ${token} is invalid`);
    }
    if(/:root\s*\{\s*(?:undefined|null)\s*\}/i.test(styles))throw invalid('serialized theme is invalid');
    return {slideCount:slides.length};
  }finally{dom.window.close()}
}

