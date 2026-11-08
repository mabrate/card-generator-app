// Project authoring operates on a copy; closing this dialog never changes the studio.
export function openProjectDashboard({project,catalog,schemes,fields,templateId,cardCount,onDownload,onOpen}) {
  const dialog=document.createElement('dialog');dialog.id='project-dashboard';dialog.setAttribute('aria-labelledby','pd-title');
  dialog.innerHTML=`<form id="pd-form">
    <header class="pd-heading"><div><p class="pd-eyebrow">PROJECT SETUP</p><h2 id="pd-title">Project dashboard</h2></div><button id="pd-close" type="button" class="button secondary">Close</button></header>
    <p class="hint">Prepare a project copy with your current cards, artwork, and layouts. Settings here apply to the copy.</p>
    <p id="pd-summary" class="pd-summary"></p>
    <fieldset><legend>Project details</legend><div class="pd-grid">
      <label>Project name<input id="pd-name" required maxlength="200" autocomplete="off"></label>
      <label>Project ID<input id="pd-id" required pattern="[a-z0-9](?:[a-z0-9]|_|-){0,79}" maxlength="80" autocomplete="off" aria-describedby="pd-id-help"></label>
      <p id="pd-id-help" class="hint pd-wide">Use lowercase letters, numbers, hyphens, or underscores for the project folder and link.</p>
      <label>Version<input id="pd-version" required pattern="[0-9]+[.][0-9]+[.][0-9]+" placeholder="1.0.0" autocomplete="off"></label>
      <label class="pd-wide">Description<textarea id="pd-description" rows="2" maxlength="4000"></textarea></label>
    </div></fieldset>
    <fieldset><legend>Templates and starter settings</legend><div class="pd-grid">
      <label class="pd-wide">Template editing<select id="pd-access"><option value="url">Only with the template editing link</option><option value="false">Disabled for everyone</option><option value="true">Enabled for everyone</option></select></label>
      <p class="hint pd-wide">The special link prevents casual changes. Anyone who knows its URL parameter can use it.</p>
      <label>Starter front template<select id="pd-template"></select></label>
      <label>Starter color scheme<select id="pd-scheme"></select></label>
    </div><p class="hint">Starter settings and field defaults apply to new cards. Existing card data and colors are kept.</p></fieldset>
    <details id="pd-fields"><summary>Field defaults and hints</summary><p class="hint">Defaults become text on new cards. Hints appear in empty inputs.</p><div id="pd-field-list"></div></details>
    <section class="pd-links" aria-labelledby="pd-links-title"><h3 id="pd-links-title">Sharing links</h3><p class="hint" id="pd-publish-note"></p>
      <label>Student link<input id="pd-student-link" type="url" readonly></label>
      <label id="pd-editor-link-row">Template editing link<input id="pd-editor-link" type="url" readonly></label>
      <p id="pd-link-note" class="hint"></p>
    </section>
    <p id="pd-error" class="error" role="alert"></p><p id="pd-status" role="status" aria-live="polite"></p>
    <footer class="pd-actions"><button id="pd-download" class="button" type="submit">Download project ZIP</button><button id="pd-open" class="button secondary" type="button">Open project copy</button></footer>
  </form>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),form=$('#pd-form');
  $('#pd-name').value=project?.name || 'My classroom project';
  $('#pd-id').value=project?.id || 'my-project';
  $('#pd-version').value=project?.packageVersion || '1.0.0';
  $('#pd-description').value=project?.description || '';
  $('#pd-access').value=String(project?project.editableTemplates ?? false:'url');
  $('#pd-template').replaceChildren(...catalog.map(t=>new Option(t.title,t.id)));
  $('#pd-template').value=project?.starter.template || templateId;
  $('#pd-scheme').replaceChildren(...schemes.map(s=>new Option(s.name,s.name)));
  $('#pd-scheme').value=project?.starter.scheme || schemes[0].name;
  $('#pd-summary').textContent=`${cardCount} card${cardCount===1?'':'s'} · ${catalog.length} front template${catalog.length===1?'':'s'} · ${project?.cardBack?.svg?'Front and back fields':project?.cardBack?.image?'Shared image back':'Current card-back settings kept'}`;
  const defaults=new Map(),hints=new Map();
  for(const field of fields){
    const row=document.createElement('div');row.className='pd-field';
    const title=document.createElement('h4');title.textContent=field.label;
    const key=document.createElement('span');key.className='hint';key.textContent=field.key;title.append(key);
    const inputs=[['Default text',project?.starter.values?.[field.key],defaults],['Input hint',project?.placeholders?.[field.key],hints]];
    row.append(title);
    for(const [caption,value,map] of inputs){const label=document.createElement('label');label.textContent=caption;const input=document.createElement('input');input.value=value || '';input.setAttribute('aria-label',caption+' for '+field.label);input.dataset.field=field.key;input.dataset.setting=map===defaults?'default':'hint';label.append(input);row.append(label);map.set(field.key,input);}
    $('#pd-field-list').append(row);
  }
  function links(){
    const id=$('#pd-id').value.trim(),student=new URL(location.href);student.search='';student.hash='';student.searchParams.set('project',id);
    const editor=new URL(student);editor.searchParams.set('editTemplates','1');
    $('#pd-student-link').value=student.href;$('#pd-editor-link').value=editor.href;
    const access=$('#pd-access').value;$('#pd-editor-link-row').hidden=access!=='url';
    $('#pd-link-note').textContent=access==='url'?'Share the student link with the class. Keep the template editing link for authoring.':access==='true'?'Template editing is enabled on the student link.':'Template editing is disabled on every link.';
    $('#pd-publish-note').textContent=`After publishing the ZIP contents in projects/${id || '<project-id>'}/ on this site, use these links. Local project copies work only in this browser; share the ZIP to move them to another device.`;
  }
  $('#pd-id').oninput=links;$('#pd-access').onchange=links;links();
  for(const id of ['pd-student-link','pd-editor-link'])$('#'+id).onclick=e=>e.target.select();
  function settings(){
    const values={...project?.starter.values},placeholders={...project?.placeholders};
    for(const [key,input] of defaults)if(input.value)values[key]=input.value;else delete values[key];
    for(const [key,input] of hints)if(input.value)placeholders[key]=input.value;else delete placeholders[key];
    const access=$('#pd-access').value;
    return {name:$('#pd-name').value.trim(),id:$('#pd-id').value.trim(),packageVersion:$('#pd-version').value.trim(),description:$('#pd-description').value.trim(),editableTemplates:access==='url'?'url':access==='true',starter:{...project?.starter,template:$('#pd-template').value,scheme:$('#pd-scheme').value,values},placeholders};
  }
  let working=false;
  async function submit(open){
    if(working || !form.reportValidity())return;
    working=true;$('#pd-error').textContent='';$('#pd-status').textContent='Preparing project copy…';
    for(const control of dialog.querySelectorAll('button,input,select,textarea'))control.disabled=true;
    try{await (open?onOpen:onDownload)(settings());$('#pd-status').textContent=open?'Opening the new local project…':'Project ZIP downloaded. Your current workspace is unchanged.';}
    catch(err){$('#pd-error').textContent=err.message || String(err);$('#pd-status').textContent='';}
    finally{working=false;for(const control of dialog.querySelectorAll('button,input,select,textarea'))control.disabled=false;}
  }
  form.onsubmit=e=>{e.preventDefault();submit(false);};$('#pd-open').onclick=()=>submit(true);
  $('#pd-close').onclick=()=>dialog.close();dialog.oncancel=e=>{if(working)e.preventDefault();};dialog.onclose=()=>dialog.remove();dialog.showModal();
}
