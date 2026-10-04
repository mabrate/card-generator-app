// All project files stay in this browser. ZIP extraction uses the browser's inflater.
import {readManifest} from './projects.js';
const LIMIT = 100_000_000, MAX_FILES = 2000;
function safePath(path) {
  if (!path || /[\\:%?#\u0000-\u001f]/.test(path) || path.split('/').some(p=>!p || p==='.' || p==='..')) throw Error('Project files must use relative paths inside their folder.');
  return path;
}
function mime(path) { return /\.png$/i.test(path)?'image/png':/\.jpe?g$/i.test(path)?'image/jpeg':/\.webp$/i.test(path)?'image/webp':/\.svg$/i.test(path)?'image/svg+xml':/\.json$/i.test(path)?'application/json':/\.csv$/i.test(path)?'text/csv':/\.md$/i.test(path)?'text/plain':'application/octet-stream'; }
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export async function unzip(file) {
  if(file.size>LIMIT)throw Error('Choose a ZIP under 100 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
  if(bytes.length<22)throw Error('This is not a valid ZIP file.');
  let end=bytes.length-22;
  for(;end>=Math.max(0,bytes.length-65557);end--)if(view.getUint32(end,true)===0x06054b50 && end+22+view.getUint16(end+20,true)===bytes.length)break;
  if(end<Math.max(0,bytes.length-65557))throw Error('This is not a valid ZIP file.');
  const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),size=view.getUint32(end+12,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count===65535||offset===0xffffffff||offset+size>end)throw Error('Use a standard single-part ZIP, without ZIP64.');
  if(count>MAX_FILES)throw Error('Keep up to 2,000 files in a project.');
  const entries=[];let pos=offset,total=0;
  for(let i=0;i<count;i++){
    if(pos+46>offset+size || view.getUint32(pos,true)!==0x02014b50)throw Error('Invalid ZIP directory.');
    const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),packed=view.getUint32(pos+20,true),length=view.getUint32(pos+24,true),nameSize=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),local=view.getUint32(pos+42,true),crc=view.getUint32(pos+16,true);
    if(pos+46+nameSize+extra+comment>offset+size)throw Error('Invalid ZIP entry.');
    const path=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(pos+46,pos+46+nameSize));pos+=46+nameSize+extra+comment;
    if(flags&1 || ![0,8].includes(method))throw Error('Use an unencrypted ZIP with standard compression.');
    if(path.endsWith('/')){safePath(path.slice(0,-1));continue;}
    safePath(path);total+=length;if(total>LIMIT)throw Error('Unpacked project must be under 100 MB.');
    entries.push({path,method,packed,length,local,crc});
  }
  if(pos!==offset+size)throw Error('Invalid ZIP directory size.');
  const files=[];
  for(const entry of entries){
    const {path,method,packed,length,local,crc}=entry;
    if(local+30>offset || view.getUint32(local,true)!==0x04034b50)throw Error('Invalid ZIP file entry.');
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(start+packed>offset)throw Error('Invalid ZIP file size.');
    let data=bytes.subarray(start,start+packed);
    if(method===8){
      let inflater;try{inflater=new DecompressionStream('deflate-raw');}catch{throw Error('ZIP import needs a browser with ZIP decompression support. Try a recent browser or import the folder instead.');}
      const reader=new Blob([data]).stream().pipeThrough(inflater).getReader(),chunks=[];let actual=0;
      while(true){const {done,value}=await reader.read();if(done)break;actual+=value.length;if(actual>length || actual>LIMIT){await reader.cancel();throw Error('Invalid ZIP expanded size.');}chunks.push(value);}
      data=new Uint8Array(actual);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
    }
    if(data.length!==length || crc32(data)!==crc)throw Error('ZIP file is damaged: '+path);
    files.push({path,file:new File([data],path.split('/').pop(),{type:mime(path)})});
  }
  return files;
}
export function folderFiles(files) { return Array.from(files,file=>({path:file.webkitRelativePath || file.name,file})); }
export function projectFiles(entries) {
  if(!entries.length || entries.length>MAX_FILES)throw Error('Choose a project with 1–2,000 files.');
  let total=0;const paths=new Set();
  entries=entries.filter(e=>!e.path.startsWith('__MACOSX/') && !e.path.split('/').some(p=>p==='.DS_Store'));
  for(const entry of entries){safePath(entry.path);total+=entry.file.size;if(paths.has(entry.path))throw Error('Duplicate project path: '+entry.path);paths.add(entry.path);}
  if(total>LIMIT)throw Error('Project files must total under 100 MB.');
  const manifests=entries.filter(e=>/(^|\/)manifest\.json$/.test(e.path));
  if(manifests.length!==1)throw Error('Choose a folder or ZIP containing exactly one manifest.json.');
  const root=manifests[0].path.slice(0,-'manifest.json'.length);
  if(entries.some(e=>!e.path.startsWith(root)))throw Error('Keep all project files inside the folder containing manifest.json.');
  return entries.map(e=>({path:e.path.slice(root.length),file:new File([e.file],e.path.split('/').pop(),{type:mime(e.path)})}));
}
export async function resolveLocalProject(entries,catalog) {
  const files=new Map(entries.map(e=>[e.path,e.file])),base=new URL('local-project-files/package/',location.href),urls=new Map();
  const manifest=JSON.parse(await files.get('manifest.json').text());
  const project=readManifest(manifest,base,catalog);
  function url(path){safePath(path);if(!files.has(path))throw Error('Missing project file: '+path);if(!urls.has(path))urls.set(path,URL.createObjectURL(files.get(path)));return urls.get(path);}
  try{
    for(const item of project.templates)if(typeof (manifest.templates || []).find(t=>t?.id===item.id)==='object')item.url=url(item.svg);
    for(const item of project.files){item.base=new URL(item.path,base).href;item.url=url(item.path);}
    if(project.cardBack)project.cardBack.url=url(project.cardBack.image);
    // Resolve Markdown links only against selected local files, never the host.
    project.resolveLink=(path,documentBase)=>{let target;try{target=new URL(path,documentBase);}catch{return null;}if(target.href.startsWith(base.href))return files.has(decodeURIComponent(target.pathname.slice(base.pathname.length)))?url(decodeURIComponent(target.pathname.slice(base.pathname.length))):null;return ['http:','https:'].includes(target.protocol)?target.href:null;};
    return {project,files,manifest,dispose:()=>urls.forEach(u=>URL.revokeObjectURL(u))};
  }catch(err){urls.forEach(u=>URL.revokeObjectURL(u));throw err;}
}
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('classroom-cards-local-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function storeLocalProject(bundle){const db=await database(),id=crypto.randomUUID();try{await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(bundle,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});return id;}finally{db.close();}}
export async function getLocalProject(id){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function encodeBundle(bundle){return {files:await Promise.all(bundle.files.map(async({path,file})=>({path,data:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);})})))};}
export async function decodeBundle(bundle){
  if(!bundle || !Array.isArray(bundle.files) || bundle.files.length>MAX_FILES)throw Error('Invalid local project backup.');
  const files=[];let total=0;
  for(const entry of bundle.files){if(typeof entry.data!=='string'||!/^data:[a-z0-9/+.-]+;base64,[A-Za-z0-9+/=]*$/i.test(entry.data))throw Error('Invalid local project backup file.');total+=entry.data.length;if(total>140_000_000)throw Error('Local project backup is too large.');files.push({path:entry.path,file:await (await fetch(entry.data)).blob()});}
  return {...bundle,files:projectFiles(files)};
}
