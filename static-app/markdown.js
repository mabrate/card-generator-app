// Render a deliberately small Markdown subset using DOM nodes; HTML stays text.
function inline(text, host, base, resolveLink) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last=0;
  for (const match of text.matchAll(pattern)) {
    host.append(document.createTextNode(text.slice(last,match.index)));
    const token=match[0]; let node;
    if(token.startsWith('[')) {
      const [,label,path]=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      let url;try{url=new URL(path,base);}catch{}
      const href=resolveLink?resolveLink(path,base):url && ['http:','https:'].includes(url.protocol)?url.href:null;
      if(href) {node=document.createElement('a');node.href=href;node.textContent=label;node.target='_blank';node.rel='noopener noreferrer';}
      else {node=document.createTextNode(label);}
    } else {const marker=token.startsWith('**')?'**':token[0];node=document.createElement(marker==='`'?'code':marker==='**'?'strong':'em');node.textContent=token.slice(marker.length,-marker.length);}
    host.append(node);last=match.index+token.length;
  }
  host.append(document.createTextNode(text.slice(last)));
}
export function renderMarkdown(text, host, base, resolveLink) {
  const fragment=document.createDocumentFragment(),lines=text.replace(/\r/g,'').split('\n');let list=null;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];if(!line.trim()){list=null;continue;}
    if(line.startsWith('```')) {const pre=document.createElement('pre');const block=[];while(++i<lines.length&&!lines[i].startsWith('```'))block.push(lines[i]);pre.textContent=block.join('\n');fragment.append(pre);list=null;continue;}
    if(line.trim()===':::pagebreak'){fragment.append(document.createElement('hr'));list=null;continue;}
    if(line.includes('|') && /^\s*\|?\s*:?-{3}/.test(lines[i+1] || '')) {
      const table=document.createElement('table');let header=true;
      const row=line=>{const tr=document.createElement('tr');for(const cell of line.trim().replace(/^\||\|$/g,'').split('|')){const td=document.createElement(header?'th':'td');inline(cell.trim(),td,base,resolveLink);tr.append(td);}table.append(tr);};
      row(line);header=false;i++;while(i+1<lines.length && lines[i+1].includes('|'))row(lines[++i]);fragment.append(table);list=null;continue;
    }
    const heading=line.match(/^(#{1,6})\s+(.+)$/),item=line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if(item){const tag=item[1]?'ul':'ol';if(!list || list.localName!==tag){list=document.createElement(tag);fragment.append(list);}const li=document.createElement('li');inline(item[2],li,base,resolveLink);list.append(li);continue;}
    list=null;const node=document.createElement(heading?'h'+heading[1].length:'p');inline(heading?heading[2]:line,node,base,resolveLink);fragment.append(node);
  }
  host.replaceChildren(fragment);
}
