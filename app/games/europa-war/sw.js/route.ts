// The strategy game caches only its public page and immutable Next.js assets.
// No account pages, APIs, third-party content or private responses are stored.
const worker = `
const CACHE='xarmy-europa-offline-v1';
const PAGE='/games/europa-war';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('message',e=>{
  if(e.data?.type!=='EUROPA_CACHE'||!Array.isArray(e.data.assets))return;
  e.waitUntil((async()=>{
    try {
      const assets=[...new Set(e.data.assets)].filter(value=>{try{const u=new URL(value,self.location.origin);return u.origin===self.location.origin&&u.pathname.startsWith('/_next/static/');}catch{return false;}}).slice(0,180);
      if(!assets.some(u=>u.endsWith('.js')))throw new Error('No application bundle');
      const cache=await caches.open(CACHE);
      // Keep the last working HTML until every new asset has been cached.
      await Promise.all(assets.map(async url=>{if(await cache.match(url))return;const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw new Error('Asset download failed');await cache.put(url,response);}));
      const page=await fetch(PAGE,{headers:{Accept:'text/html'},cache:'no-cache'});
      if(!page.ok||!page.headers.get('content-type')?.includes('text/html'))throw new Error('Page download failed');
      await cache.put(PAGE,page);
      e.source?.postMessage({type:'EUROPA_READY'});
    } catch { const cache=await caches.open(CACHE);e.source?.postMessage({type:await cache.match(PAGE)?'EUROPA_READY':'EUROPA_FAILED'}); }
  })());
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);if(url.origin!==self.location.origin)return;
  if(e.request.mode==='navigate'&&(url.pathname===PAGE||url.pathname===PAGE+'/')){
    e.respondWith(fetch(e.request).catch(async()=>{const response=await(await caches.open(CACHE)).match(PAGE);return response||new Response('Çevrimdışı oyun paketi henüz indirilmedi. İlk açılışta internet bağlantısı gerekir.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}));
  } else if(url.pathname.startsWith('/_next/static/')) {
    e.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(e.request);return hit||fetch(e.request);})());
  }
});
`;
export function GET() {
  return new Response(worker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/games/europa-war",
    },
  });
}
