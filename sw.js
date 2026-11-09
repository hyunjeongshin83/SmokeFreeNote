/* 금연노트 서비스워커 — 오프라인에서도 열리도록 캐시 */
const CACHE="smokefree-v24";
const ASSETS=["index.html","manifest.webmanifest","icon-192.png","icon-512.png","icon-512-maskable.png","apple-touch-icon.png","favicon-32.png","vendor/qrcodejs-1.0.0.min.js","research-config.js","research.js"];

const own=(req)=>caches.open(CACHE).then(c=>c.match(req));   // 같은 주소의 다른 앱 캐시는 읽지 않는다
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).then(()=>c.add("pro/index.html").catch(()=>{}))).then(()=>self.skipWaiting())  /* 상담자 화면은 안드로이드 앱 묶음에 없어서 못 받아도 설치는 계속 */);});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("smokefree-")&&x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});

self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const u=new URL(req.url);
  if(u.origin!==self.location.origin){ e.respondWith(fetch(req).catch(()=>own(req))); return; } // 글꼴 등 외부: 네트워크 우선
  // HTML: 네트워크 우선(항상 최신), 오프라인 시 캐시
  if(req.mode==="navigate"){
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;}).catch(()=>own(req).then(h=>h||own("index.html"))));
    return;
  }
  // 연구 저장 코드·설정(research.js · research-config.js): **네트워크 우선 + 매번 서버에 최신 여부 확인**, 오프라인일 때만 캐시.
  // 설정은 사실상 비상 차단 스위치(enabled:false)라 캐시 때문에 늦게 퍼지면 안 되고, 코드는 index.html 과 짝이 어긋나면 안 된다 (캐시 우선이면 옛 코드가 새 화면과 섞임).
  if(/\/research(-config)?\.js$/.test(u.pathname)){
    e.respondWith(fetch(req,{cache:"no-cache"}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;}).catch(()=>own(req)));
    return;
  }
  // 그 외 정적 자산: 캐시 우선
  e.respondWith(own(req).then(h=>h||fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;})));
});

// 알림 단추 — 「기록하기」는 기록 탭으로, 그 밖은 닫기만
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  if(e.action==="ok") return;
  const url=(e.notification.data&&e.notification.data.url)||"./index.html?tab=log";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){ if("focus" in c){ c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
