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
        const permissionScript=`
<script>
(function(){
  var ACCOUNT_URL='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
  var doneFor='';
  var aliases={
    dashboard:['dashboard','หน้าหลัก','แดชบอร์ด','ภาพรวม','home'],
    sales:['sales','ยอดขาย','ขาย','รายการขาย'],
    customers:['customers','ลูกค้า','สมาชิก','ข้อมูลลูกค้า'],
    staffs:['staffs','staff','พนักงาน','จัดการพนักงาน'],
    reports:['reports','รายงาน','สรุปผล'],
    settings:['settings','ตั้งค่า','การตั้งค่า']
  };
  function textOf(el){return ((el.innerText||el.textContent||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.getAttribute('title')||'')).trim().toLowerCase();}
  function findUser(){
    var q=['#loveb-auth-user','input[name="username"]','input[name="user"]','input[autocomplete="username"]','input[type="text"]'];
    for(var i=0;i<q.length;i++){var e=document.querySelector(q[i]);if(e&&e.value)return e.value.trim();}
    try{var p=new URLSearchParams(location.search).get('id');if(p)return p;}catch(e){}
    return '';
  }
  function getAccounts(){return fetch(ACCOUNT_URL,{cache:'no-store'}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){return Array.isArray(d)?d:(d&&Array.isArray(d.accounts)?d.accounts:[]);});}
  function isAllowed(name,key){var a=aliases[key]||[];for(var i=0;i<a.length;i++)if(name.indexOf(a[i])>=0)return true;return false;}
  function apply(account){
    if(!account||account.role==='admin')return;
    var allowed=Array.isArray(account.allowedTabs)?account.allowedTabs.map(String):[];
    var nodes=document.querySelectorAll('button,a,[role="button"]');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i],t=textOf(el); if(!t)continue;
      for(var key in aliases){
        if(isAllowed(t,key)){
          var ok=allowed.indexOf(key)>=0;
          if(ok)el.style.removeProperty('display'); else {el.style.display='none';el.setAttribute('data-luvbabe-denied','1');}
          break;
        }
      }
    }
    document.documentElement.setAttribute('data-luvbabe-role',account.role||'partner');
    document.documentElement.setAttribute('data-luvbabe-allowed-tabs',allowed.join(','));
  }
  function run(){
    var user=findUser(); if(!user||user===doneFor)return;
    getAccounts().then(function(list){
      var a=null;for(var i=0;i<list.length;i++)if(list[i]&&String(list[i].username)===String(user)){a=list[i];break;}
      if(a){doneFor=user;apply(a);}
    }).catch(function(){});
  }
  var obs=new MutationObserver(function(){
    var role=document.documentElement.getAttribute('data-luvbabe-role');
    if(role==='partner'){
      var user=findUser();getAccounts().then(function(list){for(var i=0;i<list.length;i++)if(list[i]&&String(list[i].username)===String(user)){apply(list[i]);break;}}).catch(function(){});
    }else run();
  });
  try{obs.observe(document.documentElement,{subtree:true,childList:true});}catch(e){}
  setInterval(run,1200);run();
})();
</script>`;
        fixed=fixed.replace('</body>',permissionScript+'</body>');
        if(fixed===text)fixed=text.replace('</head>',permissionScript+'</head>');
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
        return fetch(req);
      }
      return fetch(req);
    })()); return;
  }
});