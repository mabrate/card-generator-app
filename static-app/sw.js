const CACHE = 'classroom-cards-static-first-v31';
const base = new URL('./', self.location.href);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const catalogURL = new URL('templates/catalog.json',base);
  const response = await fetch(catalogURL, {cache:'reload'});
  if (!response.ok) throw Error('Template catalog unavailable.');
  const catalog = await response.json();
  await cache.addAll(['./','index.html','reference.html','reference.js','README.md','PROJECTS.md','TEMPLATES.md','projects/houston-food-web/README.md','projects/houston-food-web/campus-food-web-turn-guide.md','projects/houston-food-web/card-design-guide.md','projects/houston-food-web/expansion-pack/README.md','projects/houston-food-web/card-back-artwork.md','style.css','studio.js','studio.js?v=29','template.js','palettes.js','print.js','links.js','projects.js','local-projects.js','markdown.js','templates/catalog.json',
    'fonts/LiberationSans-Regular.ttf','fonts/LiberationSans-Bold.ttf','fonts/LiberationSans-Italic.ttf',
    ...catalog.map(t=>'templates/'+t.svg)].map(p=>new URL(p,base)));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for (const key of await caches.keys()) if (key.startsWith('classroom-cards-static-first-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok)await cache.put(event.request,response.clone());return response;}
    catch{const cached=await cache.match(event.request) || (url.pathname===new URL('reference.html',base).pathname?await cache.match(new URL('reference.html',base)):event.request.mode==='navigate' && [base.pathname,new URL('index.html',base).pathname].includes(url.pathname)?await cache.match(base):null);if(cached)return cached;const projectFiles=await caches.open('classroom-cards-published-projects-v1'),projectFile=await projectFiles.match(event.request);if(projectFile)return projectFile;throw Error('This file has not been saved for offline use.');}
  })());
});
