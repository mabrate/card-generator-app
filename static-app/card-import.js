import {parseCard,validateCard,imageBackLayout} from './card-transfer.js';
import {readTemplate} from './template.js';
import {unzip} from './local-projects.js';

const NS='http://www.w3.org/2000/svg';
function unprefixed(node){
 if(node.nodeType!==1)return node.cloneNode(true);
 const copy=document.createElementNS(node.namespaceURI,node.namespaceURI===NS?node.localName:node.nodeName);
 for(const attr of node.attributes){
  if(attr.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;
  if(attr.namespaceURI && attr.localName!=='href')continue;
  copy.setAttribute(attr.localName,attr.value);
 }
 for(const child of node.childNodes)copy.append(unprefixed(child));
 return copy;
}

// Earlier downloads put editable data only in the front. Recover the paired
// back through the template sanitizer, never by mounting the uploaded SVG.
async function attachLegacyBack(payload,file){
 if(file.size>40_000_000)throw Error('Card SVG must be under 40 MB.');
 const source=await file.text();if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('XML entities are unsupported.');
 const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement;
 if(doc.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!==NS||root.getAttribute('data-card-app')!=='finished-card')throw Error('The matching back is not a downloaded card SVG.');
 root.removeAttribute('data-card-app');root.querySelectorAll('style,metadata').forEach(n=>n.remove());
 const artwork=root.querySelector('image[data-card-artwork]'),frame=root.querySelector('rect[data-image]');
 let image=null,crop={x:.5,y:.5,zoom:1},layout;
 if(frame){
  if(artwork){
   image=artwork.getAttribute('href');
   const w=Number(frame.getAttribute('width')),h=Number(frame.getAttribute('height')),zoom=Number(artwork.getAttribute('width'))/w;
   const dx=w*zoom-w,dy=h*zoom-h;
   crop={x:Math.abs(dx)<1e-8?.5:(Number(frame.getAttribute('x'))-Number(artwork.getAttribute('x')))/dx,y:Math.abs(dy)<1e-8?.5:(Number(frame.getAttribute('y'))-Number(artwork.getAttribute('y')))/dy,zoom};
   // Rounding in finished SVG coordinates must not move a valid edge outside 0–1.
   for(const key of ['x','y'])if(crop[key]>-1e-8&&crop[key]<1+1e-8)crop[key]=Math.max(0,Math.min(1,crop[key]));
   const group=artwork.parentElement?.parentElement;
   if(group?.localName!=='g'||!group.querySelector('clipPath'))throw Error('Cannot recover the back graphic positioning.');
   group.remove();
  }
  layout=readTemplate(new XMLSerializer().serializeToString(unprefixed(root)));
 }else{
  const images=root.querySelectorAll('image');
  if(images.length!==1||root.querySelector('text'))throw Error('Cannot recover this back layout. Save and import the editable project instead.');
  image=images[0].getAttribute('href');layout=readTemplate(imageBackLayout());
 }
 Object.assign(payload.card,{backLayout:layout.source,backColors:layout.colors,backImageName:image?'back.png':'',backCrop:crop});
 payload.assets.backImage=image;
 return validateCard(payload);
}

export async function cardImportEntries(files){
 files=Array.from(files).filter(f=>/\.(svg|zip)$/i.test(f.name)&&!(f.webkitRelativePath || f.name).split('/').some(p=>p==='__MACOSX'||p.startsWith('._')));
 if(!files.length)throw Error('Choose card ZIPs or SVG files, or a folder containing them.');
 if(files.length>120)throw Error('Choose up to 40 cards with their matching backs at a time.');
 if(files.reduce((n,f)=>n+f.size,0)>640_000_000)throw Error('Keep each batch under 640 MB.');
 const groups=[[]],entries=[];let total=0;
 for(const file of files){
  if(/\.zip$/i.test(file.name)){
   let extracted;
   try{extracted=await unzip(file);}
   catch(err){entries.push({name:file.name,load:()=>{throw err;}});continue;}
   total+=extracted.reduce((n,e)=>n+e.file.size,0);
   if(total>640_000_000)throw Error('Keep unpacked cards under 640 MB per batch.');
   const svg=extracted.filter(e=>/\.svg$/i.test(e.path)&&!e.path.split('/').some(p=>p==='__MACOSX'||p.startsWith('._')));
   if(!svg.length){entries.push({name:file.name,load:()=>{throw Error('No card SVG files in this ZIP.');}});continue;}
   groups.push(svg.map(e=>({...e,name:file.name+' / '+e.path})));
  }else{
   total+=file.size;if(total>640_000_000)throw Error('Keep unpacked cards under 640 MB per batch.');
   groups[0].push({path:file.webkitRelativePath || file.name,file,name:file.webkitRelativePath || file.name});
  }
 }
 for(const group of groups){
  const svg=group.filter(e=>/\.svg$/i.test(e.path)&&!e.path.split('/').some(p=>p==='__MACOSX'||p.startsWith('._')));
  const paths=new Map(),used=new Set();
  for(const e of svg){const key=e.path.toLowerCase();if(!paths.has(key))paths.set(key,[]);paths.get(key).push(e);}
  for(const e of svg){
   if(/(^|[-_ ])back\.svg$/i.test(e.path.split('/').pop()))continue;
   const backPath=e.path.replace(/(^|[\/_ -])front\.svg$/i,'$1back.svg');
   let matches=backPath!==e.path?paths.get(backPath.toLowerCase()) || []:[];
   if(!matches.length)matches=paths.get(e.path.slice(0,e.path.lastIndexOf('/')+1).toLowerCase()+'000-common-back.svg') || [];
   matches.forEach(b=>used.add(b));
   entries.push({name:e.name+(matches.length?' + back':''),load:async()=>{
    if(paths.get(e.path.toLowerCase()).length>1||matches.length>1)throw Error('Ambiguous front/back filenames. Keep each student’s card in its own ZIP or folder.');
    const payload=await parseCard(e.file);
    if(matches.length && !payload.card.backLayout)return attachLegacyBack(payload,matches[0].file);
    return payload;
   }});
  }
  for(const e of svg)if(/(^|[-_ ])back\.svg$/i.test(e.path.split('/').pop())&&!used.has(e))entries.push({name:e.name,load:()=>{throw Error('Back SVG needs its matching -front.svg. Choose both files or the original card ZIP.');}});
 }
 if(entries.length>40)throw Error('Choose up to 40 cards with their matching backs at a time.');
 return entries;
}
