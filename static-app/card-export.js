import {readTemplate, renderTemplate} from './template.js';
import {resolveCardColors} from './color-rules.js';
import {fontStyles, loadCardBack} from './print.js';
import {zipFiles} from './local-projects.js';
import {imageBackLayout} from './card-transfer.js';

const NS='http://www.w3.org/2000/svg';
const cardName=card=>card.values.common_name || card.values.element_name || Object.values(card.values).find(Boolean) || 'Untitled card';
const filename=name=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'card';

function finishedSVG(root,title,fonts='',metadata=null){
  root.setAttribute('xmlns',NS);root.setAttribute('width','2.5in');root.setAttribute('height','3.5in');root.setAttribute('data-card-app','finished-card');
  let heading=root.querySelector(':scope > title');
  if(!heading){heading=document.createElementNS(NS,'title');root.prepend(heading);}
  heading.textContent=title;
  if(fonts){const style=document.createElementNS(NS,'style');style.textContent=fonts;root.prepend(style);}
  if(metadata){const node=document.createElementNS(NS,'metadata');node.setAttribute('data-card-format',metadata.format);node.textContent=JSON.stringify(metadata);root.prepend(node);}
  return new XMLSerializer().serializeToString(root);
}

// Render a frozen workspace without changing the editor's selected card or side.
export async function exportCardFiles({snapshot,getAsset,mode,project,schemes=[],cardBack=null,onProgress=()=>{},getFrontMetadata=null}){
  if(!['fronts','backs','pairs','common'].includes(mode))throw Error('Choose which card sides to download.');
  const front=readTemplate(snapshot.templateSVG),back=snapshot.backTemplateSVG?readTemplate(snapshot.backTemplateSVG):null;
  const individual=Boolean(back || snapshot.cards.some(c=>c.backLayout));
  if(['pairs','backs'].includes(mode) && !individual && !cardBack)throw Error('This set has no back. Choose Front only or define a card back first.');
  if(mode==='common' && (!cardBack || individual))throw Error('Choose a set with a common card back for this option.');
  if(!snapshot.cards.length)throw Error('Add a card before downloading the set.');
  const fonts=await fontStyles();
  await Promise.all(['normal','bold','italic'].map(style=>document.fonts.load(`${style} 8px "Liberation Sans"`)));
  const common=mode!=='fronts' && !back?await loadCardBack(cardBack):null;
  let commonRoot;
  if(common){
    const root=document.createElementNS(NS,'svg');root.setAttribute('viewBox','0 0 180 252');
    const image=document.createElementNS(NS,'image');
    for(const [key,value] of Object.entries({x:0,y:0,width:180,height:252,preserveAspectRatio:'xMidYMid slice',href:common}))image.setAttribute(key,String(value));
    root.append(image);commonRoot=root;
  }
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:180px;visibility:hidden';document.body.append(host);
  const entries=[];let total=0;
  function add(path,source){
    const file=new File([source],path,{type:'image/svg+xml'});total+=file.size;
    if(total>250_000_000)throw Error('The finished SVG set is over 250 MB. Reduce artwork sizes before downloading.');
    entries.push({path,file});
  }
  async function render(card,index,side){
    const ownBack=side==='back' && Object.hasOwn(card,'backImageName');
    const imageName=ownBack?card.backImageName:card.imageName;
    const drawing=!ownBack && card.drawingActive;
    const image=await getAsset(drawing?card.drawingKey:snapshot.assets[imageName]);
    const layout=side==='back'?(card.backLayout?readTemplate(card.backLayout):back || readTemplate(imageBackLayout())):card.layout?readTemplate(card.layout):front;
    const colors=side==='back' && card.backColors?{...layout.colors,...card.backColors}:resolveCardColors(layout,card,snapshot.colors,project?.colorRules,schemes);
    const crop=ownBack && card.backImageName?(card.backCrop || {x:.5,y:.5,zoom:1}):card.crop;
    const blankBack=side==='back' && !card.backLayout && !back;
    const result=renderTemplate(layout,card.values,colors,blankBack?null:image,crop,host);
    if((drawing || imageName) && !image)result.issues.push(drawing?'The saved drawing is missing.':`Choose the image file “${imageName}”.`);
    if(result.issues.length)throw Error(`Card ${index+1} (“${cardName(card)}”), ${side}: ${result.issues.join(' ')}`);
    let metadata=null;
    if(side==='front' && getFrontMetadata){try{metadata=await getFrontMetadata(card,common);}catch(err){throw Error(`Card ${index+1} (“${cardName(card)}”): ${err.message}`);}}
    return finishedSVG(result.root,`${index+1} — ${cardName(card)} — ${side==='front'?'Front':'Back'}`,fonts,metadata);
  }
  try{
    const digits=Math.max(3,String(snapshot.cards.length).length);
    for(const [index,card] of snapshot.cards.entries()){
      onProgress(index+1,snapshot.cards.length,cardName(card));
      const prefix=String(index+1).padStart(digits,'0')+'-'+filename(cardName(card));
      if(mode!=='backs')add(prefix+'-front.svg',await render(card,index,'front'));
      if(['pairs','backs'].includes(mode))add(prefix+'-back.svg',card.backLayout || back || !commonRoot?await render(card,index,'back'):finishedSVG(commonRoot.cloneNode(true),`${index+1} — ${cardName(card)} — Back`));
      if(index%10===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(mode==='common')add('000-common-back.svg',finishedSVG(commonRoot,'Common card back'));
    return entries;
  }finally{host.remove();}
}
export async function exportCardSet(options){
  const entries=await exportCardFiles(options);
  return {blob:await zipFiles(entries),count:entries.length};
}
