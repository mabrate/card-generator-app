const CACHE = 'classroom-cards-static-first-v17';
const base = new URL('./', self.location.href);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const catalogURL = new URL('templates/catalog.json',base);
  const response = await fetch(catalogURL, {cache:'reload'});
  if (!response.ok) throw Error('Template catalog unavailable.');
  const catalog = await response.json();
  await cache.addAll(['./','index.html','style.css','studio.js','studio.js?v=16','template.js','palettes.js','print.js','links.js','projects.js','local-projects.js','markdown.js','templates/catalog.json',
    'fonts/LiberationSans-Regular.ttf','fonts/LiberationSans-Bold.ttf','fonts/LiberationSans-Italic.ttf',
    ...catalog.flatMap(t=>['templates/'+t.svg,'templates/'+t.svg.replace(/\.svg$/,'.csv')])].map(p=>new URL(p,base)));
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
    catch{const cached=await cache.match(event.request);if(cached)return cached;throw Error('This file has not been saved for offline use.');}
  })());
});
