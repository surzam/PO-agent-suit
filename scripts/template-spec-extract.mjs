#!/usr/bin/env node
// Build-time discovery only. It never writes specs and never becomes Runtime
// authority: reviewed JSON in presentation/template-specs is the sole input.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const library=path.join(root,'template-library');
const requested=process.argv.slice(2).filter(value=>!value.startsWith('-'));
const index=JSON.parse(await fs.readFile(path.join(library,'index.json'),'utf8')).templates||[];
const selected=(requested.length?index.filter(item=>requested.includes(item.slug)):index).sort((a,b)=>a.slug.localeCompare(b.slug));
const candidates=[];
for(const item of selected){
  const directory=path.join(library,'templates',item.slug);
  const [html,json,design]=await Promise.all(['template.html','template.json','design.md'].map(file=>fs.readFile(path.join(directory,file),'utf8').catch(()=>'')));
  const dom=new JSDOM(html);const slides=[...dom.window.document.querySelectorAll('.slide, section.slide, [data-slide]')];
  const classes=[...new Set(slides.flatMap(node=>[...node.classList]).filter(name=>!/^(slide|active|current)$/i.test(name)))];
  candidates.push({templateId:item.slug,origin:'upstream',identity:{name:json?JSON.parse(json).name||item.name:item.name,mood:item.mood||[],tone:item.tone||[],density:item.density||null,scheme:item.scheme||null},discovery:{nativeClassCandidates:classes,slideCount:slides.length,hasInlineScript:/<script(?![^>]+src)/i.test(html),externalScripts:[...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(match=>match[1]),remoteResources:[...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)/gi)].map(match=>match[1]),designHeadings:[...design.matchAll(/^#{1,3}\s+(.+)$/gm)].map(match=>match[1]).slice(0,20)},warnings:['Candidate only: semantic intents, slots, capacity, geometry, and decorations require reviewed overrides.']});
  dom.window.close();
}
process.stdout.write(`${JSON.stringify({schemaVersion:1,generatedBy:'template-spec-extract',templates:candidates},null,2)}\n`);
