const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const DATA_BASKET = '/basket/loveb_pink_complete_final';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

let lastStaffSnapshot = null;
let lastStaffWriteAt = 0;
let clearLockUntil = 0;
let staffSaveQueue = Promise.resolve();

async function getStaffs() {
  try {
    const r = await fetch(MANTLE_STAFFS, {cache:'no-store', mode:'cors'});
    if (r.status === 404) return {missing:true, staffs:null};
    if (!r.ok) return {missing:false, staffs:null};
    const d = await r.json();
    if (Array.isArray(d)) return {missing:false, staffs:d};
    if (d && Array.isArray(d.staffs)) return {missing:false, staffs:d.staffs};
    if (d && d.cleared === true) return {missing:false, staffs:[]};
    return {missing:false, staffs:[]};
  } catch (e) { return {missing:false, staffs:null}; }
}

function saveStaffs(staffs) {
  const snapshot = Array.isArray(staffs) ? staffs.map(x => ({...x})) : [];
  staffSaveQueue = staffSaveQueue.then(async () => {
    for (let i=1;i<=3;i++) {
      try {
        const r = await fetch(MANTLE_STAFFS, {
          method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', mode:'cors',
          body:JSON.stringify({staffs:snapshot,cleared:snapshot.length===0,updatedAt:new Date().toISOString()})
        });
        if (r.ok) {
          lastStaffSnapshot=snapshot; lastStaffWriteAt=Date.now();
          if(snapshot.length===0) clearLockUntil=Date.now()+5000;
          return true;
        }
      } catch(e) {}
      await new Promise(resolve=>setTimeout(resolve,200*i));
    }
    return false;
  });
  return staffSaveQueue;
}

self.addEventListener('fetch', event => {
  const url=event.request.url;
  let decodedPath=''; try{decodedPath=decodeURIComponent(new URL(url).pathname)}catch(e){}

  if(event.request.method==='GET' && decodedPath.endsWith('/index (1).html')){
    event.respondWith((async()=>{
      const original=await fetch(event.request); if(!original.ok)return original;
      try{
        const text=await original.text();
        let fixed=text.replace('staffs:S.staffs?.length?S.staffs:P.staffs','staffs:Array.isArray(S.staffs)?S.staffs:P.staffs');
        fixed=fixed.replace('staffs:S.staffs?.map((D)=>{','staffs:Array.isArray(S.staffs)?S.staffs.map((D)=>{');
        fixed=fixed.replace('})||L.staffs','}):L.staffs');
        return new Response(fixed,{status:original.status,statusText:original.statusText,headers:original.headers});
      }catch(e){return original}
    })()); return;
  }
  if(!url.startsWith(OLD_PANTRY_PREFIX))return;

  if(url.includes(ACCOUNTS_BASKET)){
    event.respondWith((async()=>{
      let method=event.request.method; if(method==='PUT'||method==='POST')method='POST';
      const init={method,headers:new Headers(event.request.headers),cache:'no-store',mode:'cors'};
      if(method!=='GET'&&method!=='HEAD')init.body=await event.request.clone().arrayBuffer();
      try{return await fetch(MANTLE_ACCOUNTS,init)}catch(e){return new Response(JSON.stringify({error:'storage unavailable'}),{status:503,headers:{'Content-Type':'application/json'}})}
    })()); return;
  }

  if(url.includes(DATA_BASKET)){
    event.respondWith((async()=>{
      const req=event.request, method=req.method;
      if(method==='GET'){
        try{
          const original=await fetch(req); if(!original.ok)return original;
          const data=await original.clone().json(); const remote=await getStaffs();
          if(Array.isArray(remote.staffs)){data.staffs=remote.staffs;lastStaffSnapshot=remote.staffs.map(x=>({...x}));lastStaffWriteAt=Date.now()}
          else if(remote.missing){const initial=Array.isArray(data.staffs)?data.staffs:[];await saveStaffs(initial);data.staffs=initial}
          else if(Array.isArray(lastStaffSnapshot)&&Date.now()-lastStaffWriteAt<120000)data.staffs=lastStaffSnapshot;
          else data.staffs=[];
          return new Response(JSON.stringify(data),{status:original.status,statusText:original.statusText,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
        }catch(e){return fetch(req)}
      }
      if(method==='POST'||method==='PUT'){
        let payload=null;try{payload=await req.clone().json()}catch(e){}
        if(payload&&Array.isArray(payload.staffs)){
          if(payload.staffs.length>0&&Date.now()<clearLockUntil)return fetch(req);
          await saveStaffs(payload.staffs);
        }
        // IMPORTANT: never rewrite transaction payloads. The original request is passed through unchanged.
        return fetch(req);
      }
      return fetch(req);
    })()); return;
  }
});