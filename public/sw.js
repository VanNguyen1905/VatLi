// Cache only public static assets. Auth/API/Firestore responses never enter this cache.
const CACHE_NAME='virtual-lab-cache-intro-20261107';
const SHELL=['/index.html','/manifest.json','/utt-v5/utt-icon.webp'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('virtual-lab-cache-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const isLab=url.pathname.startsWith('/labvirt/')||url.pathname.startsWith('/utt-module-one/')||url.pathname.startsWith('/utt-lab-3d/');
  const isShell=['/','/index.html','/roadmap','/lab-experiments','/my-practice','/lab-reports','/login','/settings'].includes(url.pathname)||url.pathname==='/admin/lab';
  if(request.mode==='navigate'){
    // An offline iframe must never receive the React shell instead of its own HTML.
    event.respondWith(fetch(request).then(response=>{
      // These routes return the same public build HTML, never an Auth/API page.
      if(isShell&&response.ok&&response.type==='basic'&&/text\/html/i.test(response.headers.get('Content-Type')||'')){
        const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put('/index.html',copy)));
      }
      return response;
    }).catch(async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=isLab?await cache.match(request):isShell?await cache.match('/index.html'):null;
      return cached||new Response('Mất mạng. Hãy kết nối lại để tải phòng thí nghiệm.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }));return;
  }
  // Unhashed runtime scripts and knowledge JSON always revalidate through Hosting.
  const immutable=/^\/assets\/[^/]+-[\w-]+\.(js|css|woff2?)$/.test(url.pathname);
  if(!immutable&&!SHELL.includes(url.pathname))return;
  const validType=response=>{
    const type=response.headers.get('Content-Type')||'';
    if(immutable&&/text\/html/i.test(type))return false;
    if(url.pathname.endsWith('.js'))return /javascript/i.test(type);
    if(url.pathname.endsWith('.css'))return /text\/css/i.test(type);
    if(url.pathname.endsWith('.json'))return /json/i.test(type);
    if(url.pathname.endsWith('.webp'))return /^image\//i.test(type);
    return true;
  };
  event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
    const cached=await cache.match(request);
    if(cached&&validType(cached))return cached;
    if(cached)await cache.delete(request);
    const response=await fetch(request);
    // A Hosting SPA rewrite may return HTML/200 for an obsolete bundle URL.
    // Do not preserve that response as an immutable JavaScript/CSS asset.
    if(response.ok&&response.type==='basic'&&validType(response))event.waitUntil(cache.put(request,response.clone()));
    return response;
  }));
});
