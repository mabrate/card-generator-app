import {PALETTES} from './palettes.js';
export function projectId(search) {
  const params = new URLSearchParams(search);
  if (!params.has('project')) return null;
  const id = params.get('project');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw Error('Invalid project name in the URL.');
  return id;
}
export function normalizeProjectPath(path) {
  if(typeof path==='string')while(path.startsWith('./'))path=path.slice(2);
  if (typeof path !== 'string' || !path || path.split('/').some(p => !p || p === '.' || p === '..') || /[\\:%?#\u0000-\u001f]/.test(path)) throw Error('Project files must use relative paths inside their folder: '+String(path));
  return path;
}
export function localFile(path, base) {
  return new URL(normalizeProjectPath(path), base).href;
}
const validId=id=>typeof id==='string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id);
const validVersion=v=>typeof v==='string' && /^\d+\.\d+\.\d+$/.test(v);
export function validateExpansionPacks(value){
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.entries(value).some(([id,p])=>!p || id!==p.id || !validId(id) || typeof p.name!=='string' || !p.name.trim() || !validVersion(p.packageVersion) || !validId(p.baseProjectId) || !validVersion(p.basePackageVersion)))throw Error('Invalid imported expansion records.');
  return value;
}
export function readManifest(value, base, catalog) {
  if (!value || value.version !== 1 || typeof value.name !== 'string' || !value.name.trim()) throw Error('Unsupported project manifest. Use version 1 and a project name.');
  if ((value.templates !== undefined && !Array.isArray(value.templates)) || (value.colorSchemes !== undefined && !Array.isArray(value.colorSchemes)) || (value.files !== undefined && !Array.isArray(value.files)) || (value.description !== undefined && typeof value.description !== 'string')) throw Error('Invalid project manifest lists or description.');
  if(value.id!==undefined && !validId(value.id))throw Error('Invalid project ID.');
  if(value.packageVersion!==undefined && !validVersion(value.packageVersion))throw Error('Package version must use major.minor.patch.');
  if(value.expansion!==undefined && (!value.expansion || typeof value.expansion!=='object' || Array.isArray(value.expansion) || !validId(value.expansion.baseProjectId) || !validVersion(value.expansion.basePackageVersion) || !value.id || !value.packageVersion))throw Error('Expansion needs a stable project ID, package version, and base-game ID/version.');
  if(value.expansions!==undefined && (!Array.isArray(value.expansions) || value.expansions.length>40 || value.expansions.some(p=>!p || !validId(p.id) || typeof p.name!=='string' || !p.name.trim()) || new Set(value.expansions.map(p=>p.id)).size!==value.expansions.length))throw Error('Invalid linked expansions.');
  const templates = value.templates === undefined ? catalog.map(t => ({...t, url:new URL('templates/'+t.svg, new URL('../../',base)).href})) : value.templates.map(t => {
    if (typeof t === 'string') { const item = catalog.find(c => c.id === t); if (!item) throw Error('Unknown project template: '+t); return {...item, url:new URL('templates/'+item.svg,new URL('../../',base)).href}; }
    if (!t || !/^[a-z0-9_-]+$/.test(t.id) || typeof t.title !== 'string') throw Error('Invalid project template.');
    return {...t, svg:normalizeProjectPath(t.svg), url:localFile(t.svg,base)};
  });
  if (!templates.length || new Set(templates.map(t=>t.id)).size !== templates.length) throw Error('Choose at least one template with unique IDs.');
  const schemes = value.colorSchemes === undefined ? [{name:'Template',colors:null},...PALETTES] : value.colorSchemes.map(s => {
    if (typeof s === 'string') { const scheme = s === 'Template' ? {name:s,colors:null} : PALETTES.find(p=>p.name===s); if (!scheme) throw Error('Unknown color scheme: '+s); return scheme; }
    if (!s || typeof s.name !== 'string' || s.name === 'Template' || !s.colors || !Object.keys(s.colors).length || Object.values(s.colors).some(c=>typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c))) throw Error('Invalid custom color scheme.');
    return s;
  });
  if (!schemes.length || new Set(schemes.map(s=>s.name)).size !== schemes.length) throw Error('Choose color schemes with unique names.');
  const starter = value.starter || {};
  if (typeof starter !== 'object' || Array.isArray(starter)) throw Error('Invalid project starter.');
  if ((starter.template && !templates.some(t=>t.id===starter.template)) || (starter.scheme && !schemes.some(s=>s.name===starter.scheme))) throw Error('Starter template or scheme is not allowed.');
  for (const values of [starter.values || {},value.placeholders || {}]) if (typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(v=>typeof v !== 'string')) throw Error('Starter values and placeholders must contain text.');
  const files = (value.files || []).map(f=>{if (!f || typeof f.title !== 'string' || (f.type === 'markdown' && !/\.md$/i.test(f.path))) throw Error('Invalid project file.'); return {...f,path:normalizeProjectPath(f.path),url:localFile(f.path,base)};});
  let cardBack;
  if(value.cardBack !== undefined){
    if(!value.cardBack || typeof value.cardBack !== 'object' || !/\.(png|jpe?g|webp)$/i.test(value.cardBack.image || '') || (value.cardBack.description !== undefined && typeof value.cardBack.description !== 'string'))throw Error('Card back needs a PNG, JPG, or WebP image path.');
    cardBack={...value.cardBack,image:normalizeProjectPath(value.cardBack.image),url:localFile(value.cardBack.image,base)};
  }
  return {...value,...(value.csv!==undefined?{csv:normalizeProjectPath(value.csv)}:{}),...(value.imageDirectory!==undefined?{imageDirectory:normalizeProjectPath(value.imageDirectory)}:{}),templates,schemes,starter,files,base,cardBack};
}
// Public starter files are cached even on a first visit before the worker controls the page.
export async function fetchProjectFile(url){
  const response=await fetch(url);
  if(response.ok && globalThis.isSecureContext && 'caches' in globalThis){
    try{const cache=await caches.open('classroom-cards-published-projects-v1');await cache.put(new Request(url),response.clone());}catch{}
  }
  return response;
}
export async function loadProject(id, catalog) {
  const base = new URL('projects/'+id+'/',location.href);
  const response = await fetchProjectFile(new URL('manifest.json',base));
  if (!response.ok) throw Error('Cannot load project “'+id+'”. Check its manifest.json and URL.');
  return readManifest(await response.json(),base,catalog);
}
