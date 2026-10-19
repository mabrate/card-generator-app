import {resolveCardColors, matchingColorRule, validateRuleTemplates} from './color-rules.js';
import {serializeCard,parseCard,validateCard,normalized,uniqueId,assertCards,insertCard,FORMAT} from './card-transfer.js';
import {readTemplate, renderTemplate, parseCsv, csvCell, checkedValue} from './template.js';
import {PALETTES} from './palettes.js';
import {fontStyles, printDocument} from './print.js';
import {readStarter, consumeStarter} from './links.js';
const $ = selector => document.querySelector(selector);
import {projectId, loadProject, validateExpansionPacks, normalizeProjectPath, fetchProjectFile} from './projects.js';
import {renderMarkdown} from './markdown.js';
import {folderFiles, unzip, projectFiles, resolveLocalProject, storeLocalProject, getLocalProject, zipProject} from './local-projects.js';
import {loadCardBack} from './print.js';
let localBundle;
let project, activeProjectId, KEY = 'classroom-cards.static-first.v2';
let schemes = [{name:'Template',colors:null},...PALETTES];
const canvas = $('#drawing'), ctx = canvas.getContext('2d');
const cache = new Map();
let db, template, backTemplate=null, activeSide='front', rendered, catalog = [], assetLoading = false, imageData = null, generation = 0, storageError = '', assetError = '', busy = false, drawTimer;
let state;
state = {version:2, templateId:'field-guide', templateSVG:'', colors:{}, cards:[blankCard()], active:0, assets:{}, imported:null};
function blankCard() { return {id:uniqueId(new Set(state?.cards?.map(c=>c.id) || [])), values:{...project?.starter.values}, copies:1, imageName:'', drawingKey:null, drawingActive:false, crop:{x:.5,y:.5,zoom:1}}; }
const card = () => state.cards[state.active];
const cardCrop = () => activeSide==='back' && card().backImageName ? (card().backCrop ||= {x:.5,y:.5,zoom:1}) : card().crop;
const cardLayout = () => activeSide==='back' && backTemplate ? backTemplate : card().layout ? readTemplate(card().layout) : template;
const resolvedColors = (c, snapshot=state, context=project) => resolveCardColors(activeSide==='back'&&backTemplate?backTemplate:c.layout?readTemplate(c.layout):snapshot.templateSVG===state.templateSVG?template:readTemplate(snapshot.templateSVG),c,snapshot.colors,context?.colorRules,context?.schemes || schemes);
const cardColors = () => resolvedColors(card());
const cardScheme = () => card().colors ? card().colorScheme : state.colorScheme;
const csvFields = () => [...new Map([...template.fields,...(backTemplate?.fields || [])].map(f=>[f.key,f])).values()].map(f=>({key:f.key,label:f.label})).concat([{key:'image_filename',label:'Front image filename'},...(backTemplate?[{key:'back_image_filename',label:'Back graphic filename'}]:[]),{key:'copies',label:'Copies / card count'},{key:'theme',label:'Color theme'}]);
function csvSettings(row,mapping,index,allowedSchemes=schemes,layout=template){
  const raw=(row[mapping.copies] || '').trim(), copies=raw?Number(raw):1;
  if(!Number.isInteger(copies)||copies<1||copies>600)throw Error(`CSV row ${index+2}: copies must be a whole number from 1 to 600.`);
  const name=(row[mapping.theme] || '').trim();
  if(name.startsWith('custom:')){
    const colors={...layout.colors},seen=new Set();
    for(const entry of name.slice(7).split(';').filter(Boolean)){
      const match=/^([a-z][a-z0-9_-]{0,29})=(#[0-9a-f]{6})$/i.exec(entry);
      if(!match || !Object.hasOwn(layout.colors,match[1]) || seen.has(match[1]))throw Error(`CSV row ${index+2}: invalid custom color role or value.`);
      seen.add(match[1]);colors[match[1]]=match[2].toLowerCase();
    }
    if(!seen.size)throw Error(`CSV row ${index+2}: custom theme needs colors.`);
    return {copies,colors,colorScheme:''};
  }
  const palette=name?allowedSchemes.find(p=>norm(p.name)===norm(name)):null;
  if(name&&!palette)throw Error(`CSV row ${index+2}: unknown or unavailable color theme “${name}”. Choose ${allowedSchemes.map(p=>p.name).join(', ')}.`);
  return {copies,colors:palette?{...layout.colors,...palette.colors}:undefined,colorScheme:palette?.name};
}
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
  $('#fields').replaceChildren(...cardLayout().fields.map(f => {
    const label = document.createElement('label');
    if(f.type==='checkbox'){
      label.className='checkbox-field';const input=document.createElement('input');input.type='checkbox';input.dataset.field=f.key;input.checked=checkedValue(card().values[f.key]);
      input.addEventListener('change',()=>{card().values[f.key]=String(input.checked);render();save();});
      const caption=document.createElement('span');caption.textContent=f.label;label.append(input,caption);return label;
    }
    if (f.lines > 1) label.className='wide';
    const caption = document.createElement('span'); caption.textContent=f.label+(f.required?' *':'');
    const count = document.createElement('span'); count.className='counter'; count.dataset.count=f.key;
    const input=document.createElement(f.lines>1?'textarea':'input'); input.dataset.field=f.key; input.value=card().values[f.key] || ''; input.autocomplete='off'; input.placeholder=project?.placeholders?.[f.key] || ''; if(f.lines>1)input.rows=2;
    input.addEventListener('input', () => { card().values[f.key]=input.value; render(); rebuildCardSelect(); save(); });
    label.append(caption,count,input); return label;
  }));
}
function updateAutomaticColors() {
  const enabled=Boolean(project?.colorRules?.length);
  $('#automatic-colors').hidden=!enabled;
  if(!enabled)return;
  const rule=matchingColorRule(project.colorRules,card().values);
  $('#automatic-color-status').textContent=card().colors?'Manual colors override project rules.':rule?`Automatic colors: ${rule.field.replaceAll('_',' ')} = ${rule.equals}.`:'Automatic colors: no matching rule; using the base theme.';
  $('#use-automatic-colors').hidden=!card().colors;
  const colors=cardColors();
  for(const input of $('#colors').querySelectorAll('input[data-color]'))if(input!==document.activeElement)input.value=colors[input.dataset.color];
}
$('#use-automatic-colors').onclick=()=>{delete card().colors;delete card().colorScheme;buildColors();render();save();};
function buildColors() {
  $('#color-schemes').replaceChildren(...schemes.map(p=>({...p,colors:p.colors || cardLayout().colors})).map(palette=>{
    const button=document.createElement('button');button.type='button';button.className='scheme-button';button.dataset.scheme=palette.name;
    const swatch=document.createElement('span');swatch.className='scheme-swatch';swatch.style.background=palette.colors.background || '#ffffff';swatch.style.borderColor=palette.colors.accent || '#555555';
    button.append(swatch,document.createTextNode(palette.name));
    button.onclick=()=>{card().colors={...cardLayout().colors,...palette.colors};card().colorScheme=palette.name;buildColors();render();save();};return button;
  }));
  $('#colors').replaceChildren(...Object.keys(cardLayout().colors).map(key => {
    const label=document.createElement('label'); label.textContent=key.replaceAll('-',' ');
    const input=document.createElement('input'); input.type='color'; input.value=cardColors()[key] || cardLayout().colors[key]; input.dataset.color=key;
    input.addEventListener('input',()=>{card().colors={...cardColors(),[key]:input.value};card().colorScheme='';updateSchemes();render();save();}); label.append(input);return label;
  }));
  updateSchemes();
}
function updateSchemes(){
  let matched=false;
  const buttons=[...$('#color-schemes').children].sort((a,b)=>Number(b.dataset.scheme===cardScheme())-Number(a.dataset.scheme===cardScheme()));
  for(const button of buttons){const palette=button.dataset.scheme==='Template'?{colors:cardLayout().colors}:schemes.find(p=>p.name===button.dataset.scheme);
    const same=!matched&&Object.keys(cardLayout().colors).every(key=>!palette.colors[key]||cardColors()[key]?.toLowerCase()===palette.colors[key].toLowerCase());
    button.setAttribute('aria-pressed',String(same));if(same)matched=true;
  }
}
function rebuildCardSelect() {
  $('#preview-card-select').replaceChildren(...state.cards.map((c,i)=>new Option(`${i+1} · ${cardTitle(c)}`,String(i))));
  $('#preview-card-select').value=String(state.active);
  const dots=$('#card-dots');
  if(dots.children.length!==state.cards.length){
    dots.replaceChildren(...state.cards.map((c,i)=>{
      const button=document.createElement('button');button.type='button';button.className='card-dot';
      button.onclick=()=>selectCard(i);return button;
    }));
  }
  [...dots.children].forEach((button,i)=>{
    button.title=`${i+1} · ${cardTitle(state.cards[i])}`;
    button.setAttribute('aria-label',`Card ${i+1}: ${cardTitle(state.cards[i])}`);
    if(i===state.active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  });
  const selectedDot=dots.children[state.active];
  if(selectedDot){
    const rowBounds=dots.getBoundingClientRect(), dotBounds=selectedDot.getBoundingClientRect();
    if(dotBounds.left<rowBounds.left)dots.scrollLeft-=rowBounds.left-dotBounds.left;
    else if(dotBounds.right>rowBounds.right)dots.scrollLeft+=dotBounds.right-rowBounds.right;
  }
  $('#card-position').textContent=`Card ${state.active+1} of ${state.cards.length}`+(card().expansion?' · '+card().expansion:'');

}
function cardTitle(c){return c.values.common_name || c.values.element_name || Object.values(c.values).find(Boolean) || 'Untitled card';}
function selectCard(index){return run(async()=>{stopDrawing();state.active=(index+state.cards.length)%state.cards.length;await showCard();});}
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
async function startOver(){
  const hosted=Boolean(project?.csv && !localBundle);
  const message=hosted?`Restore ${project.name}? This replaces your current cards, drawings, and edited layouts with the project's starter cards, artwork, and both original layouts. Save your project first to keep your work.`:`Start over? This clears all ${state.cards.length} cards, imported images, and drawings. Your current SVG template stays; starting colors are restored. Save your project first to keep your work.`;
  if(!confirm(message))return;
  return withLoading(hosted?'Restoring starter project…':'Starting a fresh workspace…',async()=>{
    stopDrawing();
    if(hosted){
      // Fetch both layouts before replacing recovery; a failed download keeps saved work.
      const sources=await Promise.all(catalog.map(async item=>{const response=await fetchProjectFile(item.url);if(!response.ok)throw Error('Cannot restore starter template.');return readTemplate(await response.text()).source;}));
      let restoredBack=null;
      if(project.cardBack?.svg){const response=await fetchProjectFile(project.cardBack.templateUrl);if(!response.ok)throw Error('Cannot restore starter back.');restoredBack=readTemplate(await response.text());}
      const previousSources=catalog.map(item=>item.source),previousBack=backTemplate,previousState=state;
      try{
        catalog.forEach((item,i)=>item.source=sources[i]);backTemplate=restoredBack; if(project.cardBack?.svg)project.cardBack.layout=restoredBack;
        await loadHostedCards();
      }catch(err){catalog.forEach((item,i)=>item.source=previousSources[i]);backTemplate=previousBack;state=previousState;if(project.cardBack?.svg)project.cardBack.layout=previousBack;throw err;}
      template=readTemplate(state.templateSVG);activeSide='front';updateSideTools();
    }else{
      state.cards=[blankCard()];state.active=0;state.assets={};state.imported=null;delete state.expansionPacks;state.colors={...template.colors};state.colorScheme='Template';applyProjectScheme();
    }
    save();await pruneAssets();buildColors();await showCard();
    $('#print-status').textContent='';$('#single-print-status').textContent='';$('#drawing-tools').open=false;$('#image-adjustments').open=false;
  });
}
function rebuildAssets() {
  const back=activeSide==='back',selected=back?card().backImageName:card().imageName;
  $('#asset-select').replaceChildren(new Option('No image',''),...Object.keys(state.assets).map(name=>new Option(name,name)));
  if (selected && !state.assets[selected]) $('#asset-select').add(new Option(selected+' (choose this file)',selected));
  if (!back && card().drawingKey) $('#asset-select').add(new Option('Your browser drawing','@drawing'));
  $('#asset-select').value=!back&&card().drawingActive?'@drawing':selected || '';
  $('#image-adjustments').hidden=!Object.keys(state.assets).length && (back || !card().drawingKey) && !selected;
}
function render() {
  updateAutomaticColors();
  rendered=renderTemplate(cardLayout(),card().values,cardColors(),imageData,cardCrop(),$('#card-preview'));
  if (assetLoading) rendered.issues.push('Loading this card’s image…');
  if (activeSide==='front' && card().drawingActive && !imageData && !assetLoading) rendered.issues.push('The saved drawing is missing. Open a project backup or draw it again.');
  const selectedImage=activeSide==='back'?card().backImageName:card().imageName;
  if (selectedImage && !(activeSide==='front'&&card().drawingActive) && !imageData && !assetLoading) rendered.issues.push(`Choose the image file “${selectedImage}” to include it in the card.`);
  $('#fit-issues').replaceChildren(...rendered.issues.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  updateActionButtons();
  for(const f of cardLayout().fields){ if(f.type==='checkbox')continue; const input=$(`#fields [data-field="${f.key}"]`); if(!input)continue; input.setAttribute('aria-invalid',String(rendered.issues.some(t=>t.startsWith(f.label+':')))); $(`[data-count="${f.key}"]`).textContent=`${[...(card().values[f.key]||'')].length} / ${f.max}`; }
  $('#template-title').hidden=false;$('#template-title').textContent=cardLayout().title;
}
function updateActionButtons(){
  if(!rendered)return;
  $('#download-svg').disabled=rendered.issues.length>0 || busy;
  $('#print-card').disabled=rendered.issues.length>0 || busy;
  $('#delete-card').disabled=state.cards.length<=1 || busy;
  $('#delete-card').title=state.cards.length<=1?'Keep at least one card. Add or import another card first.':'Delete the selected card';
}
async function showCard() {
  const seq=++generation; assetLoading=true;
  updateTemplateSelect();buildFields(); buildColors(); rebuildCardSelect(); rebuildAssets();$('#card-copies').value=card().copies ?? 1;
  $('#side-toggle').hidden=!backTemplate;$('#preview-side-toggle').hidden=!backTemplate;
  $('#drawing-tools').hidden=activeSide==='back';$('.draw-heading h2').textContent=activeSide==='back'?'Back reference graphic':'Add identification artwork';
  $('.crop-tools').hidden=false;
  $('#edit-front').setAttribute('aria-pressed',String(activeSide==='front'));$('#edit-back').setAttribute('aria-pressed',String(activeSide==='back'));
  $('#preview-front').setAttribute('aria-pressed',String(activeSide==='front'));$('#preview-back').setAttribute('aria-pressed',String(activeSide==='back'));
  for(const key of ['x','y','zoom']) $('#crop-'+key).value=cardCrop()[key];
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const current=card();
  const back=activeSide==='back',selectedImage=back?(current.backImageName || current.imageName):current.imageName;
  const artworkKey=back?(current.backImageName?state.assets[current.backImageName]:current.drawingActive?current.drawingKey:state.assets[current.imageName]):current.drawingActive?current.drawingKey:state.assets[current.imageName];
  const [pic,drawing] = await Promise.all([getAsset(artworkKey),getAsset(!back?current.drawingKey:null)]);
  if(seq!==generation)return;
  if(pic)await decodeImage(pic);
  if(seq!==generation)return;
  if(drawing){const img=await decodeImage(drawing);if(seq!==generation)return;ctx.drawImage(img,0,0,canvas.width,canvas.height);}
  imageData=pic; assetLoading=false;
  $('#image-status').textContent=!back&&current.drawingActive?'Using your drawing.':selectedImage?`Image: ${selectedImage}`:back?'Choose a back reference graphic.':'Choose an image or draw below.';
  render(); save();
}
function applyTemplate(source,id) {
  const next=readTemplate(source);
  if(activeSide==='back'){
    backTemplate=next;state.backTemplateSVG=next.source;
    updateSideTools();buildFields();buildColors();$('#template-title').textContent=next.title;
    return;
  }
  checkProjectTemplate(next.source,id);
  const item=catalog.find(t=>t.id===id);if(item)item.source=next.source;
  template=next;state.templateId=id;state.templateSVG=next.source;state.colors={...next.colors};state.colorScheme='Template';
  applyProjectScheme();
  updateTemplateSelect();buildColors();$('#template-title').textContent=next.title;
}
function updateTemplateSelect() {
  if(activeSide==='back'){$('#template-select').disabled=true;return;}
  $('#template-select').replaceChildren(...catalog.map(item=>new Option(item.title,item.id)));
  if(!catalog.some(c=>c.id===state.templateId)) $('#template-select').add(new Option(template.title+' (opened SVG)',state.templateId));
  if(card().layout){const match=catalog.find(t=>t.source===card().layout);if(match)$('#template-select').value=match.id;else{$('#template-select').add(new Option(readTemplate(card().layout).title+' (this card)','@card-layout'));$('#template-select').value='@card-layout';}}else $('#template-select').value=state.templateId;$('#template-select').disabled=false;
}
function updateSideTools(){
  const enabled=Boolean(backTemplate);$('#side-toggle').hidden=!enabled;$('#preview-side-toggle').hidden=!enabled;
  $('#template-select').disabled=activeSide==='back';
  $('#template-layout-label').textContent=activeSide==='back'?'Back template':'Front template';
  $('#edit-front').setAttribute('aria-pressed',String(activeSide==='front'));$('#edit-back').setAttribute('aria-pressed',String(activeSide==='back'));
  $('#preview-front').setAttribute('aria-pressed',String(activeSide==='front'));$('#preview-back').setAttribute('aria-pressed',String(activeSide==='back'));
  $('#template-title').hidden=false;$('#template-title').textContent=cardLayout().title;
}
async function setSide(side){if(side==='back'&&!backTemplate)return;stopDrawing();activeSide=side;updateSideTools();await showCard();}
for(const id of ['edit-front','preview-front'])$('#'+id).onclick=()=>run(()=>setSide('front'));
for(const id of ['edit-back','preview-back'])$('#'+id).onclick=()=>run(()=>setSide('back'));
function decodeImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be opened.'));img.src=src;});}
async function normalizeImage(file) {
  if(file.size>12*1024*1024)throw Error(`${file.name}: choose an image under 12 MB.`);
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use PNG, JPG, or WebP images. Convert HEIC photos to JPG first.');
  const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read the image.'));r.readAsDataURL(file);});
  const img=await decodeImage(src);if(img.width*img.height>25_000_000)throw Error('Use an image smaller than 25 megapixels.');
  const scale=Math.min(1,1600/Math.max(img.width,img.height));if(scale===1)return src; const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL(file.type==='image/jpeg'?'image/jpeg':'image/png',.92);
}
async function uploadImages(files) {
  if(files.length>40)throw Error('Choose up to 40 images at a time.');
  if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('Rename duplicate image filenames before uploading.');
  for(const file of files){$('#image-status').textContent='Saving '+file.name+'…';const data=await normalizeImage(file);const key=state.assets[file.name] || 'image-'+blankCard().id;await putAsset(key,data);state.assets[file.name]=key;save();}
  if(files.length===1){if(activeSide==='back'&&!card().backImageName)card().backImageName=files[0].name;else if(activeSide==='front'&&!card().imageName){card().imageName=files[0].name;card().drawingActive=false;}}
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
function themeValue(c){
  if(project?.colorRules?.length && !c.colors)return '';
  const colors=c.colors || state.colors;
  const preferred=c.colors?c.colorScheme:state.colorScheme;
  const match=[...schemes].sort((a,b)=>Number(b.name===preferred)-Number(a.name===preferred)).find(p=>Object.keys(template.colors).every(k=>colors[k]?.toLowerCase()===(p.colors?.[k] || template.colors[k]).toLowerCase()));
  return match?.name || 'custom:'+Object.keys(template.colors).map(k=>k+'='+(colors[k] || template.colors[k])).join(';');
}
function cardCsv(imagePaths={}){
  const keys=[...new Set(['card_id',...csvFields().map(f=>f.key),...state.cards.flatMap(c=>Object.keys(c.values))])];
  return [keys.map(csvCell).join(','),...state.cards.map(c=>keys.map(k=>{const field=csvFields().find(f=>state.imported?.mapping[f.key]===k)?.key || k;return csvCell(field==='card_id'?c.id:field==='image_filename'?(imagePaths[c.imageName] || c.imageName):field==='back_image_filename'?(imagePaths[c.backImageName] || c.backImageName || ''):field==='copies'?String(c.copies ?? 1):field==='theme'?themeValue(c):(Object.hasOwn(c.values,field)?c.values[field]:c.values[k] || ''));}).join(','))].join('\r\n');
}
async function exportProject(){
  clearTimeout(drawTimer);
  if(drawingPointer!==null)throw Error('Finish your drawing before saving.');
  const files=new Map(localBundle?.files.map(e=>[e.path,e.file]) || []),missingArchives=[];
  let manifest={version:1,name:project?.name || 'Classroom Cards',files:[]};
  if(localBundle)manifest=JSON.parse(await files.get('manifest.json').text());
  else if(project){
    const response=await fetch(new URL('manifest.json',project.base));if(!response.ok)throw Error('Cannot save project resources.');manifest=await response.json();
    for(const item of project.files){const r=await fetch(item.url);if(!r.ok){if(r.status===404 && item.type==='download' && /\.zip$/i.test(item.path)){missingArchives.push(item.path);continue;}throw Error('Cannot save '+item.path);}files.set(item.path,await r.blob());}
    if(missingArchives.length)manifest.files=manifest.files.filter(item=>!missingArchives.includes(item.path));
    if(project.cardBack?.image){const r=await fetch(project.cardBack.url);if(!r.ok)throw Error('Cannot save card back.');files.set(project.cardBack.image,await r.blob());}
    if(project.cardBack?.svg){const r=await fetch(project.cardBack.templateUrl);if(!r.ok)throw Error('Cannot save card-back template.');files.set(project.cardBack.svg,await r.blob());}
  }
  const templates=[];
  for(const item of catalog){
    const path=normalizeProjectPath(item.svg || 'templates/'+item.id+'.svg');let source=item.id===state.templateId?state.templateSVG:item.source;
    if(!source){const r=await fetch(item.url || 'templates/'+item.svg);if(!r.ok)throw Error('Cannot save template.');source=await r.text();}
    files.set(path,new Blob([source],{type:'image/svg+xml'}));templates.push({id:item.id,title:item.title,svg:path});
  }
  if(!templates.some(t=>t.id===state.templateId)){const path='templates/'+state.templateId+'.svg';files.set(path,new Blob([state.templateSVG]));templates.push({id:state.templateId,title:template.title,svg:path});}

  // Basename aliases are lookup conveniences, not additional files.
  const groups=new Map(),imagePaths=Object.create(null),claimed=new Set();
  for(const [name,key] of Object.entries(state.assets)){
    normalizeProjectPath(name);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(name);
  }
  for(const [key,names] of groups){
    const canonical=[...names].sort((a,b)=>Number(b.startsWith('graphics/'))-Number(a.startsWith('graphics/')) || Number(b.includes('/'))-Number(a.includes('/')))[0];
    const data=await getAsset(key);if(!data)throw Error('A saved image is missing: '+canonical);
    let path=canonical.includes('/')?canonical:'graphics/'+canonical;
    if(!/\.(png|jpe?g|webp)$/i.test(path))throw Error('Image filenames must end in PNG, JPG, or WebP.');
    const original=path;let count=2;
    while(claimed.has(path))path=original.replace(/(\.[^.]+)$/, '-'+count+++'$1');
    claimed.add(path);
    for(const name of names){imagePaths[name]=path;if(name!==path)files.delete(name);}
    files.set(path,await (await fetch(data)).blob());
  }
  if(manifest.cardBack?.image && imagePaths[normalizeProjectPath(manifest.cardBack.image)])manifest.cardBack.image=imagePaths[normalizeProjectPath(manifest.cardBack.image)];
  if(manifest.files)manifest.files=manifest.files.map(item=>({...item,path:imagePaths[normalizeProjectPath(item.path)] || item.path}));
  const workspace={version:1,expansionPacks:state.expansionPacks || {},activeCardId:card().id,cards:Object.create(null),workspaceColors:Object.fromEntries(Object.keys(template.colors).map(k=>[k,state.colors[k] || template.colors[k]])),workspaceScheme:state.colorScheme || ''};
  for(const c of state.cards){
    const settings={sourceProjectId:c.sourceProjectId || null,colors:c.colors || (project?.colorRules?.length?undefined:state.colors),colorScheme:c.colorScheme || '',crop:c.crop,backCrop:c.backCrop,drawingActive:c.drawingActive,csvImportId:c.csvImportId || null,expansion:c.expansion || '',attribution:c.attribution || ''};
    if(c.layout){settings.layoutFile='templates/card-'+c.id+'.svg';files.set(settings.layoutFile,new Blob([c.layout],{type:'image/svg+xml'}));}
    if(c.drawingKey){const data=await getAsset(c.drawingKey);if(!data)throw Error('A saved drawing is missing.');settings.drawingFile='graphics/drawing-'+c.id+'.png';files.set(settings.drawingFile,await (await fetch(data)).blob());}
    workspace.cards[c.id]=settings;
  }
  const importedCsvs=localBundle?.files.filter(e=>/\.csv$/i.test(e.path)) || [];
  manifest.templates=templates;manifest.csv=normalizeProjectPath(manifest.csv || (importedCsvs.length===1?importedCsvs[0].path:'cards.csv'));manifest.workspace='workspace.json';
  manifest.starter={template:state.templateId,scheme:schemes[0].name,values:{}};
  manifest.colorSchemes=schemes.map(p=>p.colors?{name:p.name,colors:p.colors}:p.name);
  if(backTemplate){const path=normalizeProjectPath(manifest.cardBack?.svg || project?.cardBack?.svg || 'templates/card-back.svg');files.set(path,new Blob([state.backTemplateSVG || backTemplate.source],{type:'image/svg+xml'}));manifest.cardBack={svg:path,description:'Editable card-back template'};}
  else if(state.cardBack){const blob=await (await fetch(state.cardBack)).blob(),path='graphics/card-back.'+(blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png');files.set(path,blob);manifest.cardBack={image:path,description:'Card back'};}
  else if(state.cardBack===null)delete manifest.cardBack;
  files.set(manifest.csv,new Blob(['\ufeff'+cardCsv(imagePaths)],{type:'text/csv'}));
  files.set('workspace.json',new Blob([JSON.stringify(workspace,null,2)],{type:'application/json'}));
  files.set('manifest.json',new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));
  download(slug(manifest.name)+'-project.zip','application/zip',await zipProject([...files].map(([path,file])=>({path,file}))));
  $('#local-project-status').textContent=missingArchives.length?'Project saved with current cards and artwork. Unavailable resource archives omitted: '+missingArchives.join(', '):'Project ZIP saved with current cards and artwork.';
}
function alignSavedScientificName(value,allowed){
  if(value?.templateId!=='food-web' || typeof value.templateSVG!=='string')return;
  const old=readTemplate(value.templateSVG),field=old.root.querySelector('[data-field="binomial_name"]');
  if(!field)return;
  field.setAttribute('data-field','scientific_name');field.setAttribute('data-label','Scientific name');
  if(field.id==='binomial_name')field.id='scientific_name';
  const source=readTemplate(new XMLSerializer().serializeToString(old.root)).source;
  // Only upgrade the known field rename when the complete template still matches.
  if(!allowed.some(t=>t.id==='food-web' && t.source===source))return;
  value.templateSVG=source;
  for(const c of value.cards || [])if(c.values && Object.hasOwn(c.values,'binomial_name')){c.values.scientific_name ??= c.values.binomial_name;delete c.values.binomial_name;}
  if(value.imported?.mapping?.binomial_name){value.imported.mapping.scientific_name=value.imported.mapping.binomial_name;delete value.imported.mapping.binomial_name;}
}
function validateState(value,context){
  const constraintProject=context?.project || project, constraintCatalog=context?.project.templates || catalog;
  if(!value||value.version!==2||!Array.isArray(value.cards)||!value.cards.length||value.cards.length>500||!Number.isInteger(value.active)||value.active<0||value.active>=value.cards.length)throw Error('This is not a supported Classroom Cards project file.');
  alignSavedScientificName(value,constraintCatalog);
  const checkedTemplate=readTemplate(value.templateSVG);
  if(constraintProject && !constraintProject.editableTemplates && !constraintCatalog.some(t=>t.id===value.templateId && t.source===checkedTemplate.source))throw projectConstraint('This saved template is not allowed in the project.');
  if(value.backTemplateSVG)value.backTemplateSVG=readTemplate(value.backTemplateSVG).source;


  for(const c of value.cards){c.copies ??= 1;if(!Number.isInteger(c.copies)||c.copies<1||c.copies>600)throw Error('The project contains invalid copy counts.');if(c.colors && (Object.values(c.colors).some(v=>!/^#[0-9a-f]{6}$/i.test(v))))throw Error('The project contains invalid or unavailable card colors.');if(!c.values||Object.values(c.values).some(v=>typeof v!=='string')||typeof c.id!=='string'||(c.imageName && typeof c.imageName!=='string')||(c.backImageName && typeof c.backImageName!=='string')||(c.drawingKey && typeof c.drawingKey!=='string'))throw Error('The project contains invalid card data.');c.crop={x:.5,y:.5,zoom:1,...c.crop};for(const key of ['x','y','zoom'])if(!Number.isFinite(c.crop[key]))throw Error('The project contains invalid image positioning.');if(c.backCrop && (![c.backCrop.x,c.backCrop.y,c.backCrop.zoom].every(Number.isFinite)||c.backCrop.x<0||c.backCrop.x>1||c.backCrop.y<0||c.backCrop.y>1||c.backCrop.zoom<.1||c.backCrop.zoom>4))throw Error('Invalid back image crop.');}
  if(!value.assets||Object.values(value.assets).some(v=>typeof v!=='string')||!value.colors||Object.values(value.colors).some(v=>!/^#[0-9a-f]{6}$/i.test(v)))throw Error('The project contains invalid image or color data.');
  if(value.imported && (!Array.isArray(value.imported.rows)||!Array.isArray(value.imported.headers)||!Array.isArray(value.imported.indices)||value.imported.indices.length!==value.imported.rows.length||value.imported.indices.some(i=>!Number.isInteger(i)||!value.cards[i])||!value.imported.mapping))throw Error('The saved CSV data is invalid.');
  if(value.imported)for(const i of value.imported.indices)value.cards[i].csvImportId ||= 'recovered-csv';
  if(value.expansionPacks!==undefined)validateExpansionPacks(value.expansionPacks);
  assertCards(value.cards);for(const c of value.cards)if(c.layout)c.layout=readTemplate(c.layout).source;
  return value;
}
async function importProject(file){try{await importLocalFiles(await unzip(file));}catch(err){$('#local-project-status').textContent='Project was not imported. '+err.message;throw err;}}
async function run(action){if(busy)return;busy=true;$('#page-error').textContent='';document.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=true);try{await action();}catch(err){error(err);}finally{busy=false;document.querySelectorAll('button,select,input,textarea').forEach(el=>el.disabled=false);$('#template-select').disabled=activeSide==='back';if(template && $('#recovery-error').hidden)updateActionButtons();}}
$('#template-select').onchange=()=>run(async()=>{const item=catalog.find(c=>c.id===$('#template-select').value);if(!item)return;const r=await fetch(item.url || 'templates/'+item.svg,{cache:'no-cache'});if(!r.ok)throw Error('Cannot open that built-in template.');applyTemplate(await r.text(),item.id);if(card().layout)card().layout=state.templateSVG;await showCard();});
$('#svg-file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)run(async()=>{if(f.size>500_000)throw Error('Choose a template SVG under 500 KB.');applyTemplate(await f.text(),'custom');if(activeSide==='front'&&card().layout)card().layout=state.templateSVG;await showCard();});};
$('#card-copies').onchange=()=>{const value=Number($('#card-copies').value);if(!Number.isInteger(value)||value<1||value>600){$('#card-copies').value=card().copies ?? 1;error(Error('Choose 1–600 copies for this card.'));return;}card().copies=value;rebuildCardSelect();save();};
$('#preview-card-select').onchange=()=>selectCard(Number($('#preview-card-select').value));
$('#previous-card').onclick=()=>selectCard(state.active-1);
$('#next-card').onclick=()=>selectCard(state.active+1);
$('#delete-card').onclick=()=>run(async()=>{
  if(state.cards.length<=1)return;
  const index=state.active;
  if(!confirm(`Delete “${cardTitle(card())}”? This removes this card from the current project.`))return;
  stopDrawing();
  state.cards.splice(index,1);
  if(state.imported){
    const retained=state.imported.indices.flatMap((old,i)=>old===index?[]:[{index:old>index?old-1:old,row:state.imported.rows[i]}]);
    state.imported.indices=retained.map(item=>item.index);state.imported.rows=retained.map(item=>item.row);
    if(!retained.length)state.imported=null;
  }
  state.active=Math.min(index,state.cards.length-1);
  save();await showCard();
});
$('#new-card').onclick=()=>run(async()=>{if(state.cards.length>=500)throw Error('Save this project and start another before adding more cards.');insertCard(state.cards,blankCard());state.active=state.cards.length-1;await showCard();});
$('#start-over').onclick=()=>run(startOver);
for(const id of ['image-files','camera-file'])$('#'+id).onchange=e=>{const files=[...e.target.files];e.target.value='';if(files.length)run(()=>uploadImages(files));};
$('#asset-select').onchange=()=>run(async()=>{const name=$('#asset-select').value;if(activeSide==='back')card().backImageName=name;else{card().drawingActive=name==='@drawing';if(!card().drawingActive)card().imageName=name;}if(activeSide==='back')card().backCrop={x:.5,y:.5,zoom:1};else card().crop={x:.5,y:.5,zoom:1};await showCard();});
for(const key of ['x','y','zoom'])$('#crop-'+key).oninput=e=>{cardCrop()[key]=Number(e.target.value);render();save();};
let drawingPointer=null;
function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];}
canvas.onpointerdown=e=>{if(busy||drawingPointer!==null)return;drawingPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);const [x,y]=point(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y+.1);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=$('#ink-color').value;ctx.lineWidth=Number($('#brush-size').value);ctx.stroke();};
canvas.onpointermove=e=>{if(e.pointerId!==drawingPointer)return;const [x,y]=point(e);ctx.lineTo(x,y);ctx.stroke();clearTimeout(drawTimer);drawTimer=setTimeout(()=>saveDrawing().catch(error),250);};
function finishDrawing(e){if(e.pointerId!==drawingPointer)return;drawingPointer=null;clearTimeout(drawTimer);run(()=>saveDrawing());}
canvas.onpointerup=finishDrawing;canvas.onpointercancel=finishDrawing;
$('#clear-drawing').onclick=()=>run(async()=>{ctx.clearRect(0,0,canvas.width,canvas.height);await saveDrawing(card().drawingActive);});
$('#use-drawing').onclick=()=>run(()=>saveDrawing());
$('#template-svg').onclick=()=>download(slug(cardLayout().title)+'-template.svg','image/svg+xml',cardLayout().source);
$('#save-project').onclick=()=>run(exportProject);
$('#open-project').onclick=()=>$('#open-project-dialog').showModal();
$('#open-json').onchange=e=>{if($('#open-project-dialog').open)$('#open-project-dialog').close();const f=e.target.files[0];e.target.value='';if(f)run(()=>importProject(f));};
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
    if(recovered&&!confirm('Open the shared starter card in place of your saved cards? Cancel to keep your saved work. Save your project before reopening this link if you need a backup.')){
      consumeStarter();return;
    }
    stopDrawing();
    state={version:2,templateId:defaults.svg?'custom':defaults.template,templateSVG:next.source,colors:{...next.colors},colorScheme:defaults.scheme || '',cards:[blankCard()],active:0,assets:{},imported:null};
    template=next;
    state.colors=Object.fromEntries(Object.entries(next.colors).map(([key,value])=>[key,Object.hasOwn(defaults.colors,key)?defaults.colors[key]:value]));
    card().values=Object.fromEntries(next.fields.map(f=>[f.key,Object.hasOwn(defaults.fields,f.key)?defaults.fields[f.key]:'']));
    updateTemplateSelect();buildColors();$('#template-title').textContent=next.title;
    save();consumeStarter();
  }catch(err){error(err);}
}
async function currentCardBack(){return state.cardBack===null?undefined:state.cardBack?{image:'images/card-back.png',url:state.cardBack}:project?.cardBack?.image?project.cardBack:undefined;}
function showCardBack(){
  const dual=Boolean(backTemplate),url=state.cardBack===null?'':state.cardBack || project?.cardBack?.url || '';
  $('#card-back-file').parentElement.hidden=dual;$('#card-back-preview').hidden=dual||!url;$('#remove-card-back').hidden=dual||!url;
  if(!dual)$('#card-back-preview').src=url;
  $('#card-back-status').textContent=dual?'This project has editable fields on both sides. Print double-sided and flip on the short edge.':url?'Card back included in print sheets and project ZIP. Print double-sided, flip on the short edge.':'No card back selected.';
}
$('#card-back-file').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)run(async()=>{state.cardBack=await normalizeImage(file);save();showCardBack();});};
$('#remove-card-back').onclick=()=>{state.cardBack=null;save();showCardBack();};
async function openPrint(scope,copies,status){
  // Open during the button gesture, before image/font loading yields to Safari.
  const sheet=window.open('','_blank');
  if(!sheet)throw Error('Allow pop-ups for this site, then try opening the print sheets again.');
  sheet.opener=null;
  sheet.document.write('<!doctype html><html><head><title>Preparing card sheets</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><p role="status">Preparing your card sheets…</p></body></html>');
  sheet.document.close();
  try{
    const printSide=activeSide;let snapshot;try{activeSide='front';snapshot=structuredClone(state);for(const c of snapshot.cards)c.colors=resolvedColors(c,snapshot);}finally{activeSide=printSide;}
    const html=await printDocument(template,snapshot,getAsset,scope,copies,await currentCardBack(),backTemplate);
    if(sheet.closed){$(status).textContent='Print sheet closed. Open it again when ready.';return;}
    sheet.document.open();sheet.document.write(html);sheet.document.close();
    $(status).textContent='Print sheets opened in a new tab. Choose Print / Save as PDF there; your editor stays in this tab.';
  }catch(err){if(!sheet.closed)sheet.close();throw err;}
}
$('#print-sheets').onclick=()=>run(()=>openPrint('all',1,'#print-status'));
$('#print-card').onclick=()=>run(()=>openPrint('current',1,'#single-print-status'));
$('#download-svg').onclick=()=>run(async()=>{
  render();if(rendered.issues.length)throw Error('Complete or shorten the marked fields before exporting.');
  const svg=rendered.root.cloneNode(true);svg.setAttribute('data-card-app','finished-card');
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=await fontStyles();svg.prepend(style);
  state.projectIdentity ||= crypto.randomUUID();save();
  const metadata=document.createElementNS('http://www.w3.org/2000/svg','metadata');metadata.setAttribute('data-card-format',FORMAT);metadata.textContent=JSON.stringify(await serializeCard({...card(),colors:cardColors()},state,getAsset,activeProjectId));svg.prepend(metadata);
  download(slug(cardTitle(card()))+'.svg','image/svg+xml',new XMLSerializer().serializeToString(svg));
});
function checkProjectTemplate(source,id){
  if(project && !project.editableTemplates && !catalog.some(t=>t.id===id && t.source===source))throw projectConstraint('This template is not allowed in the current project. Save your project before starting a different layout.');
}
function applyProjectScheme(){
  if(!project)return;
  const scheme=schemes.find(p=>p.name===project.starter.scheme) || schemes[0];
  state.colors={...template.colors,...scheme.colors};state.colorScheme=scheme.name;
}
function setupProject(){
  if(project.csv && !localBundle){$('#start-over').textContent='Restore starter examples';$('#workspace-tools .hint').textContent='Reload the original cards, artwork, and layouts. Save your project first to keep your edits.';}
  if(project.id==='field-guide'){document.body.classList.add('field-guide');canvas.width=540;canvas.height=610;}
  $('#template-tools .open-project').hidden=!project.editableTemplates;
  $('.intro h1').textContent=project.name;$('.intro p').textContent=project.description || '';document.title=project.name+' · Classroom Cards';
  $('.custom-colors').hidden=false;
  $('#project-resources').hidden=!project.files.length && !project.expansions?.length;$('#project-files').replaceChildren();$('#project-document').hidden=true;
  for(const file of project.files){
    const link=document.createElement(file.type==='markdown'?'button':'a');link.className='button secondary';link.textContent=file.title;
    if(file.type==='markdown'){link.type='button';link.onclick=async()=>{
      $('#document-status').textContent='Opening '+file.title+'…';
      try{const response=await fetch(file.url);if(!response.ok)throw Error('Cannot open '+file.title);renderMarkdown(await response.text(),$('#document-content'),file.base || file.url,project.resolveLink);$('#document-title').textContent=file.title;$('#project-document').hidden=false;$('#project-document').open=true;$('#document-status').textContent='';}
      catch(err){$('#document-status').textContent=err.message;}
    };}else{link.href=file.url;link.download=file.path.split('/').pop();}
    $('#project-files').append(link);
  }
  for(const pack of project.expansions || []){
    const open=document.createElement('a');open.className='button secondary';open.textContent='Open '+pack.name;const target=new URL(location.href);target.search='';target.hash='';target.searchParams.set('project',pack.id);open.href=target.href;
    const add=document.createElement('button');add.type='button';add.className='button secondary';add.textContent='Add '+pack.name;add.onclick=()=>run(()=>addHostedExpansion(pack.id));
    $('#project-files').append(open,add);
  }

}
function offerRecoveryReset(saved,err){
  $('#page-error').textContent='';
  $('#recovery-error').hidden=false;
  $('#recovery-error-message').textContent=err.message || String(err);
  $('#save-state').textContent='Saved work needs your attention. Choose Download saved work or Start fresh above.';
  $('.layout').inert=true;$('#workspace-tools').inert=true;
  $('#download-recovery').onclick=async()=>{
    const status=$('#recovery-error-status');
    try{
      const files=new Map(localBundle?.files.map(e=>[e.path,e.file]) || []);
      files.set('recovery.json',new Blob([saved],{type:'application/json'}));
      if(!files.has('manifest.json'))files.set('manifest.json',new Blob([JSON.stringify({version:1,name:'Workspace recovery'})]));
      let snapshot;try{snapshot=JSON.parse(saved);}catch{}
      for(const key of new Set([...Object.values(snapshot?.assets || {}),...(Array.isArray(snapshot?.cards)?snapshot.cards.map(c=>c?.drawingKey):[])])){
        if(typeof key!=='string' || !key)continue;const image=await getAsset(key);if(image)files.set('recovery-images/'+slug(key)+'.png',await (await fetch(image)).blob());
      }
      download('classroom-cards-recovery.zip','application/zip',await zipProject([...files].map(([path,file])=>({path,file}))));
      status.textContent='Recovery ZIP downloaded for troubleshooting. It contains the original saved data; damaged work may need repair before reopening.';
    }catch(error){status.textContent=error.message || String(error);}
  };
  $('#fresh-recovery').onclick=()=>run(()=>withLoading('Starting a fresh project…',async()=>{
    stopDrawing();consumeStarter();
    // Only replace recovery after the requested starting template has loaded.
    state={version:2,templateId:'',templateSVG:'',colors:{},cards:[blankCard()],active:0,assets:{},imported:null};
    template=null;
    $('#recovery-error').hidden=true;
    try{if(project?.csv && !localBundle)await loadHostedCards();await finishStart(false);}catch(err){$('#recovery-error').hidden=false;throw err;}
    $('.layout').inert=false;$('#workspace-tools').inert=false;$('#recovery-error').hidden=true;
  }));
}
function localMapping(headers,layout){
  const aliases={copies:['copies','card count','count','quantity'],theme:['theme','color theme','color scheme','colour theme','colour scheme'],image_filename:['image filename','image','image file'],back_image_filename:['back image filename','back image','back artwork'],scientific_name:['scientific name','binomial name']};
  return Object.fromEntries([...layout.fields,{key:'image_filename'},{key:'back_image_filename'},{key:'copies'},{key:'theme'}].map(f=>[f.key,headers.find(h=>norm(h)===norm(f.key)) || headers.find(h=>(aliases[f.key] || [f.key,f.label].filter(Boolean)).some(alias=>norm(h)===norm(alias))) || '']));
}
function csvCards(p,layout,text,assets){
  const {headers,rows}=parseCsv(text);if(rows.length>500)throw Error('Keep up to 500 cards in a project.');
  const combined={...layout,fields:[...layout.fields,...(p.cardBack?.layout?.fields || backTemplate?.fields || [])]};
  const mapping=localMapping(headers,combined),importId=crypto.randomUUID();
  const cards=rows.map((row,i)=>{
    const settings=csvSettings(row,mapping,i,p.schemes,layout),rawImageName=(row[mapping.image_filename] || '').trim(),imageName=rawImageName?normalizeProjectPath(rawImageName):'',rawBackImageName=(row[mapping.back_image_filename] || '').trim(),backImageName=rawBackImageName?normalizeProjectPath(rawBackImageName):'';
    if(imageName && !Object.hasOwn(assets,imageName))throw Error(`CSV row ${i+2}: missing or ambiguous image “${imageName}”. Use its full relative path.`);
    if(backImageName && !Object.hasOwn(assets,backImageName))throw Error(`CSV row ${i+2}: missing or ambiguous back graphic “${backImageName}”. Use its full relative path.`);
    const values={...p.starter.values,...row};for(const field of combined.fields)if(mapping[field.key])values[field.key]=row[mapping[field.key]] || '';
    return {id:row.card_id || crypto.randomUUID(),csvImportId:importId,values,...settings,imageName,backImageName,drawingKey:null,drawingActive:false,crop:{x:.5,y:.5,zoom:1}};
  });
  if(cards.some(c=>!c.id || c.id.length>200 || /[\\/:\u0000-\u001f]/.test(c.id)) || new Set(cards.map(c=>c.id)).size!==cards.length)throw Error('Card IDs must be unique.');
  return {cards,imported:{headers,rows,mapping,indices:rows.map((_,i)=>i)}};
}
async function withLoading(message,action){
  loadingStatus(message);
  $('#app-loading').hidden=false;
  $('main').setAttribute('aria-busy','true');
  $('#app-loading').scrollIntoView({block:'center'});
  try{
    // Let the browser paint the progress indicator before preparing the project.
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    return await action();
  }finally{
    $('#app-loading').hidden=true;
    $('main').setAttribute('aria-busy','false');
  }
}
function loadingStatus(message){$('#loading-message').textContent=message;}
async function restoreWorkspace(next,workspace,layout,readFile,loadImage){
      if(workspace.expansionPacks!==undefined)next.expansionPacks=validateExpansionPacks(workspace.expansionPacks);
      if(workspace.version!==1 || !workspace.cards || typeof workspace.cards!=='object')throw Error('Invalid workspace settings.');
      for(const c of next.cards){
        const settings=workspace.cards[c.id];if(!settings)continue;
        const crop=settings.crop || {x:.5,y:.5,zoom:1};
        if(![crop.x,crop.y,crop.zoom].every(Number.isFinite) || crop.x<0 || crop.x>1 || crop.y<0 || crop.y>1 || crop.zoom<.1 || crop.zoom>4)throw Error('Invalid image crop.');
        if(settings.colors){if(Object.values(settings.colors).some(v=>!/^#[0-9a-f]{6}$/i.test(v)))throw Error('Invalid saved card colors.');c.colors=settings.colors;c.colorScheme=settings.colorScheme || '';}
        c.sourceProjectId=typeof settings.sourceProjectId==='string'?settings.sourceProjectId:undefined;c.expansion=settings.expansion || '';c.attribution=settings.attribution || '';
        if(settings.layoutFile){const file=await readFile(normalizeProjectPath(settings.layoutFile));if(!file)throw Error('Missing card layout.');c.layout=readTemplate(await file.text()).source;}
        if(settings.backCrop){const b=settings.backCrop;if(![b.x,b.y,b.zoom].every(Number.isFinite)||b.x<0||b.x>1||b.y<0||b.y>1||b.zoom<.1||b.zoom>4)throw Error('Invalid back image crop.');c.backCrop=b;}
        c.crop=crop;c.drawingActive=settings.drawingActive===true;c.csvImportId=typeof settings.csvImportId==='string'?settings.csvImportId:undefined;
        if(settings.drawingFile){const path=normalizeProjectPath(settings.drawingFile);c.drawingKey=await loadImage(path);if(!c.drawingKey)throw Error('Missing saved drawing.');}
        if(c.drawingActive&&!c.drawingKey)throw Error('Missing active drawing.');
      }
      if(next.imported){const indices=next.cards.flatMap((c,i)=>c.csvImportId?[i]:[]);next.imported={...next.imported,indices,rows:indices.map(i=>next.imported.rows[i])};if(!indices.length)next.imported=null;}
      const active=next.cards.findIndex(c=>c.id===workspace.activeCardId);if(active>=0)next.active=active;
      if(workspace.workspaceColors){if(Object.entries(workspace.workspaceColors).some(([k,v])=>!Object.hasOwn(layout.colors,k)||!/^#[0-9a-f]{6}$/i.test(v)))throw Error('Invalid workspace colors.');next.colors={...layout.colors,...workspace.workspaceColors};next.colorScheme=workspace.workspaceScheme || '';}
}
async function loadHostedCards(){
  loadingStatus('Loading project cards and artwork…');
  const item=catalog.find(t=>t.id===project.starter.template) || catalog[0],layout=readTemplate(item.source),scheme=schemes.find(s=>s.name===project.starter.scheme) || schemes[0];
  const response=await fetchProjectFile(new URL(project.csv,project.base));if(!response.ok)throw Error('Cannot load project CSV: '+project.csv);
  const blob=await response.blob();if(blob.size>2_000_000)throw Error('Choose a CSV under 2 MB.');
  const text=await blob.text(),parsed=parseCsv(text),mapping=localMapping(parsed.headers,layout),assets=Object.create(null),images=new Map();
  // Validate rows before fetching assets; references are populated during image loading.
  const names=[...new Set(parsed.rows.flatMap(row=>[row[mapping.image_filename],row[mapping.back_image_filename]]).map(name=>(name || '').trim()).filter(Boolean).map(normalizeProjectPath))];
  const provisional=Object.fromEntries(names.map(name=>[name,'pending']));
  csvCards(project,layout,text,provisional);
  let total=blob.size;
  for(const name of names){
    const path=name.includes('/')?name:normalizeProjectPath((project.imageDirectory || 'graphics')+'/'+name);
    let key=assets[path];
    if(!key){
      loadingStatus(`Loading artwork ${names.indexOf(name)+1} of ${names.length}…`);
      const response=await fetchProjectFile(new URL(path,project.base));if(!response.ok)throw Error('Cannot load project image: '+path);
      const blob=await response.blob();total+=blob.size;if(total>100_000_000)throw Error('Project card data and images must total under 100 MB.');
      key='image-'+crypto.randomUUID();images.set(key,await normalizeImage(new File([blob],path.split('/').pop(),{type:blob.type})));assets[path]=key;
    }
    assets[name]=key;
  }
  const data=csvCards(project,layout,text,assets);
  const next={version:2,templateId:item.id,templateSVG:item.source,...(backTemplate?{backTemplateSVG:backTemplate.source}:{}),projectPackageVersion:project.packageVersion,colors:{...layout.colors,...scheme.colors},colorScheme:scheme.name,cards:data.cards.length?data.cards:[blankCard()],active:0,assets,imported:data.cards.length?data.imported:null,projectDataInitialized:true};
  if(project.workspace){
    const readFile=async path=>{const response=await fetchProjectFile(new URL(normalizeProjectPath(path),project.base));if(!response.ok)throw Error('Missing project file: '+path);const blob=await response.blob();if(blob.size>2_000_000)throw Error('Oversized workspace/layout file.');return blob;};
    const workspace=JSON.parse(await (await readFile(project.workspace)).text());
    await restoreWorkspace(next,workspace,layout,readFile,async path=>{
      if(next.assets[path])return next.assets[path];
      const response=await fetchProjectFile(new URL(path,project.base));if(!response.ok)throw Error('Missing project drawing.');const blob=await response.blob(),key='drawing-'+crypto.randomUUID();images.set(key,await normalizeImage(new File([blob],path.split('/').pop(),{type:blob.type})));next.assets[path]=key;return key;
    });
  }
  for(const [key,image] of images)await putAsset(key,image);
  if(project.expansion)for(const c of next.cards)c.expansion ||= project.name;
  state=next;
  $('#local-project-status').textContent=`Loaded ${data.cards.length} project cards and their artwork.`;
}
async function prepareLocalProject(entries,asExpansion=false){
  let resolved;
  try{
    const files=projectFiles(entries),response=await fetch('templates/catalog.json');if(!response.ok)throw Error('Cannot load built-in templates.');
    resolved=await resolveLocalProject(files,await response.json());
    const p=resolved.project;if(asExpansion && !p.expansion)throw Error('Choose an expansion project with expansion metadata in manifest.json.');
    for(const item of p.templates){const response=await fetch(item.url);if(!response.ok)throw Error('Cannot open template '+item.title);item.source=readTemplate(await response.text()).source;}
  if(p.cardBack?.svg){const entry=files.find(e=>e.path===p.cardBack.svg);if(!entry)throw Error('Missing card-back template: '+p.cardBack.svg);p.cardBack.layout=readTemplate(await entry.file.text());}
    validateRuleTemplates(p.colorRules,p.templates.map(t=>readTemplate(t.source)));
  if(p.cardBack?.image)await loadCardBack(p.cardBack);
    const item=p.templates.find(t=>t.id===p.starter.template) || p.templates[0],layout=readTemplate(item.source),scheme=p.schemes.find(s=>s.name===p.starter.scheme) || p.schemes[0];
    let next={version:2,templateId:item.id,templateSVG:item.source,...(p.cardBack?.layout?{backTemplateSVG:p.cardBack.layout.source}:{}),colors:{...layout.colors,...scheme.colors},colorScheme:scheme.name,cards:[],active:0,assets:{},imported:null};
    const images={};
    // Full relative paths always work; unique basenames are convenient CSV aliases.
    const imageEntries=files.filter(e=>/\.(png|jpe?g|webp)$/i.test(e.path));
    for(const {path,file} of imageEntries){$('#local-project-status').textContent='Checking '+path+'…';const key='image-'+crypto.randomUUID();images[key]=await normalizeImage(file);next.assets[path]=key;}
    for(const {path} of imageEntries){const name=path.split('/').pop();if(imageEntries.filter(e=>e.path.split('/').pop()===name).length===1 && !Object.hasOwn(next.assets,name))next.assets[name]=next.assets[path];}
    const csvs=files.filter(e=>/\.csv$/i.test(e.path));
    if(p.csv!==undefined && typeof p.csv!=='string')throw Error('Manifest csv must be a relative CSV file path.');
    if(!p.csv && csvs.length>1)throw Error('This project has several CSV files. Set "csv": "path/to/cards.csv" in manifest.json to choose the card data.');
    const csv=p.csv?csvs.find(e=>e.path===p.csv):csvs[0];
    if(p.csv && !csv)throw Error('Missing project CSV: '+p.csv);
    if(csv){
      if(csv.file.size>2_000_000)throw Error('Choose a CSV under 2 MB.');
      Object.assign(next,csvCards(p,layout,await csv.file.text(),next.assets));
    }
    if(!next.cards.length)next.cards=[{id:crypto.randomUUID(),values:{...p.starter.values},copies:1,imageName:'',drawingKey:null,drawingActive:false,crop:{x:.5,y:.5,zoom:1}}];
    if(next.cards.some(c=>!c.id || c.id.length>200 || /[\\/:\u0000-\u001f]/.test(c.id)) || new Set(next.cards.map(c=>c.id)).size!==next.cards.length)throw Error('Card IDs must be unique.');
    if(p.workspace){
      const path=normalizeProjectPath(p.workspace),file=resolved.files.get(path);if(!file || file.size>2_000_000)throw Error('Missing or oversized workspace settings.');
      const workspace=JSON.parse(await file.text());
      await restoreWorkspace(next,workspace,layout,async path=>resolved.files.get(path),async path=>next.assets[path]);
    }
    if(p.expansion)for(const c of next.cards)c.expansion ||= p.name;
    return {files,project:p,state:next,images};
  }finally{resolved?.dispose();}
}
async function importLocalFiles(entries){
  const status=$('#local-project-status');status.textContent='Checking project files…';
  try{
    const bundle=await prepareLocalProject(entries),id=await storeLocalProject({files:bundle.files,state:bundle.state,images:bundle.images});
    status.textContent=`Opened ${bundle.project.name}: ${bundle.state.cards.length} cards. Files saved in this browser.`;
    const target=new URL(location.href);target.search='';target.hash='';target.searchParams.set('local',id);location.assign(target.href);
  }catch(err){status.textContent='Project was not imported. '+err.message;if(err.code==='PROJECT_CONSTRAINT')delete err.code;throw err;}
}
$('#project-folder').onchange=e=>{if($('#open-project-dialog').open)$('#open-project-dialog').close();const entries=folderFiles(e.target.files);e.target.value='';if(entries.length)run(()=>importLocalFiles(entries));};
async function start(){
  const localId=new URLSearchParams(location.search).get('local');
  if(localId && !/^[a-f0-9-]{36}$/.test(localId))throw Error('Invalid local project link.');
  activeProjectId=localId?'local-'+localId:projectId(location.search);
  if(activeProjectId)KEY+=':project:'+activeProjectId;
  loadingStatus('Opening your workspace…');
  await openAssets();
  const r=await fetch('templates/catalog.json');if(!r.ok)throw Error('Cannot load the template list. Serve the static-app folder with a static web server.');catalog=await r.json();
  if(activeProjectId){
    loadingStatus('Opening project and templates…');
    if(localId){localBundle=await getLocalProject(localId);if(!localBundle)throw Error('This local project is not in this browser. Import its folder, ZIP, or editable backup on this device.');project=(await resolveLocalProject(localBundle.files,catalog)).project;}
    else project=await loadProject(activeProjectId,catalog);
    catalog=project.templates;schemes=project.schemes;
    for(const item of catalog){const response=await (localId?fetch(item.url):fetchProjectFile(item.url));if(!response.ok)throw Error('Cannot load project template '+item.title);item.source=readTemplate(await response.text()).source;}
    if(project.cardBack?.svg){const response=await (localId?fetch(project.cardBack.templateUrl):fetchProjectFile(project.cardBack.templateUrl));if(!response.ok)throw Error('Cannot load the editable card-back template.');backTemplate=readTemplate(await response.text());project.cardBack.layout=backTemplate;state.backTemplateSVG=backTemplate.source;}
    validateRuleTemplates(project.colorRules,catalog.map(t=>readTemplate(t.source)));
    state.cards=[blankCard()];
    setupProject();
    if(localBundle)$('#local-project-status').textContent='Local project saved in this browser. Save your project to move it to another device; its URL works only here.';
  }
  let saved;try{saved=localStorage.getItem(KEY);}catch{storageError='Browser recovery is unavailable. Save a project file while you work.';}
  if(!saved && localBundle){state=validateState(structuredClone(localBundle.state));for(const [key,data] of Object.entries(localBundle.images))await putAsset(key,data);}
  if(saved){try{state=validateState(JSON.parse(saved));}catch(err){offerRecoveryReset(saved,err);return;}}
  if(!localId && project?.csv){
    const untouched=state.cards.length===1 && (state.cards[0].copies ?? 1)===1 && !state.cards[0].colors && !Object.hasOwn(state,'cardBack') && (!state.colorScheme || state.colorScheme===(project.starter.scheme || schemes[0].name)) && !state.imported && !Object.keys(state.assets).length && !Object.values(state.cards[0].values).some(Boolean) && !state.cards[0].imageName && !state.cards[0].drawingKey;
    if(!saved || (!state.projectDataInitialized && untouched))await loadHostedCards();
    state.projectDataInitialized=true;
  }
  if(saved && project?.id==='field-guide' && state.projectPackageVersion!==project.packageVersion)$('#local-project-status').textContent='Recovered an earlier Field Guide workspace. Use Restore starter examples below to load the updated matching layouts, cards, and artwork. Save your project first to keep your edits.';
  loadingStatus('Preparing your cards…');
  await finishStart(Boolean(saved));
}
async function finishStart(recovered){
  if(state.templateSVG){template=readTemplate(state.templateSVG);updateTemplateSelect();buildColors();$('#template-title').textContent=template.title;}
  else {const item=catalog.find(t=>t.id===project?.starter.template) || catalog[0], response=await fetch(item.url || 'templates/'+item.svg);if(!response.ok)throw Error('Cannot open the first template.');applyTemplate(await response.text(),item.id);}
  if(state.backTemplateSVG){backTemplate=readTemplate(state.backTemplateSVG);activeSide='front';updateSideTools();}
  else if(backTemplate)state.backTemplateSVG=backTemplate.source;
  await openStarter(recovered);
  if(!$('#recovery-error').hidden)return;
  await document.fonts.load('7px "Liberation Sans"');await document.fonts.load('bold 11px "Liberation Sans"');await document.fonts.load('italic 7px "Liberation Sans"');
  await showCard();showCardBack();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
run(async()=>{try{await start();}finally{$('#app-loading').hidden=true;$('main').setAttribute('aria-busy','false');}});
let cardBatch=[],importUndo,invalidCardFiles=0,pendingExpansion=null;
$('#import-cards').onclick=()=>{ $('#import-cards-title').textContent='Import cards'; $('#expansion-names').replaceChildren(...[...new Set(state.cards.map(c=>c.expansion).filter(Boolean))].map(x=>new Option(x,x)));$('#import-cards-dialog').showModal();};
async function reviewCards(files){
 if(files.length>40)throw Error('Choose up to 40 SVG cards at a time.');
 if(files.reduce((n,f)=>n+f.size,0)>640_000_000)throw Error('Keep each batch under 640 MB.');
 pendingExpansion=null;$('#card-import-notice').textContent='';$('#import-cards-title').textContent='Import cards';
 return reviewPayloads(files.map(file=>({name:file.name,load:()=>parseCard(file)})));
}
async function reviewPayloads(entries){
 cardBatch=[];invalidCardFiles=0;$('#card-import-review').replaceChildren();$('#card-import-result').textContent='';
 const known=new Map();for(const c of state.cards){try{known.set(c.id,normalized(await serializeCard(c,state,getAsset)));}catch{known.set(c.id,null);}}
 for(const file of entries){
  const row=document.createElement('div');row.className='card-import-row';const label=document.createElement('p');row.append(label);$('#card-import-review').append(row);
  try{
   const payload=await file.load(),c=payload.card,signature=normalized(payload),prior=known.get(c.id),present=known.has(c.id),status=prior===signature?'Already present':present?'ID conflict':'New card';
   const entry={payload,signature,choice:present?'skip':'add'};cardBatch.push(entry);
   label.textContent=file.name+' · '+cardTitle(c)+' · '+status+(state.cards.some(x=>cardTitle(x)===cardTitle(c))?' · Matching name':'');
   const thumb=document.createElement('div');thumb.className='import-thumbnail';row.append(thumb);const result=renderTemplate(readTemplate(c.layout),c.values,c.colors,c.drawingActive?payload.assets.drawing:payload.assets.image,c.crop,thumb);
   if(result.issues.length)throw Error(result.issues.join(' '));
   const select=document.createElement('select');select.setAttribute('aria-label','Import choice for '+file.name);
   for(const [value,title] of [['skip','Skip'],['add','Add as new'],['replace','Replace existing']])select.add(new Option(title,value));
   if(!present)select.add(new Option('Keep original ID','keep'));entry.choice=present?'skip':'keep';select.value=entry.choice;select.onchange=()=>entry.choice=select.value;row.append(select);
   known.set(c.id,signature);
  }catch(err){invalidCardFiles++;label.textContent=file.name+' · '+err.message;row.classList.add('invalid');const last=cardBatch.at(-1);if(last?.payload?.card && row.querySelector('.import-thumbnail'))cardBatch.pop();}
 }
 $('#confirm-card-import').disabled=!cardBatch.length;
}
for(const id of ['card-svg-files','card-svg-folder'])$('#'+id).onchange=e=>{const files=[...e.target.files];e.target.value='';run(()=>reviewCards(files));};
const drop=$('#card-import-drop');drop.ondragover=e=>{e.preventDefault();};drop.ondrop=e=>{e.preventDefault();run(()=>reviewCards([...e.dataTransfer.files]));};
$('#confirm-card-import').onclick=()=>run(async()=>{
 const next=structuredClone(state),ids=new Set(next.cards.map(c=>c.id));let added=0,replaced=0,skipped=0;
 for(const entry of cardBatch){
  if(entry.choice==='skip'){skipped++;continue;}
  const p=entry.payload,c=structuredClone(p.card),existing=next.cards.find(x=>x.id===c.id);
  if(entry.choice!=='add'&&existing){let signature;try{signature=normalized(await serializeCard(existing,next,getAsset));}catch{signature=null;}if(signature===entry.signature){skipped++;continue;}if(entry.choice!=='replace')throw Error('A batch ID conflict needs Replace existing, Add as new, or Skip.');}
  if(entry.choice==='add'){c.id=uniqueId(ids);}ids.add(c.id);
  c.sourceProjectId=typeof p.sourceProjectId==='string'?p.sourceProjectId:undefined;delete c.values.card_id;delete c.values.image_filename;
  c.imageName='';c.drawingKey=null;
  if(p.assets.image){const key='image-'+crypto.randomUUID(),name='graphics/import-'+c.id+'-'+crypto.randomUUID()+'.'+(/^data:image\/jpeg/.test(p.assets.image)?'jpg':/^data:image\/webp/.test(p.assets.image)?'webp':'png');await putAsset(key,p.assets.image);next.assets[name]=key;c.imageName=name;}
  if(p.assets.drawing){c.drawingKey='drawing-'+crypto.randomUUID();await putAsset(c.drawingKey,p.assets.drawing);}
  const expansion=$('#card-import-expansion').value.trim();c.expansion=expansion;
  insertCard(next.cards,c,entry.choice==='replace');if(existing&&entry.choice==='replace')replaced++;else added++;
 }
 if(pendingExpansion && (added || replaced)){next.expansionPacks={...next.expansionPacks,[pendingExpansion.id]:pendingExpansion};}
 assertCards(next.cards);importUndo=structuredClone(state);state=next;save();await showCard();
 $('#card-import-result').textContent=`${added} added, ${replaced} replaced, ${skipped} skipped, ${invalidCardFiles} invalid files excluded.`;
 cardBatch=[];pendingExpansion=null;$('#card-import-review').querySelectorAll('select').forEach(el=>el.remove());$('#undo-card-import').hidden=false;
});
$('#undo-card-import').onclick=()=>run(async()=>{if(!importUndo)return;state=importUndo;importUndo=null;save();await showCard();$('#undo-card-import').hidden=true;$('#card-import-result').textContent='Last import undone.';});
$('#duplicate-card').onclick=()=>run(async()=>{const copy=structuredClone(card());copy.id=uniqueId(new Set(state.cards.map(c=>c.id)));delete copy.values.card_id;if(copy.drawingKey){const drawing=await getAsset(copy.drawingKey);copy.drawingKey='drawing-'+crypto.randomUUID();await putAsset(copy.drawingKey,drawing);}insertCard(state.cards,copy);state.active=state.cards.length-1;await showCard();});
$('#add-expansion').onclick=()=>$('#add-expansion-dialog').showModal();
async function addExpansionFiles(entries){
  const bundle=await prepareLocalProject(entries,true),p=bundle.project;
  $('#add-expansion-dialog').close();$('#import-cards-dialog').showModal();
  $('#import-cards-title').textContent='Add expansion: '+p.name;
  $('#card-import-expansion').value=p.name;
  const baseId=project?.id || (activeProjectId?.startsWith('local-')?null:activeProjectId);
  const differentBase=baseId!==p.expansion.baseProjectId;
  const differentVersion=project?.packageVersion!==p.expansion.basePackageVersion;
  $('#card-import-notice').textContent=`Designed for ${p.expansion.baseProjectId} ${p.expansion.basePackageVersion}.`+(differentBase || differentVersion?' This differs from the current project or its version; check compatibility before importing.':'');
  pendingExpansion={id:p.id,name:p.name,packageVersion:p.packageVersion,baseProjectId:p.expansion.baseProjectId,basePackageVersion:p.expansion.basePackageVersion};
  await reviewPayloads(bundle.state.cards.map(c=>({name:cardTitle(c),load:async()=>validateCard(await serializeCard(c,bundle.state,async key=>bundle.images[key] || null,p.id))})));
}
for(const id of ['expansion-folder','expansion-zip'])$('#'+id).onchange=e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  run(async()=>{cardBatch=[];pendingExpansion=null;await addExpansionFiles(id==='expansion-zip'?await unzip(files[0]):folderFiles(files));});
};
async function addHostedExpansion(id){
  const response=await fetch('templates/catalog.json');if(!response.ok)throw Error('Cannot load built-in templates.');
  const p=await loadProject(id,await response.json());if(!p.expansion)throw Error('This project is not an expansion pack.');
  const entries=new Map();let total=0;
  async function collect(path){
    path=normalizeProjectPath(path);if(entries.has(path))return entries.get(path);
    const response=await fetchProjectFile(new URL(path,p.base));if(!response.ok)throw Error('Missing expansion file: '+path);
    const file=await response.blob();total+=file.size;if(total>250_000_000 || entries.size>=2000)throw Error('Expansion exceeds project file limits.');entries.set(path,file);return file;
  }
  await collect('manifest.json');
  if(!p.csv)throw Error('Expansion must specify its canonical CSV.');
  const csv=await collect(p.csv);if(csv.size>2_000_000)throw Error('Expansion CSV must be under 2 MB.');
  for(const t of p.templates)if(t.svg && t.url.startsWith(p.base.href))await collect(t.svg);
  for(const f of p.files)await collect(f.path);
  if(p.cardBack?.image)await collect(p.cardBack.image);
  if(p.cardBack?.svg)await collect(p.cardBack.svg);
  const parsed=parseCsv(await csv.text()),imageColumn=localMapping(parsed.headers,readTemplate(await (await fetch(p.templates[0].url)).text())).image_filename;
  for(const name of new Set(parsed.rows.map(row=>(row[imageColumn] || '').trim()).filter(Boolean)))await collect(name.includes('/')?name:(p.imageDirectory || 'graphics')+'/'+name);
  if(p.workspace){
    const file=await collect(p.workspace);if(file.size>2_000_000)throw Error('Oversized expansion settings.');const workspace=JSON.parse(await file.text());
    for(const settings of Object.values(workspace.cards || {}))for(const key of ['layoutFile','drawingFile'])if(settings[key])await collect(settings[key]);
  }
  await addExpansionFiles([...entries].map(([path,file])=>({path,file})));
}
