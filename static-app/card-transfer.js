import {readTemplate} from './template.js';
export const FORMAT='classroom-cards.card';
export function uniqueId(ids){let id;do{id=crypto.randomUUID();}while(ids.has(id));return id;}
export function assertCards(cards){if(cards.length>500 || cards.some(c=>typeof c.id!=='string'||!c.id||c.id.length>200||/[\\/:\u0000-\u001f]/.test(c.id))||new Set(cards.map(c=>c.id)).size!==cards.length)throw Error('Card IDs must be unique; keep up to 500 cards.');}
export function insertCard(cards,c,replace=false){assertCards(cards);const i=cards.findIndex(x=>x.id===c.id);if(i<0 && cards.length>=500)throw Error('Keep up to 500 cards.');assertCards([c]);if(i>=0){if(!replace)throw Error('This card ID is already present.');cards[i]=c;}else cards.push(c);assertCards(cards);}
export async function serializeCard(c,state,getAsset,sourceProjectId){
 const image=c.imageName?await getAsset(state.assets[c.imageName]):null,drawing=c.drawingKey?await getAsset(c.drawingKey):null;
 if(c.imageName&&!image || c.drawingKey&&!drawing)throw Error('A required card asset is missing.');
 return {format:FORMAT,version:1,sourceProjectId:c.sourceProjectId || sourceProjectId || state.projectIdentity || null,card:{id:c.id,values:{...c.values},copies:c.copies??1,colors:{...readTemplate(c.layout||state.templateSVG).colors,...(c.colors||state.colors)},colorScheme:c.colorScheme??state.colorScheme??'',crop:{...c.crop},imageName:c.imageName||'',drawingActive:!!c.drawingActive,expansion:c.expansion||'',attribution:c.attribution||'',layout:readTemplate(c.layout||state.templateSVG).source},assets:{image,drawing}};
}
export function normalized(payload){const {card,assets}=payload;const values=Object.fromEntries(Object.entries(card.values).filter(([,v])=>v!==''));for(const k of ['card_id','image_filename','copies','theme'])delete values[k];const content={...card,values};delete content.id;delete content.imageName;delete content.colorScheme;delete content.expansion;return stable({card:content,assets});}
function stable(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export async function parseCard(file){
 if(file.size>40_000_000)throw Error('Card SVG must be under 40 MB.');
 const text=await file.text();if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('XML entities are unsupported.');
 const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg'||doc.documentElement.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('Invalid SVG XML.');
 const nodes=doc.documentElement.querySelectorAll('metadata[data-card-format="'+FORMAT+'"]');if(nodes.length!==1)throw Error('No editable card metadata. Re-export this card from the updated app.');
 return validateCard(JSON.parse(nodes[0].textContent));
}
export async function validateCard(p){
 if(!p || p.format!==FORMAT||p.version!==1)throw Error('Unsupported card metadata version. Re-export from the updated app.');
 if(!Object.hasOwn(p,'sourceProjectId') || p.sourceProjectId!==null && (typeof p.sourceProjectId!=='string'||p.sourceProjectId.length>2000))throw Error('Invalid source project provenance.');
 const c=p.card;if(!c||!c.values||Array.isArray(c.values)||Object.keys(c.values).length>100||Object.values(c.values).some(v=>typeof v!=='string'||v.length>10000))throw Error('Invalid card fields.');assertCards([c]);
 if(!Number.isInteger(c.copies)||c.copies<1||c.copies>600||!c.crop||![c.crop.x,c.crop.y,c.crop.zoom].every(Number.isFinite)||c.crop.x<0||c.crop.x>1||c.crop.y<0||c.crop.y>1||c.crop.zoom<1||c.crop.zoom>4)throw Error('Invalid copies or image crop.');
 for(const key of ['imageName','colorScheme','expansion','attribution'])if(typeof c[key]!=='string'||c[key].length>2000)throw Error('Invalid '+key+'.');
 if(typeof c.drawingActive!=='boolean')throw Error('Invalid drawing selection.');
 const layout=readTemplate(c.layout);c.layout=layout.source;
 if(!c.colors||Array.isArray(c.colors)||Object.entries(c.colors).some(([k,v])=>!/^[a-z][a-z0-9_-]{0,29}$/.test(k)||!/^#[0-9a-f]{6}$/i.test(v))||Object.keys(layout.colors).some(k=>!c.colors[k]))throw Error('Invalid card colors.');
 if(!p.assets||Array.isArray(p.assets)||!Object.hasOwn(p.assets,'image')||!Object.hasOwn(p.assets,'drawing')||Object.keys(p.assets).some(k=>!['image','drawing'].includes(k)))throw Error('Invalid assets.');
 for(const data of Object.values(p.assets)){if(data===null)continue;if(typeof data!=='string'||data.length>17_000_000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Unsupported or oversized artwork.');const img=new Image();img.src=data;try{await img.decode();}catch{throw Error('Invalid artwork.');}if(img.naturalWidth*img.naturalHeight>25_000_000)throw Error('Artwork exceeds 25 megapixels.');}
 if(c.imageName&&!p.assets.image||c.drawingActive&&!p.assets.drawing)throw Error('Missing required artwork.');
 return p;
}
