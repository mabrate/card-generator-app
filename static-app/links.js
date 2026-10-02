// Fragment parameters keep starter content out of requests to the static host.
const LIMIT=64000;
const object=value=>value && typeof value==='object' && !Array.isArray(value);
export function starterLink(templateId, svg, colors, scheme, fields){
  const url=new URL(location.href);
  const payload={v:1,template:templateId,colors,scheme:scheme || '',fields};
  if(svg)payload.svg=svg;
  url.hash=new URLSearchParams({card:JSON.stringify(payload)}).toString();
  if(url.href.length>LIMIT)throw Error('This starter link is too large. Use a built-in template or shorten the field values, then try again.');
  return url.href;
}
export function readStarter(){
  const params=new URLSearchParams(location.hash.slice(1));
  if(!params.has('card'))return null;
  const raw=params.get('card');
  if(raw.length>LIMIT)throw Error('This starter link is too large. Ask for a shorter link.');
  let value;try{value=JSON.parse(raw);}catch{throw Error('This starter link is damaged. Ask for a new link.');}
  if(!object(value)||value.v!==1||typeof value.template!=='string'||!object(value.fields)||!object(value.colors)||
    Object.values(value.fields).some(v=>typeof v!=='string')||Object.values(value.colors).some(v=>typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))||
    (value.svg!==undefined&&typeof value.svg!=='string')||(value.scheme!==undefined&&typeof value.scheme!=='string'))
    throw Error('This starter link contains unsupported defaults. Ask for a new link.');
  return value;
}
export function consumeStarter(){
  const url=new URL(location.href),params=new URLSearchParams(url.hash.slice(1));
  params.delete('card');url.hash=params.toString();
  history.replaceState(history.state,'',url.href);
}
