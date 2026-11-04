/* Mijonote, version installable : remplace window.claude (base de données, photos, IA, téléchargements)
   par des équivalents locaux. Tout reste sur l'appareil ; l'IA passe par la clé Anthropic de la personne. */
(()=>{
"use strict";
window.MJ_PWA=true;
const KEY="mj_aikey";
const getKey=()=>{try{return localStorage.getItem(KEY)||""}catch{return ""}};
window.MJ={hasKey:()=>!!getKey(),setKey:k=>{try{k?localStorage.setItem(KEY,k.trim()):localStorage.removeItem(KEY)}catch{}}};

/* ---------- IndexedDB ---------- */
const idb=new Promise((ok,ko)=>{
  const r=indexedDB.open("mijonote",1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("docs"))d.createObjectStore("docs");if(!d.objectStoreNames.contains("blobs"))d.createObjectStore("blobs")};
  r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);
});
const tx=(store,mode,fn)=>idb.then(d=>new Promise((ok,ko)=>{const t=d.transaction(store,mode);const res=fn(t.objectStore(store));t.oncomplete=()=>ok(res&&"result" in res?res.result:undefined);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error)}));

/* ---------- db : collections / documents ---------- */
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
const rid=n=>{const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",a=crypto.getRandomValues(new Uint8Array(n));return Array.from(a,x=>c[x%62]).join("")};
let cache=null;
const loadAll=()=>cache||(cache=idb.then(d=>new Promise((ok,ko)=>{
  const m=new Map(),t=d.transaction("docs","readonly"),cur=t.objectStore("docs").openCursor();
  cur.onsuccess=()=>{const c=cur.result;if(c){m.set(c.key,c.value);c.continue()}else ok(m)};cur.onerror=()=>ko(cur.error);
})));
const subs=new Map();// coll -> Set(fn) ; "coll/id" -> Set(fn)
const snapColl=(m,coll)=>{const p=coll+"/",docs=[];for(const [k,v] of m)if(k.startsWith(p)&&!k.slice(p.length).includes("/")){const id=k.slice(p.length),d=clone(v);docs.push({id,exists:true,data:()=>clone(d)})}return {docs,size:docs.length,empty:!docs.length}};
const snapDoc=(m,key)=>{const id=key.split("/").pop(),v=m.get(key);return {id,exists:v!==undefined,data:()=>v===undefined?undefined:clone(v)}};
function notify(key){
  const coll=key.slice(0,key.lastIndexOf("/"));
  loadAll().then(m=>{
    for(const fn of subs.get(coll)||[])setTimeout(()=>fn(snapColl(m,coll)));
    for(const fn of subs.get(key)||[])setTimeout(()=>fn(snapDoc(m,key)));
  });
}
async function write(key,val){
  const m=await loadAll();
  if(val===undefined){m.delete(key);await tx("docs","readwrite",s=>s.delete(key))}
  else{val=clone(val);m.set(key,val);await tx("docs","readwrite",s=>s.put(val,key))}
  notify(key);
  if(window.Account)window.Account.push(key,val);
}
function deepMerge(a,b){const o=isObj(a)?{...a}:{};for(const k in b)o[k]=isObj(b[k])&&isObj(o[k])?deepMerge(o[k],b[k]):b[k];return o}
function sub(key,fn,init){let set=subs.get(key);if(!set)subs.set(key,set=new Set());set.add(fn);loadAll().then(m=>{if(set.has(fn))fn(init(m))});return ()=>set.delete(fn)}
function docRef(coll,id){
  id=id||rid(20);const key=coll+"/"+id;
  return {id,path:key,
    get:async()=>snapDoc(await loadAll(),key),
    set:async(d,o)=>{const m=await loadAll();await write(key,o&&o.merge?deepMerge(m.get(key),d):d)},
    update:async d=>{const m=await loadAll();const cur=m.get(key);if(cur===undefined){const e=new Error("Document introuvable");e.code="not_found";throw e}
      const v=clone(cur);for(const [p,x] of Object.entries(d)){const parts=p.split(".");let o=v;for(let i=0;i<parts.length-1;i++){if(!isObj(o[parts[i]]))o[parts[i]]={};o=o[parts[i]]}if(x===undefined)delete o[parts.at(-1)];else o[parts.at(-1)]=x}
      await write(key,v)},
    delete:async()=>write(key,undefined),
    onSnapshot:(fn,err)=>sub(key,fn,m=>snapDoc(m,key)),
    collection:n=>collRef(key+"/"+n)};
}
function collRef(coll){
  return {id:coll.split("/").pop(),path:coll,
    doc:id=>docRef(coll,id),
    add:async d=>{const r=docRef(coll);await r.set(d);return r},
    get:async()=>snapColl(await loadAll(),coll),
    onSnapshot:(fn,err)=>sub(coll,fn,m=>snapColl(m,coll))};
}
const db=Object.freeze({collection:collRef,doc:p=>{const i=p.lastIndexOf("/");return docRef(p.slice(0,i),p.slice(i+1))}});

/* ---------- assets : photos stockées sur l'appareil, servies par le service worker sous _blob/<id> ---------- */
const hex=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,"0")).join("");
const assets=Object.freeze({
  upload:async(blob,o)=>{const id=hex(16),type=(o&&o.type)||blob.type||"application/octet-stream";const b=blob.type===type?blob:new Blob([blob],{type});await tx("blobs","readwrite",s=>s.put(b,id));if(window.Account&&window.Account.user)window.Account.putBlob(id,b).catch(()=>{});return {id,url:"_blob/"+id,sizeBytes:b.size,contentType:type}},
  delete:async id=>{await tx("blobs","readwrite",s=>s.delete(id));if(window.Account&&window.Account.user)window.Account.delBlob(id).catch(()=>{})},
  list:async()=>({assets:[],usage:null})
});

/* ---------- compte : sauvegarde en ligne (recettes, photos, préférences) et récupération sur un autre appareil ---------- */
const LSYNC=["profil","gouts","habits","shopcfg","shopfavs","famwho","livre","auteur","auteurLivre","lang","source","type"];
window.MJ_LSYNC=LSYNC;
let syncing=null;
function syncAccount(){
  const Acc=window.Account;if(!Acc||syncing)return syncing;
  syncing=(async()=>{await Acc.ready;const m=await loadAll();
    await Acc.flush();const remote=await Acc.pullAll();const rmap=new Map(remote.map(r=>[r.key,r.data]));const pend=new Set(Acc.pending());const changed=[];let lsChanged=false;
    const first=Acc.isFirstSync();
    if(first){for(const [k,v] of m)if(!rmap.has(k))Acc.push(k,v);
      for(const k of LSYNC){const v=localStorage.getItem(k);if(v!=null&&!rmap.has("ls/"+k))try{Acc.push("ls/"+k,JSON.parse(v))}catch{}}
      await Acc.flush()}
    else for(const k of [...m.keys()])if(!rmap.has(k)&&!pend.has(k)){m.delete(k);await tx("docs","readwrite",s=>s.delete(k));changed.push(k)}
    for(const [k,v] of rmap){if(pend.has(k))continue;
      if(k.startsWith("ls/")){const n=k.slice(3);if(!LSYNC.includes(n))continue;const cur=localStorage.getItem(n),nv=JSON.stringify(v);if(cur!==nv){try{localStorage.setItem(n,nv)}catch{}lsChanged=true}continue}
      if(JSON.stringify(m.get(k))!==JSON.stringify(v)){m.set(k,v);await tx("docs","readwrite",s=>s.put(v,k));changed.push(k)}}
    Acc.markSynced();changed.forEach(notify);if(lsChanged||changed.length)document.dispatchEvent(new Event("mj-sync"));
    // photos : on envoie celles qui manquent en ligne, on récupère celles qui manquent ici
    const local=await tx("blobs","readonly",s=>s.getAllKeys());const online=new Set(await Acc.listBlobs());
    for(const id of local)if(!online.has(id)){const b=await tx("blobs","readonly",s=>s.get(id));if(b)await Acc.putBlob(id,b).catch(()=>{})}
    const have=new Set(local);for(const id of online)if(!have.has(id)){const b=await Acc.getBlob(id);if(b)await tx("blobs","readwrite",s=>s.put(b,id))}
  })().catch(()=>{}).finally(()=>{syncing=null});
  return syncing;
}
if(window.Account){syncAccount();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncAccount()})}
window.MJ.account=()=>window.Account&&window.Account.user?window.Account.user.email:null;
window.MJ.signOut=()=>window.Account&&window.Account.signOut(async()=>{await tx("docs","readwrite",s=>s.clear());await tx("blobs","readwrite",s=>s.clear());try{for(const k of LSYNC)localStorage.removeItem(k);for(const k of Object.keys(localStorage))if(k.startsWith("acct.mijonote"))localStorage.removeItem(k)}catch{}});

/* ---------- downloads ---------- */
const downloads=Object.freeze({save:async({filename,data})=>{
  const blob=data instanceof Blob?data:new Blob([data]);
  const file=new File([blob],filename,{type:blob.type||"application/octet-stream"});
  if(navigator.canShare&&navigator.canShare({files:[file]})&&/iPhone|iPad|Android/i.test(navigator.userAgent)){
    try{await navigator.share({files:[file],title:filename});return}catch(e){if(e&&e.name==="AbortError"){const x=new Error("Annulé");x.code="declined";throw x}}
  }
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);
}});

/* ---------- IA : Claude avec la clé de la personne ---------- */
const MODELS={quick:"claude-haiku-5-5",default:"claude-sonnet-5-5",complex:"claude-opus-5-5"};
const err=(code,text)=>{const e=new Error(text||code);e.code=code;if(text)e.mjText=text;return e};
function askKey(){
  return new Promise(res=>{
    const w=document.createElement("div");
    w.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(20,12,8,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Figtree,-apple-system,sans-serif";
    w.innerHTML=`<div style="background:#fffaf3;color:#2b1d14;border-radius:18px;max-width:420px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <h3 style="margin:0 0 8px;font:600 1.2rem 'Young Serif',Georgia,serif">Activer la lecture des recettes</h3>
      <p style="margin:0 0 12px;line-height:1.45;font-size:.92rem">Pour lire tes photos et créer les recettes, Mijonote utilise Claude avec ta propre clé Anthropic. Elle reste sur ce téléphone. Compte quelques centimes par lecture.</p>
      <p style="margin:0 0 12px;font-size:.85rem"><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style="color:#b8402c">Créer une clé sur console.anthropic.com</a></p>
      <input type="password" autocomplete="off" placeholder="sk-ant-..." style="width:100%;box-sizing:border-box;padding:.7rem;border:1px solid #d9c6b0;border-radius:10px;font-size:16px;background:#fff">
      <p data-e style="color:#b8402c;font-size:.8rem;min-height:1em;margin:6px 0 0"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button data-c style="padding:.6rem 1rem;border-radius:999px;border:1px solid #d9c6b0;background:transparent;font-size:.95rem">Annuler</button>
        <button data-o style="padding:.6rem 1.1rem;border-radius:999px;border:0;background:#b8402c;color:#fff;font-weight:600;font-size:.95rem">Enregistrer</button>
      </div></div>`;
    document.body.appendChild(w);
    const inp=w.querySelector("input");setTimeout(()=>inp.focus(),50);
    const done=v=>{w.remove();res(v)};
    w.querySelector("[data-c]").onclick=()=>done(false);
    w.querySelector("[data-o]").onclick=()=>{const k=inp.value.trim();if(!/^sk-/.test(k)){w.querySelector("[data-e]").textContent="La clé commence par « sk- ».";return}window.MJ.setKey(k);done(true)};
  });
}
async function imgPart(blob){
  let type=blob.type||"image/jpeg";
  const ok=/^image\/(jpeg|png|webp|gif)$/.test(type);
  let out=blob;
  if(!ok||blob.size>3.5e6){
    try{
      const bmp=await createImageBitmap(blob,{imageOrientation:"from-image"});
      const s=Math.min(1,2400/Math.max(bmp.width,bmp.height));
      const c=document.createElement("canvas");c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
      c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);bmp.close&&bmp.close();
      out=await new Promise(r=>c.toBlob(r,"image/jpeg",.86));type="image/jpeg";
    }catch{if(!ok)throw err("image_rejected")}
  }
  const b64=await new Promise((ok2,ko)=>{const r=new FileReader();r.onload=()=>ok2(String(r.result).split(",")[1]);r.onerror=()=>ko(r.error);r.readAsDataURL(out)});
  return {type:"image",source:{type:"base64",media_type:type,data:b64}};
}
/* Sans clé sur le téléphone : la lecture passe par la fonction « ia » partagée avec Good Food (Supabase),
   qui garde la clé côté serveur (Gemini gratuit). Rien à payer ni à saisir pour la personne. */
const IA={url:"https://vvxkkqcmjrwytagbxdfg.supabase.co/functions/v1/ia",key:"sb_publishable_A-kJQIoJXxdXmjHF8iM40g_RP6myhMo"};
async function jpeg64(blob,max=1568,q=.82){
  // toujours réduite (comme Good Food) : un envoi trop lourd fait tomber le serveur avant qu'il ne réponde
  let out;
  try{const bmp=await createImageBitmap(blob,{imageOrientation:"from-image"});const s=Math.min(1,max/Math.max(bmp.width,bmp.height));
    const c=document.createElement("canvas");c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);bmp.close&&bmp.close();
    out=await new Promise(r=>c.toBlob(r,"image/jpeg",q))}catch{throw err("image_rejected")}
  return await new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(",")[1]);r.onerror=()=>ko(r.error);r.readAsDataURL(out)});
}
async function callServer(input,o){
  const prompt=typeof input==="string"?input:input.map(m=>(m.role==="assistant"?"Ta réponse précédente : ":"")+m.content).join("\n\n");
  if(prompt.length>30000)throw err("prompt_too_large");
  const send=async(max,q)=>{const images=[];for(const b of (o.images||[]).slice(0,6))images.push(await jpeg64(b,max,q));
    return fetch(IA.url,{method:"POST",signal:o.signal,headers:{"content-type":"application/json",apikey:IA.key},body:JSON.stringify({prompt,images,web:false})})};
  let r;
  try{r=await send(1568,.82)}
  catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");
    // deuxième essai avec des images plus légères
    try{r=await send(1024,.75)}catch(e2){if(o.signal&&o.signal.aborted)throw err("cancelled");throw err("network",navigator.onLine===false?"Pas de connexion. Vérifie internet et réessaie.":"Le serveur de lecture n'a pas répondu. Réessaie avec moins d'images, ou dans un instant.")}}
  const out=await r.json().catch(()=>({}));
  if(!r.ok){const st=out.status||r.status;if(st===429)throw err("rate_limited");if(r.status===400)throw err("prompt_too_large");throw err("api_error","La lecture n'a pas marché ("+st+"). Réessaie dans un instant.")}
  const text=String(out.text||"");o.onText&&o.onText({text,delta:text});
  return {text,truncated:false,modelApplied:"serveur"};
}
async function call(input,o={}){
  if(!getKey())return callServer(input,o);
  const msgs=typeof input==="string"?[{role:"user",content:input}]:input.map(m=>({role:m.role,content:m.content}));
  const imgs=o.images||[];
  if(imgs.length){const last=msgs[msgs.length-1];const parts=[];for(const b of imgs)parts.push(await imgPart(b));last.content=[...parts,{type:"text",text:String(last.content)}]}
  const model=o.model||MODELS[o.modelTier]||MODELS.default;
  let r;
  try{
    r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal:o.signal,
      headers:{"content-type":"application/json","x-api-key":getKey(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model,max_tokens:16000,stream:true,messages:msgs})});
  }catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");throw err("network","Pas de connexion à Claude. Vérifie internet et réessaie.")}
  if(!r.ok){
    let msg="";try{msg=(await r.json())?.error?.message||""}catch{}
    if(r.status===401){window.MJ.setKey("");throw err("not_granted","Ta clé Claude n'est pas valide. Remets-en une dans Mon compte.")}
    if(r.status===429||r.status===529)throw err("rate_limited");
    if(r.status===413||/too long|too large|maximum/i.test(msg))throw err("prompt_too_large");
    if(/image/i.test(msg))throw err("image_rejected");
    if(/credit|billing/i.test(msg))throw err("billing","Ton compte Anthropic n'a plus de crédit. Recharge-le sur console.anthropic.com.");
    throw err("api_error","Claude a répondu une erreur ("+r.status+"). Réessaie dans un instant.");
  }
  const rd=r.body.getReader(),dec=new TextDecoder();let buf="",text="",stop="";
  try{
    for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
      let i;while((i=buf.indexOf("\n"))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line.startsWith("data:"))continue;
        let ev;try{ev=JSON.parse(line.slice(5))}catch{continue}
        if(ev.type==="content_block_delta"&&ev.delta?.type==="text_delta"){text+=ev.delta.text;o.onText&&o.onText({text,delta:ev.delta.text})}
        else if(ev.type==="message_delta"&&ev.delta?.stop_reason)stop=ev.delta.stop_reason;
        else if(ev.type==="error"){const t=ev.error?.type;if(t==="overloaded_error"||t==="rate_limit_error")throw err("rate_limited");throw err("api_error","Claude a eu un souci. Réessaie.")}
      }}
  }catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");throw e.code?e:err("network","La connexion a été coupée. Réessaie.")}
  return {text,truncated:stop==="max_tokens",modelApplied:model};
}
function parseJSON(t){
  t=String(t||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"");
  try{return JSON.parse(t)}catch{}
  const s=t.search(/[\[{]/);if(s<0)throw err("invalid_json");
  const open=t[s],close=open==="{"?"}":"]",e=t.lastIndexOf(close);
  try{return JSON.parse(t.slice(s,e+1))}catch{throw err("invalid_json")}
}
const JSON_NOTE="\n\nRéponds uniquement avec le JSON demandé, sans texte autour ni balises de code.";
const sample=Object.freeze(Object.assign((i,o)=>call(i,o),{
  json:async(i,o)=>{const inp=typeof i==="string"?i+JSON_NOTE:i.map((m,k)=>k===i.length-1?{...m,content:m.content+JSON_NOTE}:m);return parseJSON((await call(inp,o)).text)},
  limits:async()=>({images:{maxCount:4}})
}));

/* ---------- window.claude ---------- */
const caps={db,assets,downloads,sample};
window.claude=Object.freeze({use:name=>Promise.resolve(caps[name]||null)});

/* ---------- appli installable ---------- */
if("serviceWorker" in navigator){
  const had=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(()=>{});
  // la première fois, les photos ne s'affichent qu'une fois le service worker aux commandes
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!had&&!sessionStorage.getItem("mj_sw")){sessionStorage.setItem("mj_sw","1");location.reload()}});
}
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch{}
})();
