import {renderTemplate} from './template.js';
let fontPromise;
export function fontStyles() {
  return fontPromise ??= Promise.all([['Regular','normal','normal'],['Bold','bold','normal'],['Italic','normal','italic']].map(async([file,weight,style])=>{
    const response=await fetch('fonts/LiberationSans-'+file+'.ttf');
    if(!response.ok)throw Error('Cannot load the bundled print fonts.');
    const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return `@font-face{font-family:'Liberation Sans';font-weight:${weight};font-style:${style};src:url(data:font/ttf;base64,${btoa(binary)})}`;
  })).then(styles=>styles.join('\n')).catch(err=>{fontPromise=null;throw err;});
}

function isolateIds(root, prefix) {
  const nodes=[root,...root.querySelectorAll('*')],ids=new Map();
  for(const el of nodes)if(el.id){const old=el.id;ids.set(old,prefix+old);el.id=prefix+old;}
  for(const el of nodes)for(const attr of [...el.attributes]){
    const value=attr.value.replace(/url\(\s*(['"]?)#([\w.-]+)\1\s*\)/g,(_,quote,id)=>`url(#${ids.get(id)||id})`);
    if(attr.localName==='href'&&value.startsWith('#')&&ids.has(value.slice(1)))attr.value='#'+ids.get(value.slice(1));
    else if(attr.localName!=='id')attr.value=value;
  }
}
function cropMarks(x,y) {
  const paths=[];
  for(const [cx,dx] of [[x,-1],[x+180,1]])for(const [cy,dy] of [[y,-1],[y+252,1]]){
    paths.push(`M${cx+dx*2},${cy}h${dx*6}`,`M${cx},${cy+dy*2}v${dy*6}`);
  }
  return `<path d="${paths.join(' ')}" fill="none" stroke="#444" stroke-width="0.4"/>`;
}
export async function loadCardBack(cardBack) {
  if(!cardBack)return null;
  const response=await fetch(cardBack.url);
  if(!response.ok)throw Error('Cannot load the project card back. Reconnect and try printing again.');
  const blob=await response.blob();
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size>12*1024*1024)throw Error('Use a PNG, JPG, or WebP card back under 12 MB.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Cannot read the card back.'));reader.readAsDataURL(blob);});
  const image=new Image();image.src=data;
  try{await image.decode();}catch{throw Error('The project card back is not a readable image.');}
  if(image.naturalWidth*image.naturalHeight>25_000_000)throw Error('Use a card back smaller than 25 megapixels.');
  return data;
}
export async function printDocument(template, snapshot, getAsset, scope, copies, cardBack=null) {
  const selected=scope==='current'?[[snapshot.active,snapshot.cards[snapshot.active]]]:snapshot.cards.map((card,i)=>[i,card]);
  const count=selected.length*copies;
  if(!Number.isInteger(copies)||copies<1||copies>30)throw Error('Choose 1–30 copies per card.');
  if(count>600)throw Error('Print at most 600 card copies at a time.');
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:180px;visibility:hidden';document.body.append(host);
  const svgs=[];
  try {
    for(const [index,card] of selected){
      const key=card.drawingActive?card.drawingKey:snapshot.assets[card.imageName];
      const image=await getAsset(key);
      const name=card.values.common_name||'Untitled card';
      const missing=(card.drawingActive||card.imageName)&&!image;
      const result=renderTemplate(template,card.values,snapshot.colors,image,card.crop,host);
      if(missing)result.issues.push(card.drawingActive?'The drawing is missing.':`Choose the image file “${card.imageName}”.`);
      if(result.issues.length)throw Error(`Card ${index+1} (“${name}”): ${result.issues.join(' ')}`);
      for(let n=0;n<copies;n++)svgs.push(result.root.cloneNode(true));
    }
  } finally { host.remove(); }
  const backImage=await loadCardBack(cardBack);
  const sheets=[];
  for(let offset=0;offset<svgs.length;offset+=6){
    const cells=svgs.slice(offset,offset+6).map((svg,i)=>{
      const x=108+(i%3)*198,y=45+Math.floor(i/3)*270;
      isolateIds(svg,`print-${offset+i}-`);svg.setAttribute('x',String(x));svg.setAttribute('y',String(y));svg.setAttribute('width','180');svg.setAttribute('height','252');
      return new XMLSerializer().serializeToString(svg)+cropMarks(x,y);
    });
    sheets.push(`<section class="sheet fronts"><svg xmlns="http://www.w3.org/2000/svg" width="11in" height="8.5in" viewBox="0 0 792 612" aria-label="Card print sheet ${sheets.length+1}">${cells.join('')}</svg></section>`);
    if(backImage){
      const backs=svgs.slice(offset,offset+6).map((_,i)=>{
        // Mirror columns around the page center for landscape short-edge duplex.
        const x=792-(108+(i%3)*198)-180,y=45+Math.floor(i/3)*270;
        return `<image x="${x}" y="${y}" width="180" height="252" data-card-back="true" preserveAspectRatio="xMidYMid meet"/>`+cropMarks(x,y);
      });
      sheets.push(`<section class="sheet backs"><svg xmlns="http://www.w3.org/2000/svg" width="11in" height="8.5in" viewBox="0 0 792 612" aria-label="Card backs for sheet ${offset/6+1}">${backs.join('')}</svg></section>`);
    }
  }
  const fonts=await fontStyles();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Classroom Cards · Print sheets</title><style>
${fonts}
@page{size:Letter landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8ece8;font-family:Arial,sans-serif;color:#203d31}.toolbar{padding:20px;max-width:900px;margin:auto}.toolbar h1{font-size:24px;margin:0 0 8px}.toolbar p{line-height:1.5}.toolbar button{padding:12px 18px;background:#1d503b;border:0;border-radius:6px;color:white;font-size:16px;cursor:pointer}.sheet{width:11in;height:8.5in;background:white;margin:20px auto;box-shadow:0 2px 12px #0002}.sheet>svg{display:block;width:11in;height:8.5in;overflow:hidden}@media screen{.sheet{width:min(11in,calc(100% - 24px));height:auto;aspect-ratio:22/17}.sheet>svg{width:100%;height:auto}}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="toolbar"><h1>Card print sheets</h1><p>${count} card${count===1?'':'s'} on ${sheets.length} Letter landscape page${sheets.length===1?'':'s'}. Each card is 2.5 × 3.5 inches. Cut on the square crop marks.</p><p>Choose Letter paper, landscape, 100% / actual size, no margins, and disable headers and footers. Select Save as PDF in the print dialog to keep a PDF. Print one test sheet and check the size with a ruler.</p>${backImage?'<p><strong>Double-sided printing:</strong> pages alternate fronts and backs. Choose duplex / print on both sides and <strong>flip on the short edge</strong>. Blank slots on the last sheet stay blank. Test the first pair of pages before printing the full deck. For manual duplex, print one front/back pair first to check your printer’s feed direction.</p>':''}<button id="print" disabled onclick="window.print()">Preparing fonts…</button><p>Close this tab to return to your editor.</p></div>${sheets.join('')}<script>(()=>{const cardBack=${JSON.stringify(backImage)};for(const image of document.querySelectorAll('[data-card-back]'))image.setAttribute('href',cardBack);Promise.all([document.fonts.ready,...Array.from(document.querySelectorAll('svg image'),node=>{const image=new Image();image.src=node.getAttribute('href');return image.decode();})]).then(()=>{const button=document.getElementById('print');button.disabled=false;button.textContent='Print / Save as PDF';}).catch(()=>{document.getElementById('print').textContent='Images could not load. Reopen print sheets.';});})();</script></body></html>`;
}
