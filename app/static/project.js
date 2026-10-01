import {api, byId} from './editor.js';
const id = new URLSearchParams(location.search).get('project');
const tabs = ['overview', 'layout', 'print'];
let projectUpdated = false;
window.addEventListener('card-app:project-updated', () => { projectUpdated = true; });
function show(name) {
  if (!tabs.includes(name)) name = 'overview';
  if (projectUpdated && name !== 'layout') { history.replaceState(null, '', location.pathname + location.search + '#' + name); location.reload(); return; }
  for (const tab of tabs) {
    byId('tab-' + tab).hidden = tab !== name;
    const button = document.querySelector('[data-tab="' + tab + '"]');
    if (tab === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  history.replaceState(null, '', location.pathname + location.search + '#' + name);
}
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => show(button.dataset.tab);
show(location.hash.slice(1));
if (id) api('/api/project?project_id=' + encodeURIComponent(id)).then(project => {
  byId('project-heading').textContent = project.title;
  document.title = project.title + ' · Classroom Cards';
}).catch(error => { byId('page-error').textContent = error.message; });
else location.replace('/teacher');
