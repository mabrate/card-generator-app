import {api,byId as $} from './editor.js';
let sequence=0;
async function show(){const current=++sequence;try{const card=await api('/api/demo/'+encodeURIComponent($('demo-select').value));if(current!==sequence)return;$('demo-card').innerHTML=card.svg;$('demo-summary').textContent=`${card.copies} copies · 2.5 × 3.5 inch card · ${card.valid?'All text fits':card.issues.map(i=>i.message).join(' ')}`;}catch(error){$('demo-error').textContent=error.message;}}
$('demo-select').onchange=show;
try{const cards=await api('/api/demo');$('demo-select').replaceChildren(...cards.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;return o;}));$('demo-select').value='monarch-butterfly';await show();}catch(error){$('demo-error').textContent=error.message;}
