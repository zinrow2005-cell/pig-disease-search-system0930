const CACHE="pig-disease-v24";
const VER="24";
const CORE=[
  "./",
  "./index.html",
  `./styles.css?v=${VER}`,
  `./app.js?v=${VER}`,
  `./data.js?v=${VER}`,
  `./taiwan_data.js?v=${VER}`,
  `./license_data.js?v=${VER}`,
  `./manifest.webmanifest?v=${VER}`,
  "./offline.html",
  "./share.html",
  "./icon-check.html",
  "./favicon.ico",
  "./icons/apple-touch-icon.png",
  "./icons/android-chrome-192x192.png",
  "./icons/android-chrome-512x512.png",
  "./icons/favicon-32x32.png",
  "./icons/favicon-16x16.png",
  "./assets/line-share.jpg"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE && k.startsWith("pig-disease-")).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function isCoreCode(url){
  return /\/(?:app|data|taiwan_data|license_data)\.js$/.test(url.pathname) ||
         /\/styles\.css$/.test(url.pathname) ||
         /\/manifest\.webmanifest$/.test(url.pathname);
}

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(res=>{
        if(res && res.status===200){
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(req,copy));
        }
        return res;
      }).catch(()=>caches.match(req).then(r=>r||caches.match("./index.html").then(x=>x||caches.match("./offline.html"))))
    );
    return;
  }

  if(isCoreCode(url)){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(res=>{
        if(res && res.status===200){
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(req,copy));
        }
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>{
      if(cached)return cached;
      return fetch(req).then(res=>{
        if(res && res.status===200){
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(req,copy));
        }
        return res;
      });
    })
  );
});
