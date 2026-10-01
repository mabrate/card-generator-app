import {api, byId, message} from './editor.js';
const open = id => location.assign('/teacher/project?project=' + encodeURIComponent(id));
let projects = [];
async function refresh() {
  projects = await api('/api/projects');
  const host = byId('project-list'); host.replaceChildren();
  if (!projects.length) { host.textContent = 'No projects yet. Create one above.'; return; }
  for (const project of projects) {
    const row = document.createElement('article'); row.className = 'project-row';
    const title = document.createElement('h3'); title.textContent = project.title;
    const summary = document.createElement('div'); summary.append(title);
    const actions = document.createElement('div'); actions.className = 'inline-actions';
    const edit = document.createElement('button'); edit.className = 'button'; edit.textContent = 'Open project'; edit.onclick = () => open(project.id);
    const rename = document.createElement('button'); rename.className = 'button secondary'; rename.textContent = 'Rename'; rename.onclick = () => run(async () => {
      const name = prompt('New name for “' + project.title + '”', project.title);
      if (name === null || name.trim() === project.title) return;
      if (!name.trim()) throw new Error('Enter a project name.');
      await api('/api/teacher/projects/' + project.id + '/rename', {body: {title: name.trim(), expected_version: project.version}});
      await refresh(); message('page-status', 'Project renamed.');
    });
    const remove = document.createElement('button'); remove.className = 'button danger'; remove.textContent = 'Delete'; remove.onclick = () => run(async () => {
      if (!confirm('Delete project “' + project.title + '” and ALL its cards? Its student link will stop working. Local files and history are retained; there is no restore button.')) return;
      await api('/api/teacher/projects/' + project.id + '/delete', {body: {expected_version: project.version}});
      await refresh(); message('page-status', 'Project deleted.');
    });
    actions.append(edit, rename, remove); row.append(summary, actions); host.append(row);
  }
}
async function run(task) { message('page-error', ''); try { await task(); } catch (error) { message('page-error', error.message, true); } }
async function start() {
  const presets = await api('/api/teacher/layout/presets');
  byId('new-project-style').replaceChildren(...presets.map(p => new Option(p.title, p.id)));
  byId('create-project').onclick = () => run(async () => {
    const title = byId('new-project-title').value.trim();
    if (!title) throw new Error('Enter a project name.');
    const template = presets.find(p => p.id === byId('new-project-style').value).template;
    const project = await api('/api/teacher/layout/new', {body: {title, expected_version: 0, template}});
    open(project.id);
  });
  byId('logout').onclick = () => run(async () => { await api('/api/teacher/logout', {body: {}}); location.assign('/teacher/login'); });
  await refresh();
}
start().catch(error => message('page-error', error.message, true));
