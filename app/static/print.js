import {api, byId, message} from './editor.js';

let cards = [], project, selected = new Set(), busy = false, checked = false, revision = 0;
const visible = () => cards.filter(card => !byId('print-class').value || card.class_name === byId('print-class').value);
function body() {
  return {project_id: project.id, project_version: project.version,
    cards: cards.filter(card => selected.has(card.id)).map(({id, version}) => ({id, version})),
    black_and_white: byId('black-and-white').checked, expand_copies: byId('expand-copies').checked, include_imported: byId('include-imported').checked};
}
function controls() {
  const picked = cards.filter(card => selected.has(card.id));
  const copies = picked.reduce((sum, card) => sum + (byId('expand-copies').checked ? card.copies : 1), 0);
  const withinLimit = picked.length > 0 && picked.length <= 200 && copies <= 600;
  byId('selection-summary').textContent = `${visible().length} cards shown · ${picked.length} selected · ${copies} printable copies · ${Math.ceil(copies / 6)} sheets`;
  byId('check-print').disabled = busy || !withinLimit;
  byId('download-print').disabled = busy || !checked || !withinLimit;
  for (const id of ['print-project', 'print-class', 'black-and-white', 'expand-copies', 'include-imported', 'select-visible', 'clear-selection', 'reload-print']) byId(id).disabled = busy;
  byId('print-cards').querySelectorAll('input').forEach(input => { input.disabled = busy; });
}
function invalidate() {
  checked = false;
  message('print-status', ''); message('page-error', '');
  byId('print-issues').replaceChildren(); byId('print-warnings').replaceChildren(); controls();
}
function draw() {
  byId('print-cards').replaceChildren();
  for (const card of visible()) {
    const row = document.createElement('tr'), cell = document.createElement('td'), input = document.createElement('input');
    input.type = 'checkbox'; input.checked = selected.has(card.id); input.setAttribute('aria-label', `Print ${card.title}`);
    input.addEventListener('change', () => { input.checked ? selected.add(card.id) : selected.delete(card.id); invalidate(); });
    cell.append(input); row.append(cell);
    for (const text of [card.title, card.student_name || '—', card.class_name || '—', card.status, byId('expand-copies').checked ? card.copies : 1]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    byId('print-cards').append(row);
  }
  controls();
}
async function load() {
  selected.clear(); checked = false; cards = []; project = undefined;
  invalidate(); draw();
  const token = ++revision;
  const params = new URLSearchParams({project_id: byId('print-project').value, include_imported: byId('include-imported').checked});
  const result = await api('/api/teacher/print/cards?' + params);
  if (token !== revision) return;
  project = result.project; cards = result.cards;
  const oldClass = byId('print-class').value;
  byId('print-class').replaceChildren(new Option('All classes', ''));
  result.classes.forEach(name => byId('print-class').add(new Option(name, name)));
  if (result.classes.includes(oldClass)) byId('print-class').value = oldClass;
  invalidate(); draw();
}
async function guard(task) {
  if (busy) return;
  busy = true; controls(); message('page-error', '');
  try { await task(); }
  catch (error) { checked = false; message('page-error', error.message, true); }
  finally { busy = false; controls(); }
}
function details(id, items) {
  byId(id).replaceChildren();
  for (const item of items) { const li = document.createElement('li'); li.textContent = `${item.title}: ${item.message}`; byId(id).append(li); }
}
async function check() {
  message('print-status', 'Checking text, corners, images, and saved versions…');
  const result = await api('/api/teacher/print/preview', {body: body()});
  checked = result.valid;
  details('print-issues', result.issues); details('print-warnings', result.warnings);
  message('print-status', result.valid ? `${result.records} records · ${result.copies} cards · ${result.pages} Letter sheets. Ready to download${result.warnings.length ? ' — review the warnings below' : ''}.` : 'Fix the listed cards/layout before exporting. Text is never shortened or shrunk.');
}
async function download() {
  message('print-status', 'Building the vector PDF…');
  const response = await fetch('/api/teacher/print/pdf', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Card-App': '1'}, body: JSON.stringify(body())});
  if (!response.ok) {
    const {detail} = await response.json();
    details('print-issues', detail?.issues || []);
    throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Export failed. Reload cards and check again.');
  }
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
  link.href = url; link.download = 'card-print-sheets.pdf'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  message('print-status', 'PDF downloaded. Print at Actual Size / 100% and measure a test card first.');
}
async function start() {
  const projects = await api('/api/projects');
  if (!projects.length) throw new Error('No projects are available. Create a project in Teacher review or Layout & CSV studio.');
  projects.forEach(p => byId('print-project').add(new Option(p.title, p.id)));
  const requested = new URLSearchParams(location.search).get('project');
  if (projects.some(p => p.id === requested)) byId('print-project').value = requested;
  await load();
  for (const id of ['print-project', 'include-imported', 'reload-print']) byId(id).addEventListener(id === 'reload-print' ? 'click' : 'change', () => guard(load));
  byId('print-class').addEventListener('change', draw);
  byId('black-and-white').addEventListener('change', invalidate);
  byId('expand-copies').addEventListener('change', () => { invalidate(); draw(); });
  byId('select-visible').addEventListener('click', () => { visible().forEach(card => selected.add(card.id)); invalidate(); draw(); });
  byId('clear-selection').addEventListener('click', () => { selected.clear(); invalidate(); draw(); });
  byId('check-print').addEventListener('click', () => guard(check));
  byId('download-print').addEventListener('click', () => guard(download));
}
start().catch(error => message('page-error', error.message, true));

