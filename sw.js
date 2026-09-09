const OLD_PANTRY_PREFIX='https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const MANTLE_DATA='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/appdata';
const DATA_BASKET='/basket/loveb_pink_complete_final';
const ACCOUNTS_BASKET='/basket/loveb_accounts_v1';
const TX_URL=new URL('transactions.json?v=20260909-03',self.registration.scope).href;
const HISTORY_FIX='20260909-history-2';
let memoryData=null;

self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

async function seedTransactions(){
  try{const r=await fetch(TX_URL,{cache:'no-store'});if(r.ok){const d=await r.json();if(Array.isArray(d))return d;}}catch(e){}
  return [];
}
async function staffs(){
  try{const r=await fetch(MANTLE_STAFFS,{cache:'no-store'});if(!r.ok)return null;const d=await r.json();return Array.isArray(d)?d:(d&&Array.isArray(d.staffs)?d.staffs:[]);}catch(e){return null;}
}
async function saveStaffs(s){
  const body=JSON.stringify({staffs:Array.isArray(s)?s:[],cleared:Array.isArray(s)&&s.length===0,updatedAt:new Date().toISOString()});
  try{let r=await fetch(MANTLE_STAFFS,{method:'POST',headers:{'Content-Type':'application/json'},body,cache:'no-store'});if(r.ok)return true;r=await fetch(MANTLE_STAFFS,{method:'PATCH',headers:{'Content-Type':'application/json'},body,cache:'no-store'});return r.ok;}catch(e){return false;}
}
async function mantleSave(d){
  const body=JSON.stringify(d);
  try{const r=await fetch(MANTLE_DATA,{method:'POST',headers:{'Content-Type':'application/json'},body,cache:'no-store'});return r.ok;}catch(e){return false;}
}
function normalizeTransfer(x){
  const o={...x};
  if(String(o.type||'')==='โอนย้ายภายใน'){
    const a=String(o.partner||'').trim(),b=String(o.shop||'').trim();
    if(a&&b){o.fromShop=a;o.toShop=b;o.sourceShop=a;o.targetShop=b;}
  }
  return o;
}
function cloneData(d){return structuredClone(d);}
async function readData(){
  if(memoryData)return cloneData(memoryData);
  try{
    const r=await fetch(MANTLE_DATA,{cache:'no-store'});
    if(r.ok){
      const d=await r.json();
      if(d&&typeof d==='object'){
        if(!Array.isArray(d.transactions)){
          const fixed=await seedTransactions();
          d.transactions=fixed.map(normalizeTransfer);
          d._historyFixVersion=HISTORY_FIX;
          d.updatedAt=new Date().toISOString();
          await mantleSave(d);
        }else{
          d.transactions=d.transactions.map(normalizeTransfer);
        }
        const s=await staffs();if(Array.isArray(s))d.staffs=s;
        memoryData=cloneData(d);return d;
      }
    }
  }catch(e){}
  const fixed=(await seedTransactions()).map(normalizeTransfer);
  const fallback={transactions:fixed,staffs:[],_historyFixVersion:HISTORY_FIX,updatedAt:new Date().toISOString()};
  if(await mantleSave(fallback))memoryData=cloneData(fallback);else memoryData=cloneData(fallback);
  return fallback;
}
async function writeData(d){
  try{
    if(!d||typeof d!=='object')throw new Error('INVALID_DATA');
    if(!Array.isArray(d.transactions))d.transactions=[];
    d.transactions=d.transactions.map(normalizeTransfer);
    if(Array.isArray(d.staffs))await saveStaffs(d.staffs);
    d._historyFixVersion=HISTORY_FIX;
    d.updatedAt=new Date().toISOString();
    const ok=await mantleSave(d);
    if(!ok)throw new Error('MANTLE_SAVE_FAILED');
    memoryData=cloneData(d);
    return d;
  }catch(e){return null;}
}

function inject(html){
 const bridge=`<script>(function(){
const OLD='${OLD_PANTRY_PREFIX}',DATA='${DATA_BASKET}';
const nativeFetch=window.fetch.bind(window);
function isData(u){return u.indexOf(OLD)>=0&&u.indexOf(DATA)>=0}
window.fetch=async function(input,init){
 let u=typeof input==='string'?input:(input&&input.url)||'';
 if(isData(u)){
   try{
     const r=await nativeFetch(input,init);
     if(((init&&init.method)||'GET').toUpperCase()!=='GET'&&r.ok){
       try{const saved=await r.clone().json();window.__LUVBABE_LAST_SAVE=saved;}catch(e){}
     }
     return r;
   }catch(e){
     if(((init&&init.method)||'GET').toUpperCase()==='GET'&&window.__LUVBABE_LAST_SAVE)return new Response(JSON.stringify(window.__LUVBABE_LAST_SAVE),{status:200,headers:{'Content-Type':'application/json'}});
     throw e;
   }
 }
 return nativeFetch(input,init);
};})();</script>`;
 return html.replace('</head>',bridge+'</head>');
}
const permission=`<script>(function(){var U='${MANTLE_ACCOUNTS}',A={dashboard:['dashboard','หน้าหลัก','แดชบอร์ด','ภาพรวม','home'],sales:['sales','ยอดขาย','ขาย','รายการขาย'],customers:['customers','ลูกค้า','สมาชิก','ข้อมูลลูกค้า'],staffs:['staffs','staff','พนักงาน','จัดการพนักงาน'],reports:['reports','รายงาน','สรุปผล'],settings:['settings','ตั้งค่า','การตั้งค่า']};function t(e){return((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||'')).toLowerCase()}function user(){var e=document.querySelector('#loveb-auth-user,input[name="username"],input[name="user"],input[autocomplete="username"]');if(e&&e.value)return e.value.trim();try{return new URLSearchParams(location.search).get('id')||''}catch(x){return ''}}function run(){var u=user();if(!u)return;fetch(U,{cache:'no-store'}).then(r=>r.json()).then(function(d){var l=Array.isArray(d)?d:(d&&Array.isArray(d.accounts)?d.accounts:[]),a=l.find(x=>x&&String(x.username)===String(u));if(!a||a.role==='admin')return;var p=Array.isArray(a.allowedTabs)?a.allowedTabs.map(String):[];document.querySelectorAll('button,a,[role="button"]').forEach(function(e){var s=t(e);Object.keys(A).forEach(function(k){if(A[k].some(v=>s.indexOf(v)>=0))e.style.display=p.indexOf(k)>=0?'':'none'})})}).catch(function(){})}new MutationObserver(run).observe(document.documentElement,{subtree:true,childList:true});setInterval(run,1500);run()})();</script>`;
self.addEventListener('fetch',event=>{
 const u=event.request.url;let p='';try{p=decodeURIComponent(new URL(u).pathname)}catch(e){}
 if(event.request.method==='GET'&&p.endsWith('/index (1).html')){event.respondWith((async()=>{const r=await fetch(event.request);if(!r.ok)return r;let h=await r.text();h=inject(h);h=h.replace('</body>',permission+'</body>');return new Response(h,{status:r.status,headers:r.headers});})());return;}
 if(u.includes(ACCOUNTS_BASKET)&&u.startsWith(OLD_PANTRY_PREFIX)){event.respondWith((async()=>{const method=event.request.method==='GET'?'GET':'POST';const body=method==='POST'?await event.request.clone().arrayBuffer():undefined;try{const r=await fetch(MANTLE_ACCOUNTS,{method,headers:{'Content-Type':'application/json'},body,cache:'no-store'});return r;}catch(e){return new Response(JSON.stringify({accounts:[]}),{status:500,headers:{'Content-Type':'application/json'}})}})());return;}
 if(u.includes(DATA_BASKET)&&u.startsWith(OLD_PANTRY_PREFIX)){event.respondWith((async()=>{
   if(event.request.method==='GET'){const d=await readData();return new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
   let d=null;
   try{d=await event.request.clone().json();}catch(e){try{const text=await event.request.clone().text();d=JSON.parse(text);}catch(x){}}
   if(!d||typeof d!=='object')return new Response(JSON.stringify({ok:false,error:'INVALID_JSON'}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   const saved=await writeData(d);
   if(!saved)return new Response(JSON.stringify({ok:false,error:'MANTLE_SAVE_FAILED'}),{status:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   return new Response(JSON.stringify(saved),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 })());return;}
});