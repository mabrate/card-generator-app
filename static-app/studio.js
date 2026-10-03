import {readTemplate, renderTemplate, parseCsv, csvCell} from './template.js';
import {PALETTES} from './palettes.js';
import {fontStyles, printDocument} from './print.js';
import {starterLink, readStarter, consumeStarter} from './links.js';
const $ = selector => document.querySelector(selector);
import {projectId, loadProject} from './projects.js';
import {renderMarkdown} from './markdown.js';
let project, activeProjectId, KEY = 'classroom-cards.static-first.v2';
let schemes = [{name:'Template',colors:null},...PALETTES];
const canvas = $('#drawing'), ctx = canvas.getContext('2d');
const cache = new Map();
let db, template, rendered, catalog = [], assetLoading = false, imageData = null, generation = 0, storageError = '', assetError = '', busy = false, drawTimer;
let state = {version:2, templateId:'field-guide', templateSVG:'', colors:{}, cards:[blankCard()], active:0, assets:{}, imported:null};
function blankCard() { return {id:globalThis.crypto?.randomUUID?.() || Date.now()+'-'+Math.random(), values:{...project?.starter.values}, imageName:'', drawingKey:null, drawingActive:false, crop:{x:.5,y:.5,zoom:1}}; }
const card = () => state.cards[state.active];
const slug = s => (s || 'card').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'card';
const norm = s => s.toLowerCase().trim().replace(/[ _-]+/g,' ');
function projectConstraint(message){const err=Error(message);err.code='PROJECT_CONSTRAINT';return err;}
function error(err) {
  if(project && err.code==='PROJECT_CONSTRAINT'){
    let saved;try{saved=localStorage.getItem(KEY);}catch{}
    offerRecoveryReset(saved || JSON.stringify(state),err);return;
  }
  $('#page-error').textContent = err.message || String(err);
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageError = ''; }
  catch { storageError = 'Browser recovery is unavailable or full. Download a project file to keep your work.'; }
  $('#save-state').textContent = storageError || assetError || 'Your cards and images are saved in this browser.';
  $('#save-state').classList.toggle('invalid', !!(storageError || assetError));
}
async function openAssets() {
  try {
    db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('classroom-cards-static-first'+(activeProjectId?'-project-'+activeProjectId:''),1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  } catch { assetError = 'Image recovery is unavailable. Download a project file before leaving.'; }
}
async function putAsset(key, data) {
  cache.set(key,data);
  if (!db) return;
  try { await new Promise((resolve,reject) => { const tx = db.transaction('assets','readwrite'); tx.objectStore('assets').put(data,key); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); }); }
  catch { assetError = 'Image storage is full or unavailable. Download a project file before leaving.'; }
}
async function getAsset(key) {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  if (!db) return null;
  const value = await new Promise((resolve,reject) => { const r=db.transaction('assets').objectStore('assets').get(key); r.onsuccess=()=>resolve(r.result || null); r.onerror=()=>reject(r.error); });
  if (value) cache.set(key,value);
  return value;
}
function buildFields() {
  $('#fields').replaceChildren(...template.fields.map(f => {
    const label = document.createElement('label'); if (f.lines > 1) label.className='wide';
    const caption = document.createElement('span'); caption.textContent=f.label+(f.required?' *':'');
    const count = document.createElement('span'); count.className='counter'; count.dataset.count=f.key;
    const input=document.createElement(f.lines>1?'textarea':'input'); input.dataset.field=f.key; input.value=card().values[f.key] || ''; input.autocomplete='off'; input.placeholder=project?.placeholders?.[f.key] || ''; if(f.lines>1)input.rows=2;
    input.addEventListener('input', () => { card().values[f.key]=input.value; render(); rebuildCardSelect(); save(); });
    label.append(caption,count,input); return label;
  }));
}
function buildColors() {
  $('#color-schemes').replaceChildren(...schemes.map(p=>({...p,colors:p.colors || template.colors})).map(palette=>{
    const button=document.createElement('button');button.type='button';button.className='scheme-button';button.dataset.scheme=palette.name;
    const swatch=document.createElement('span');swatch.className='scheme-swatch';swatch.style.background=palette.colors.background || '#ffffff';swatch.style.borderColor=palette.colors.accent || '#555555';
    button.append(swatch,document.createTextNode(palette.name));
    button.onclick=()=>{for(const key of Object.keys(template.colors))if(palette.colors[key])state.colors[key]=palette.colors[key];state.colorScheme=palette.name;buildColors();render();save();};return button;
  }));
  $('#colors').replaceChildren(...Object.keys(template.colors).map(key => {
    const label=document.createElement('label'); label.textContent=key.replaceAll('-',' ');
    const input=document.createElement('input'); input.type='color'; input.value=state.colors[key] || template.colors[key]; input.dataset.color=key;
    input.addEventListener('input',()=>{state.colors[key]=input.value;state.colorScheme='';updateSchemes();render();save();}); label.append(input);return label;
  }));
  updateSchemes();
}
function updateSchemes(){
  let matched=false;
  const buttons=[...$('#color-schemes').children].sort((a,b)=>Number(b.dataset.scheme===state.colorScheme)-Number(a.dataset.scheme===state.colorScheme));
  for(const button of buttons){const palette=button.dataset.scheme==='Template'?{colors:template.colors}:schemes.find(p=>p.name===button.dataset.scheme);
    const same=!matched&&Object.keys(template.colors).every(key=>!palette.colors[key]||state.colors[key]?.toLowerCase()===palette.colors[key].toLowerCase());
    button.setAttribute('aria-pressed',String(same));if(same)matched=true;
  }
}
function rebuildCardSelect() {
  $('#card-select').replaceChildren(...state.cards.map((c,i)=>new Option(`${i+1} · ${c.values.common_name || Object.values(c.values).find(Boolean) || 'Untitled card'}`,String(i))));
  $('#card-select').value=String(state.active);
  $('#card-switcher').hidden=state.cards.length<2;
  $('#remove-imports').disabled=busy || !importedIndices().size;
}
function importedIndices(){const latest=new Set(state.imported?.indices || []);return new Set(state.cards.flatMap((c,i)=>c.csvImportId || latest.has(i)?[i]:[]));}
async function pruneAssets(clear=false){
  const retained=new Set(clear?[]:[...Object.values(state.assets),...state.cards.map(c=>c.drawingKey).filter(Boolean)]);
  for(const key of cache.keys())if(!retained.has(key))cache.delete(key);
  if(!db)return;
  await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite'),store=tx.objectStore('assets');
    if(clear)store.clear();else{const request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){if(!retained.has(cursor.key))cursor.delete();cursor.continue();}};}
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
function stopDrawing(){clearTimeout(drawTimer);drawingPointer=null;++generation;}
async function removeImports(){
  const indices=importedIndices();if(!indices.size)return;
  if(!confirm(`Remove ${indices.size} CSV-imported card${indices.size===1?'':'s'}, including edits and drawings on those cards? Your manually created cards, template, colors, and uploaded images will stay. Save a project file first if you need a backup.`))return;
  stopDrawing();const activeId=card().id;state.cards=state.cards.filter((_,i)=>!indices.has(i));
  if(!state.cards.length)state.cards=[blankCard()];state.active=Math.max(0,state.cards.findIndex(c=>c.id===activeId));state.imported=null;
  buildMapping();$('#csv-status').textContent='CSV imports removed. Open another CSV or create a new card.';save();await pruneAssets();await showCard();
}
async function startOver(){
  if(!confirm(`Start over? This clears all ${state.cards.length} card${state.cards.length===1?'':'s'}, CSV imports, uploaded images, drawings, and browser recovery for this workspace. Your current SVG template stays; starting colors are restored. Save a project file first if you need a backup.`))return;
  stopDrawing();state.cards=[blankCard()];state.active=0;state.assets={};state.imported=null;state.colors={...template.colors};state.colorScheme='Template';applyProjectScheme();
  try{localStorage.removeItem(KEY);}catch{}
  save();await pruneAssets(true);buildColors();buildMapping();$('#csv-status').textContent='Fresh workspace. Open a CSV or make a new card.';await showCard();
  $('#print-status').textContent='';$('#single-print-status').textContent='';$('#print-scope').value='all';$('#print-copies').value='1';$('#drawing-tools').open=false;$('#image-adjustments').open=false;
}
function rebuildAssets() {
  $('#asset-select').replaceChildren(new Option('No image',''),...Object.keys(state.assets).map(name=>new Option(name,name)));
  if (card().imageName && !state.assets[card().imageName]) $('#asset-select').add(new Option(card().imageName+' (choose this file)',card().imageName));
  if (card().drawingKey) $('#asset-select').add(new Option('Your browser drawing','@drawing'));
  $('#asset-select').value=card().drawingActive?'@drawing':card().imageName;
  $('#image-adjustments').hidden=!Object.keys(state.assets).length && !card().drawingKey && !card().imageName;
}
function render() {
  rendered=renderTemplate(template,card().values,state.colors,imageData,card().crop,$('#card-preview'));
  if (assetLoading) rendered.issues.push('Loading this card’s image…');
  if (card().drawingActive && !imageData && !assetLoading) rendered.issues.push('The saved drawing is missing. Open a project backup or draw it again.');
  if (card().imageName && !card().drawingActive && !imageData && !assetLoading) rendered.issues.push(`Choose the image file “${card().imageName}” to include it in the card.`);
  $('#fit-issues').replaceChildren(...rendered.issues.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  $('#download-svg').disabled=rendered.issues.length>0 || busy;
  $('#print-card').disabled=rendered.issues.length>0 || busy;
  for(const f of template.fields){ const input=$(`#fields [data-field="${f.key}"]`); if(!input)continue; input.setAttribute('aria-invalid',String(rendered.issues.some(t=>t.startsWith(f.label+':')))); $(`[data-count="${f.key}"]`).textContent=`${[...(card().values[f.key]||'')].length} / ${f.max}`; }
}
async function showCard() {
  const seq=++generation; assetLoading=true; imageData=null;
  buildFields(); rebuildCardSelect(); rebuildAssets();
  for(const key of ['x','y','zoom']) $('#crop-'+key).value=card().crop[key];
  ctx.clearRect(0,0,canvas.width,canvas.height); render();
  const current=card();
  const [pic,drawing] = await Promise.all([getAsset(current.drawingActive?current.drawingKey:state.assets[current.imageName]),getAsset(current.drawingKey)]);
  if(seq!==generation)return;
  if(drawing){const img=await decodeImage(drawing);if(seq!==generation)return;ctx.drawImage(img,0,0,canvas.width,canvas.height);}
  imageData=pic; assetLoading=false;
  $('#image-status').textContent=current.drawingActive?'Using your drawing.':current.imageName?`Image: ${current.imageName}`:'Choose an image or draw below.';
  render(); save();
}
function applyTemplate(source,id) {
  const next=readTemplate(source);
  checkProjectTemplate(next.source,id);
  template=next;state.templateId=id;state.templateSVG=next.source;state.colors={...next.colors};state.colorScheme='Template';
  applyProjectScheme();
  updateTemplateSelect();buildColors();buildMapping();$('#template-title').textContent=next.title;
}
function updateTemplateSelect() {
  $('#template-select').replaceChildren(...catalog.map(item=>new Option(item.title,item.id)));
  if(!catalog.some(c=>c.id===state.templateId)) $('#template-select').add(new Option(template.title+' (opened SVG)',state.templateId));
  $('#template-select').value=state.templateId;$('#template-select').disabled=false;
}
function buildMapping() {
  const imported=state.imported,host=$('#csv-mapping');host.hidden=!imported;if(!imported){host.replaceChildren();$('#unmapped').textContent='';return;}
  host.replaceChildren(...[...template.fields.map(f=>({key:f.key,label:f.label})),{key:'image_filename',label:'Image filename'}].map(f=>{
    const label=document.createElement('label');label.textContent=f.label;const select=document.createElement('select');select.dataset.map=f.key;
    select.append(new Option('Skip this column',''),...imported.headers.map(h=>new Option(h,h)));select.value=imported.mapping[f.key] || '';select.onchange=()=>{imported.mapping[f.key]=select.value;save();};label.append(select);return label;
  }));
  const help=document.createElement('p');help.className='hint wide';help.textContent='Applying these column matches replaces the text in the most recently imported CSV cards.';
  const apply=document.createElement('button');apply.type='button';apply.className='button secondary';apply.textContent='Apply CSV column matches';apply.onclick=()=>run(()=>applyMapping());host.append(help,apply);
  const used=new Set(Object.values(imported.mapping));$('#unmapped').textContent='Extra columns are kept in the project file: '+(imported.headers.filter(h=>!used.has(h)).join(', ') || 'none');
}
async function applyMapping() {
  const imp=state.imported;
  for(const [i,row] of imp.rows.entries()){
    const c=state.cards[imp.indices[i]];
    for(const f of template.fields) if(imp.mapping[f.key]) c.values[f.key]=row[imp.mapping[f.key]] || '';
    if(imp.mapping.image_filename)c.imageName=row[imp.mapping.image_filename] || '';
  }
  buildMapping();await showCard();
}
async function importCsv(file) {
  if(file.size>2_000_000)throw Error('Choose a CSV under 2 MB.');
  const {headers,rows}=parseCsv(await file.text());
  const emptyStarter=state.cards.length===1 && !Object.values(card().values).some(Boolean) && !card().imageName && !card().drawingKey;
  if(state.cards.length-(emptyStarter?1:0)+rows.length>500)throw Error('Keep up to 500 cards in one workspace. Save a project file before starting another.');
  if(emptyStarter)state.cards=[];
  const mapping=Object.fromEntries([...template.fields.map(f=>f.key),'image_filename'].map(key=>[key,headers.find(h=>norm(h)===norm(key)) || headers.find(h=>norm(h)===norm(template.fields.find(f=>f.key===key)?.label || '')) || '']));
  const start=state.cards.length;
  const importId=blankCard().id;
  state.cards.push(...rows.map(row=>({...blankCard(),csvImportId:importId,values:{...row}})));
  state.imported={headers,rows,mapping,indices:rows.map((_,i)=>start+i)};state.active=start;
  await applyMapping();$('#csv-status').textContent=`Added ${rows.length} cards. Match columns below if needed.`;
}
function decodeImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be opened.'));img.src=src;});}
async function normalizeImage(file) {
  if(file.size>12*1024*1024)throw Error(`${file.name}: choose an image under 12 MB.`);
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use PNG, JPG, or WebP images. Convert HEIC photos to JPG first.');
  const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read the image.'));r.readAsDataURL(file);});
  const img=await decodeImage(src);if(img.width*img.height>25_000_000)throw Error('Use an image smaller than 25 megapixels.');
  const scale=Math.min(1,1600/Math.max(img.width,img.height)); const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.92);
}
async function uploadImages(files) {
  if(files.length>40)throw Error('Choose up to 40 images at a time.');
  if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('Rename duplicate image filenames before uploading.');
  for(const file of files){$('#image-status').textContent='Saving '+file.name+'…';const data=await normalizeImage(file);const key=state.assets[file.name] || 'image-'+blankCard().id;await putAsset(key,data);state.assets[file.name]=key;save();}
  if(files.length===1 && !card().imageName){card().imageName=files[0].name;card().drawingActive=false;}
  await showCard();
  if(files.length>1)$('#image-adjustments').open=true;
}
async function saveDrawing(use=true) {
  const current=card(),key=current.drawingKey || 'drawing-'+current.id;
  await putAsset(key,canvas.toDataURL('image/png'));
  current.drawingKey=key;
  if(use){if(!current.drawingActive)current.crop={x:.5,y:.5,zoom:1};current.drawingActive=true;}
  if(current===card()){
    if(use)imageData=cache.get(key);
    for(const k of ['x','y','zoom'])$('#crop-'+k).value=current.crop[k];
    rebuildAssets();render();
  }
  save();
}
function download(name,type,body){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function templateCsv(){return [...template.fields.map(f=>f.key),'image_filename'].map(csvCell).join(',')+'\r\n'+[...template.fields,'image'].map(()=>csvCell('')).join(',')+'\r\n';}
async function exportProject(){const snapshot=structuredClone(state),keys=new Set([...Object.values(snapshot.assets),...snapshot.cards.map(c=>c.drawingKey).filter(Boolean)]);const images={};for(const key of keys){const data=await getAsset(key);if(data)images[key]=data;else throw Error('A saved image is missing. Reopen its file before exporting the project.');}download('classroom-cards-project.json','application/json',JSON.stringify({state:snapshot,images}));}
function validateState(value){
  if(!value||value.version!==2||!Array.isArray(value.cards)||!value.cards.length||value.cards.length>500||!Number.isInteger(value.active)||value.active<0||value.active>=value.cards.length)throw Error('This is not a supported Classroom Cards project file.');
  const checkedTemplate=readTemplate(value.templateSVG);
  checkProjectTemplate(checkedTemplate.source,value.templateId);
  if(project && !schemes.some(p=>Object.keys(checkedTemplate.colors).every(k=>(value.colors?.[k] || '').toLowerCase()===(p.colors?.[k] || checkedTemplate.colors[k]).toLowerCase())))throw projectConstraint('Saved colors are not allowed in this project.');
  for(const c of value.cards){if(!c.values||Object.values(c.values).some(v=>typeof v!=='string')||typeof c.id!=='string'||(c.imageName && typeof c.imageName!=='string')||(c.drawingKey && typeof c.drawingKey!=='string'))throw Error('The project contains invalid card data.');c.crop={x:.5,y:.5,zoom:1,...c.crop};for(const key of ['x','y','zoom'])if(!Number.isFinite(c.crop[key]))throw Error('The project contains invalid image positioning.');}
  if(!value.assets||Object.values(value.assets).some(v=>typeof v!=='string')||!value.colors||Object.values(value.colors).some(v=>!/^#[0-9a-f]{6}$/i.test(v)))throw Error('The project contains invalid image or color data.');
  if(value.imported && (!Array.isArray(value.imported.rows)||!Array.isArray(value.imported.headers)||!Array.isArray(value.imported.indices)||value.imported.indices.length!==value.imported.rows.length||value.imported.indices.some(i=>!Number.isInteger(i)||!value.cards[i])||!value.imported.mapping))throw Error('The saved CSV data is invalid.');
  if(value.imported)for(const i of value.imported.indices)value.cards[i].csvImportId ||= 'recovered-csv';
  return value;
}
async function importProject(file){
  if(file.size>100_000_000)throw Error('Choose a project under 100 MB.');
  const payload=JSON.parse(await file.text()),next=validateState(payload.state);
  const required=new Set([...Object.values(next.assets),...next.cards.map(c=>c.drawingKey).filter(Boolean)]);
  const remap={};
  for(const key of required){const data=payload.images?.[key];if(typeof data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data))throw Error('The project contains a missing or invalid image.');await decodeImage(data);remap[key]='import-'+blankCard().id;}
  if(!confirm('Open this project in place of your current cards? Download your current project first if you need a copy.'))return;
  for(const key of required)await putAsset(remap[key],payload.images[key]);
  next.assets=Object.fromEntries(Object.entries(next.assets).map(([name,key])=>[name,remap[key]]));next.cards.forEach(c=>{if(c.drawingKey)c.drawingKey=remap[c.drawingKey];});
  state=next;template=readTemplate(next.templateSVG);updateTemplateSelect();buildColors();buildMapping();$('#template-title').textContent=template.title;await showCard();
}
async function run(action){if(busy)return;busy=true;$('#page-error').textContent='';document.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=true);try{await action();}catch(err){error(err);}finally{busy=false;document.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=false);$('#remove-imports').disabled=!importedIndices().size;if(template && $('#recovery-error').hidden)render();}}
$('#template-select').onchange=()=>run(async()=>{const item=catalog.find(c=>c.id===$('#template-select').value);const r=await fetch(item.url || 'templates/'+item.svg,{cache:'no-cache'});if(!r.ok)throw Error('Cannot open that built-in template.');applyTemplate(await r.text(),item.id);await showCard();});
$('#svg-file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)run(async()=>{if(f.size>500_000)throw Error('Choose a template SVG under 500 KB.');applyTemplate(await f.text(),'custom');await showCard();});};
$('#csv-file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)run(()=>importCsv(f));};
$('#card-select').onchange=()=>run(async()=>{state.active=Number($('#card-select').value);await showCard();});
$('#new-card').onclick=()=>run(async()=>{if(state.cards.length>=500)throw Error('Save this project and start another before adding more cards.');state.cards.push(blankCard());state.active=state.cards.length-1;await showCard();});
$('#remove-imports').onclick=()=>run(removeImports);
$('#start-over').onclick=()=>run(startOver);
for(const id of ['image-files','camera-file'])$('#'+id).onchange=e=>{const files=[...e.target.files];e.target.value='';if(files.length)run(()=>uploadImages(files));};
$('#asset-select').onchange=()=>run(async()=>{const name=$('#asset-select').value;card().drawingActive=name==='@drawing';if(!card().drawingActive)card().imageName=name;card().crop={x:.5,y:.5,zoom:1};await showCard();});
for(const key of ['x','y','zoom'])$('#crop-'+key).oninput=e=>{card().crop[key]=Number(e.target.value);render();save();};
let drawingPointer=null;
function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];}
canvas.onpointerdown=e=>{if(busy||drawingPointer!==null)return;drawingPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);const [x,y]=point(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y+.1);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=$('#ink-color').value;ctx.lineWidth=Number($('#brush-size').value);ctx.stroke();};
canvas.onpointermove=e=>{if(e.pointerId!==drawingPointer)return;const [x,y]=point(e);ctx.lineTo(x,y);ctx.stroke();clearTimeout(drawTimer);drawTimer=setTimeout(()=>saveDrawing().catch(error),250);};
function finishDrawing(e){if(e.pointerId!==drawingPointer)return;drawingPointer=null;clearTimeout(drawTimer);run(()=>saveDrawing());}
canvas.onpointerup=finishDrawing;canvas.onpointercancel=finishDrawing;
$('#clear-drawing').onclick=()=>run(async()=>{ctx.clearRect(0,0,canvas.width,canvas.height);await saveDrawing(card().drawingActive);});
$('#use-drawing').onclick=()=>run(()=>saveDrawing());
$('#template-svg').onclick=()=>download(slug(template.title)+'-template.svg','image/svg+xml',template.source);
$('#template-csv').onclick=()=>download(slug(template.title)+'-template.csv','text/csv;charset=utf-8','\ufeff'+templateCsv());
$('#cards-csv').onclick=()=>{const keys=[...template.fields.map(f=>f.key),'image_filename'];const csv=[keys.map(csvCell).join(','),...state.cards.map(c=>keys.map(k=>csvCell(k==='image_filename'?(c.drawingActive?'':c.imageName):c.values[k]||'')).join(','))].join('\r\n');download('classroom-cards.csv','text/csv;charset=utf-8','\ufeff'+csv);};
$('#save-json').onclick=()=>run(exportProject);
$('#open-json').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)run(()=>importProject(f));};
$('#copy-starter-link').onclick=async()=>{
  if(busy || !template)return;
  const output=$('#starter-link'),status=$('#starter-link-status');
  output.value='';status.textContent='';
  try{
    const fields=Object.fromEntries(template.fields.map(f=>[f.key,card().values[f.key] || '']));
    const builtIn=catalog.some(item=>item.id===state.templateId);
    output.value=starterLink(state.templateId,builtIn?'':template.source,{...state.colors},state.colorScheme,fields);
    try{
      await navigator.clipboard.writeText(output.value);
      status.textContent='Link copied. Send it to students to open this starter card.';
    }catch{
      output.focus();output.select();output.setSelectionRange(0,output.value.length);
      status.textContent='Link ready. Copy the selected link below.';
    }
  }catch(err){status.textContent=err.message || String(err);}
};
async function openStarter(recovered){
  let defaults;
  try{
    defaults=readStarter();if(!defaults)return;
    let source=defaults.svg;
    if(!source){
      const item=catalog.find(item=>item.id===defaults.template);
      if(!item)throw (project?projectConstraint('This starter link uses a template that is not allowed in this project.'):Error('This starter link uses a template that is unavailable on this site.'));
      const response=await fetch(item.url || 'templates/'+item.svg);
      if(!response.ok)throw Error('Cannot load the starter template. Try opening the link again.');
      source=await response.text();
    }
    const next=readTemplate(source);
    checkProjectTemplate(next.source,defaults.svg?'custom':defaults.template);
    if(project && !schemes.some(p=>Object.keys(next.colors).every(k=>(defaults.colors[k] || next.colors[k]).toLowerCase()===(p.colors?.[k] || next.colors[k]).toLowerCase())))throw projectConstraint('Starter colors are not allowed in this project.');
    if(recovered&&!confirm('Open the shared starter card in place of your saved cards? Cancel to keep your saved work. Save an editable copy before reopening this link if you need a backup.')){
      consumeStarter();return;
    }
    stopDrawing();
    state={version:2,templateId:defaults.svg?'custom':defaults.template,templateSVG:next.source,colors:{...next.colors},colorScheme:defaults.scheme || '',cards:[blankCard()],active:0,assets:{},imported:null};
    template=next;
    state.colors=Object.fromEntries(Object.entries(next.colors).map(([key,value])=>[key,Object.hasOwn(defaults.colors,key)?defaults.colors[key]:value]));
    card().values=Object.fromEntries(next.fields.map(f=>[f.key,Object.hasOwn(defaults.fields,f.key)?defaults.fields[f.key]:'']));
    updateTemplateSelect();buildColors();buildMapping();$('#template-title').textContent=next.title;
    save();consumeStarter();
  }catch(err){error(err);}
}
async function openPrint(scope,copies,status){
  // Open during the button gesture, before image/font loading yields to Safari.
  const sheet=window.open('','_blank');
  if(!sheet)throw Error('Allow pop-ups for this site, then try opening the print sheets again.');
  sheet.opener=null;
  sheet.document.write('<!doctype html><html><head><title>Preparing card sheets</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p role="status">Preparing your card sheets…</p></body></html>');
  sheet.document.close();
  try{
    const html=await printDocument(template,structuredClone(state),getAsset,scope,copies,project?.cardBack);
    if(sheet.closed){$(status).textContent='Print sheet closed. Open it again when ready.';return;}
    sheet.document.open();sheet.document.write(html);sheet.document.close();
    $(status).textContent='Print sheets opened in a new tab. Choose Print / Save as PDF there; your editor stays in this tab.';
  }catch(err){if(!sheet.closed)sheet.close();throw err;}
}
$('#print-sheets').onclick=()=>run(()=>openPrint($('#print-scope').value,Number($('#print-copies').value),'#print-status'));
$('#print-card').onclick=()=>run(()=>openPrint('current',1,'#single-print-status'));
$('#download-svg').onclick=()=>run(async()=>{
  render();if(rendered.issues.length)throw Error('Complete or shorten the marked fields before exporting.');
  const svg=rendered.root.cloneNode(true);svg.setAttribute('data-card-app','finished-card');
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=await fontStyles();svg.prepend(style);
  download(slug(card().values.common_name||'card')+'.svg','image/svg+xml',new XMLSerializer().serializeToString(svg));
});
function checkProjectTemplate(source,id){
  if(project && !catalog.some(t=>t.id===id && t.source===source))throw projectConstraint('This template is not allowed in the current project. Download your saved work or start fresh with this project’s template.');
}
function applyProjectScheme(){
  if(!project)return;
  const scheme=schemes.find(p=>p.name===project.starter.scheme) || schemes[0];
  state.colors={...template.colors,...scheme.colors};state.colorScheme=scheme.name;
}
function setupProject(){
  $('.intro h1').textContent=project.name;$('.intro p').textContent=project.description || '';document.title=project.name+' · Classroom Cards';
  $('#template-tools .template-help').hidden=true;$('.custom-colors').hidden=true;
  if(project.cardBack){const hint=document.createElement('p');hint.className='hint';hint.textContent='Print sheets include this project’s card backs. Use double-sided printing, landscape, flip on the short edge.';$('#batch-print-tools').append(hint);}
  $('#project-resources').hidden=false;$('#project-document').hidden=true;
  for(const file of project.files){
    const link=document.createElement(file.type==='markdown'?'button':'a');link.className='button secondary';link.textContent=file.title;
    if(file.type==='markdown'){link.type='button';link.onclick=async()=>{
      $('#document-status').textContent='Opening '+file.title+'…';
      try{const response=await fetch(file.url);if(!response.ok)throw Error('Cannot open '+file.title);renderMarkdown(await response.text(),$('#document-content'),file.url);$('#document-title').textContent=file.title;$('#project-document').hidden=false;$('#project-document').open=true;$('#document-status').textContent='';}
      catch(err){$('#document-status').textContent=err.message;}
    };}else{link.href=file.url;link.download='';}
    $('#project-files').append(link);
  }
}
function offerRecoveryReset(saved,err){
  $('#page-error').textContent='';
  $('#recovery-error').hidden=false;
  $('#recovery-error-message').textContent=err.message || String(err);
  $('#save-state').textContent='Saved work needs your attention. Choose Download saved work or Start fresh above.';
  $('.layout').inert=true;$('#more-tools').inert=true;
  $('#download-recovery').onclick=async()=>{
    const status=$('#recovery-error-status');
    try{
      let snapshot;try{snapshot=JSON.parse(saved);}catch{download('classroom-cards-recovery.json','application/json',saved);status.textContent='Saved recovery downloaded.';return;}
      const keys=new Set([...Object.values(snapshot.assets || {}),...(Array.isArray(snapshot.cards)?snapshot.cards.map(c=>c?.drawingKey):[])]);
      const images={};
      for(const key of keys){if(typeof key!=='string' || !key)continue;const image=await getAsset(key);if(image)images[key]=image;}
      download('classroom-cards-recovery.json','application/json',JSON.stringify({state:snapshot,images}));
      status.textContent='Saved work downloaded. Open it using a compatible project URL or the normal editor.';
    }catch(error){status.textContent=error.message || String(error);}
  };
  $('#fresh-recovery').onclick=()=>run(async()=>{
    stopDrawing();consumeStarter();
    // Only replace recovery after the requested starting template has loaded.
    state={version:2,templateId:'',templateSVG:'',colors:{},cards:[blankCard()],active:0,assets:{},imported:null};
    template=null;
    $('#recovery-error').hidden=true;
    try{await finishStart(false);}catch(err){$('#recovery-error').hidden=false;throw err;}
    $('.layout').inert=false;$('#more-tools').inert=false;$('#recovery-error').hidden=true;
  });
}
async function start(){
  activeProjectId=projectId(location.search);
  if(activeProjectId)KEY+=':project:'+activeProjectId;
  await openAssets();
  const r=await fetch('templates/catalog.json');if(!r.ok)throw Error('Cannot load the template list. Serve the static-app folder with a static web server.');catalog=await r.json();
  if(activeProjectId){
    project=await loadProject(activeProjectId,catalog);catalog=project.templates;schemes=project.schemes;
    for(const item of catalog){const response=await fetch(item.url);if(!response.ok)throw Error('Cannot load project template '+item.title);item.source=readTemplate(await response.text()).source;}
    state.cards=[blankCard()];
    setupProject();
  }
  let saved;try{saved=localStorage.getItem(KEY);}catch{storageError='Browser recovery is unavailable. Save a project file while you work.';}
  if(saved){try{state=validateState(JSON.parse(saved));}catch(err){offerRecoveryReset(saved,err);return;}}
  await finishStart(Boolean(saved));
}
async function finishStart(recovered){
  if(state.templateSVG){template=readTemplate(state.templateSVG);updateTemplateSelect();buildColors();buildMapping();$('#template-title').textContent=template.title;}
  else {const item=catalog.find(t=>t.id===project?.starter.template) || catalog[0], response=await fetch(item.url || 'templates/'+item.svg);if(!response.ok)throw Error('Cannot open the first template.');applyTemplate(await response.text(),item.id);}
  await openStarter(recovered);
  if(!$('#recovery-error').hidden)return;
  await document.fonts.load('7px "Liberation Sans"');await document.fonts.load('bold 11px "Liberation Sans"');await document.fonts.load('italic 7px "Liberation Sans"');
  await showCard();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
start().catch(error);
