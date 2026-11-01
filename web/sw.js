/* Mijonote : fonctionne hors ligne et affiche les photos stockées sur l'appareil. */
const CACHE="mijonote-v3";
const SHELL=["./","index.html","shim.js","gate.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function blob(id){
  return new Promise((ok,ko)=>{
    const r=indexedDB.open("mijonote",1);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("docs"))d.createObjectStore("docs");if(!d.objectStoreNames.contains("blobs"))d.createObjectStore("blobs")};
    r.onerror=()=>ko(r.error);
    r.onsuccess=()=>{const g=r.result.transaction("blobs").objectStore("blobs").get(id);g.onsuccess=()=>ok(g.result);g.onerror=()=>ko(g.error)};
  });
}
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  const i=u.pathname.indexOf("/_blob/");
  if(u.origin===location.origin&&i>=0){
    const id=decodeURIComponent(u.pathname.slice(i+7));
    e.respondWith(blob(id).then(b=>b?new Response(b,{headers:{"content-type":b.type||"application/octet-stream","cache-control":"no-store"}}):new Response("",{status:404})).catch(()=>new Response("",{status:404})));
    return;
  }
  const cdn=/^(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if(u.origin!==location.origin&&!cdn)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok||r.type==="opaque"){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:u.origin===location.origin}).then(r=>r||(e.request.mode==="navigate"?caches.match("index.html"):Response.error()))));
});
