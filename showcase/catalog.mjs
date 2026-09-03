import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
export const SHOWCASE_IDS=Object.freeze(['saas-delivery-review','checkout-conversion','b2b-onboarding','platform-migration','product-launch']);
function hashSeed(value){return Number.parseInt(createHash('sha256').update(String(value||'agentsuite-showcase')).digest('hex').slice(0,8),16)}
async function filesUnder(directory){const out=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())out.push(...await filesUnder(full));else if(!entry.name.startsWith('.')&&entry.name!=='manifest.json')out.push(full)}return out}
export async function loadShowcaseCatalog(){return Promise.all(SHOWCASE_IDS.map(async id=>{const directory=path.join(root,id),manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8')),files=await filesUnder(directory),documents=await Promise.all(files.map(async file=>({file:`showcase/${id}/${path.relative(directory,file)}`,content:await fs.readFile(file,'utf8')})));return Object.freeze({...manifest,directory,documents})}))}
export function selectShowcasePack(catalog,seed){if(!catalog?.length)throw new Error('Showcase catalog is empty');return catalog[hashSeed(seed)%catalog.length]}
