import {renderMarkdown} from './markdown.js';
const references=new Map([
  ['README.md','App guide'],
  ['PROJECTS.md','Project format'],
  ['TEMPLATES.md','SVG templates'],
  ['projects/houston-food-web/README.md','Houston project'],
  ['projects/houston-food-web/campus-food-web-turn-guide.md','Game rules'],
  ['projects/houston-food-web/card-design-guide.md','Card design guide'],
  ['projects/houston-food-web-expansion/README.md','Expansion guide'],
  ['projects/houston-food-web/card-back-artwork.md','Card-back notes'],
]);
const status=document.querySelector('#reference-status'),content=document.querySelector('#reference-content');
async function openReference(){
  const path=new URLSearchParams(location.search).get('doc');
  if(!references.has(path))throw Error('Choose a reference link from the card editor footer.');
  const base=new URL('./',location.href),source=new URL(path,base),response=await fetch(source);
  if(!response.ok)throw Error('This reference could not be opened. Reconnect and try again.');
  document.title=references.get(path)+' · Classroom Cards';
  renderMarkdown(await response.text(),content,source.href,(path,documentBase)=>{
    let url;try{url=new URL(path,documentBase);}catch{return null;}
    if(!['http:','https:'].includes(url.protocol))return null;
    if(url.href.startsWith(base.href)){
      const relative=decodeURIComponent(url.pathname.slice(base.pathname.length));
      if(references.has(relative)){const target=new URL('reference.html',base);target.searchParams.set('doc',relative);target.hash=url.hash;return target.href;}
    }
    return url.href;
  });
  const download=document.querySelector('#reference-source');download.href=source.href;download.download=path.split('/').pop();download.hidden=false;
  status.hidden=true;
}
openReference().catch(error=>{status.textContent=error.message;content.hidden=true;});
