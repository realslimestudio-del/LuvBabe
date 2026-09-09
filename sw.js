const OLD_PANTRY_PREFIX='https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const MANTLE_DATA='https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/appdata';
const DATA_BASKET='/basket/loveb_pink_complete_final';
const ACCOUNTS_BASKET='/basket/loveb_accounts_v1';
const TX_URL=new URL('transactions.json?v=20260909-02',self.registration.scope).href;
const HISTORY_FIX='20260909-history-1';
let memoryData=null;

self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

async function seedTransactions(){
  try{const r=await fetch(TX_URL,{cache:'no-store'});const d=await r.json();if(Array.isArray(d))return d;}catch(e){}
  return [];
}
async function staffs(){
  try{const r=await fetch(MANTLE_STAFFS,{cache:'no-store',mode:'cors'});if(!r.ok)return null;const d=await r.json();return Array.isArray(d)?d:(d&&Array.isArray(d.staffs)?d.staffs:[]);}catch(e){return null;}
}
async function saveStaffs(s){
  try{const body=JSON.stringify({staffs:Array.isArray(s)?s:[],cleared:!Array.isArray(s)||s.length===0,updatedAt:new Date().toISOString()});
    let r=await fetch(MANTLE_STAFFS,{method:'POST',headers:{'Content-Type':'application/json'},body,cache:'no-store',mode:'cors'});
    if(!r.ok)r=await fetch(MANTLE_STAFFS,{method:'PUT',headers:{'Content-Type':'application/json'},body,cache:'no-store',mode:'cors'});
    return r.ok;
  }catch(e){return false;}
}
async function mantleSave(d){
  const body=JSON.stringify(d);
  try{
    let r=await fetch(MANTLE_DATA,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',mode:'cors',body});
    if(r.ok)return true;
    r=await fetch(MANTLE_DATA,{method:'PUT',headers:{'Content-Type':'application/json'},cache:'no-store',mode:'cors',body});
    return r.ok;
  }catch(e){return false;}
}
async function readData(){
  if(memoryData)return structuredClone(memoryData);
  try{
    const r=await fetch(MANTLE_DATA,{cache:'no-store',mode:'cors'});
    if(r.ok){
      const d=await r.json();
      if(d&&typeof d==='object'){
        // Apply the confirmed historical transaction set exactly once. After this,
        // normal user edits are allowed to persist and are never replaced by the seed.
        if(d._historyFixVersion!==HISTORY_FIX){
          const fixed=await seedTransactions();
          if(fixed.length){d.transactions=fixed;d._historyFixVersion=HISTORY_FIX;d.updatedAt=new Date().toISOString();await mantleSave(d);}
        }else if(!Array.isArray(d.transactions))d.transactions=[];
        const s=await staffs();if(Array.isArray(s))d.staffs=s;
        memoryData=structuredClone(d);
        return d;
      }
    }
  }catch(e){}
  try{
    const r=await fetch(OLD_PANTRY_PREFIX+DATA_BASKET,{cache:'no-store'});
    if(r.ok){const d=await r.json();if(d&&typeof d==='object'){const fixed=await seedTransactions();if(fixed.length){d.transactions=fixed;d._historyFixVersion=HISTORY_FIX;}const s=await staffs();if(Array.isArray(s))d.staffs=s;await mantleSave(d);memoryData=structuredClone(d);return d;}}
  }catch(e){}
  const fallback={transactions:await seedTransactions(),staffs:[],_historyFixVersion:HISTORY_FIX};memoryData=structuredClone(fallback);return fallback;
}
async function writeData(d){
  try{
    d=d&&typeof d==='object'?d:{};
    if(!Array.isArray(d.transactions))d.transactions=[];
    const s=Array.isArray(d.staffs)?d.staffs:await staffs();
    if(Array.isArray(s))d.staffs=s;
    d._historyFixVersion=HISTORY_FIX;
    d.updatedAt=new Date().toISOString();
    if(Array.isArray(d.transactions))d.transactions=d.transactions.map(x=>({...x}));
    if(Array.isArray(d.staffs))d.staffs=d.staffs.map(x=>({...x}));
    const ok=await mantleSave(d);
    if(ok){memoryData=structuredClone(d);return d;}
  }catch(e){}
  return null;
}
function inject(html){
 const bridge=`<script>(function(){
const OLD='${OLD_PANTRY_PREFIX}',DATA='${DATA_BASKET}',MANTLE='${MANTLE_DATA}';
const nativeFetch=window.fetch.bind(window);
function isData(u){return u.indexOf(OLD)>=0&&u.indexOf(DATA)>=0}
window.fetch=async function(input,init){
 let u=typeof input==='string'?input:(input&&input.url)||'';
 if(isData(u)){
  const method=((init&&init.method)||'GET').toUpperCase();
  if(method==='GET'){try{const r=await nativeFetch(u,{cache:'no-store'});if(r.ok)return r;}catch(e){}return nativeFetch(input,init)}
  if(method==='POST'||method==='PUT'||method==='PATCH'){
   let body=init&&init.body;if(body&&typeof body!=='string')body=JSON.stringify(body);
   try{
    let r=await nativeFetch(MANTLE,{method:'POST',headers:{'Content-Type':'application/json'},body:body||'{}',cache:'no-store'});
    if(!r.ok)r=await nativeFetch(MANTLE,{method:'PUT',headers:{'Content-Type':'application/json'},body:body||'{}',cache:'no-store'});
    if(r.ok)return r;
   }catch(e){}
   return nativeFetch(input,init);
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
 if(u.includes(ACCOUNTS_BASKET)&&u.startsWith(OLD_PANTRY_PREFIX)){event.respondWith((async()=>{const m=event.request.method==='GET'?'GET':'POST';const init={method:m,headers:new Headers(event.request.headers),cache:'no-store'};if(m==='POST')init.body=await event.request.clone().arrayBuffer();try{return await fetch(MANTLE_ACCOUNTS,init)}catch(e){return new Response(JSON.stringify({accounts:[]}),{headers:{'Content-Type':'application/json'}})}})());return;}
 if(u.includes(DATA_BASKET)&&u.startsWith(OLD_PANTRY_PREFIX)){event.respondWith((async()=>{if(event.request.method==='GET'){const d=await readData();return new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}try{const d=await event.request.clone().json();if(d&&typeof d==='object'){if(Array.isArray(d.staffs))await saveStaffs(d.staffs);const saved=await writeData(d);if(saved)return new Response(JSON.stringify(saved),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});return new Response(JSON.stringify({ok:false,error:'MANTLE_SAVE_FAILED'}),{status:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}}catch(e){return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}return new Response(JSON.stringify({ok:false}),{status:400,headers:{'Content-Type':'application/json'}})})());return;}
});