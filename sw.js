const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const TX_BASKET = '/basket/loveb_pink_complete_final';
const STAFF_CACHE_KEY = 'loveb_staffs_v2';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function patchAppHtml(request) {
  const original = await fetch(request);
  if (!original.ok) return original;
  try {
    let text = await original.text();

    // Remove the legacy import/seed block that could resurrect staff or rewrite
    // the full transaction snapshot on page load.
    text = text.replace(
      /<script>\s*\/\/ Auto seed data from image import if pantry empty[\s\S]*?<\/script>/,
      ''
    );

    // No built-in staff. Staff comes from the online staff store.
    text = text.replace(
      'l1=[{id:"st1",name:"เลิฟ",isOn:!0,clockInAt:Date.now()-2220000,secondsOffset:0,commission:10},{id:"st2",name:"เบบ",isOn:!1,clockInAt:null,secondsOffset:3425,commission:12},{id:"st3",name:"แอดมิน",isOn:!1,clockInAt:null,secondsOffset:0,commission:8}],',
      'l1=[],'
    );

    // An empty cloud staff array is a real value and must stay empty.
    text = text.replace(
      'staffs:S.staffs?.length?S.staffs:P.staffs',
      'staffs:Array.isArray(S.staffs)?S.staffs:P.staffs'
    );

    // The polling merge must also treat [] as authoritative, so a cleared list
    // cannot be resurrected from the previous browser state.
    text = text.replace(
      'staffs:S.staffs?.map((D)=>{let pe=L.staffs.find((br)=>br.id===D.id);if(pe&&pe.isOn)return{...D,isOn:pe.isOn,clockInAt:pe.clockInAt,secondsOffset:pe.secondsOffset};return D})||L.staffs',
      'staffs:Array.isArray(S.staffs)?S.staffs.map((D)=>{let pe=L.staffs.find((br)=>br.id===D.id);if(pe&&pe.isOn)return{...D,isOn:pe.isOn,clockInAt:pe.clockInAt,secondsOffset:pe.secondsOffset};return D}):L.staffs'
    );

    // Login session lasts only for this browser session.
    text = text.replace('var u = localStorage.getItem(SESSION_KEY);', 'var u = sessionStorage.getItem(SESSION_KEY);');
    text = text.replace(
      'function setSession(username){ try{ localStorage.setItem(SESSION_KEY, username); }catch(e){} }',
      'function setSession(username){ try{ sessionStorage.setItem(SESSION_KEY, username); }catch(e){} }'
    );
    text = text.replace(
      'function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} }',
      'function clearSession(){ try{ sessionStorage.removeItem(SESSION_KEY); }catch(e){} }'
    );

    // Staff bridge: staff edits are copied to a dedicated Mantle store shared by
    // all admins/devices. The transaction request itself is NEVER rewritten.
    const staffBridge = `<script>
(function(){
  try{
    var STAFF_URL='${MANTLE_STAFFS}';
    var TX='${TX_BASKET}';
    var KEY='${STAFF_CACHE_KEY}';
    var nativeFetch=window.fetch.bind(window);
    var writeQueue=Promise.resolve();
    function txUrl(input){try{return typeof input==='string'?input:(input&&input.url)||''}catch(e){return ''}}
    function txMethod(input,init){return String((init&&init.method)||(input&&input.method)||'GET').toUpperCase()}
    function readStaffResponse(data){
      if(Array.isArray(data))return data;
      if(data&&Array.isArray(data.staffs))return data.staffs;
      if(data&&data.cleared===true)return [];
      return null;
    }
    function cacheStaff(staffs){try{localStorage.setItem(KEY,JSON.stringify(staffs))}catch(e){}}
    function getCached(){try{var x=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(x)?x:null}catch(e){return null}}
    function saveOnline(staffs){
      var snapshot=Array.isArray(staffs)?staffs.map(function(x){return Object.assign({},x)}):[];
      writeQueue=writeQueue.then(function(){
        return nativeFetch(STAFF_URL,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',mode:'cors',body:JSON.stringify({staffs:snapshot,cleared:snapshot.length===0,updatedAt:new Date().toISOString()})})
          .then(function(r){if(!r.ok)throw new Error('staff save '+r.status);cacheStaff(snapshot);return true})
          .catch(function(){return false});
      });
      return writeQueue;
    }
    async function loadOnline(){
      try{
        var r=await nativeFetch(STAFF_URL,{cache:'no-store',mode:'cors'});
        if(r.status===404)return {missing:true,staffs:null};
        if(!r.ok)return {error:true,staffs:null};
        var d=await r.json(), s=readStaffResponse(d);
        if(s===null)return {ok:true,staffs:[]};
        cacheStaff(s);
        return {ok:true,staffs:s};
      }catch(e){return {error:true,staffs:null}}
    }
    function copyHeaders(h){var out=new Headers();try{h.forEach(function(v,k){if(k!=='content-encoding'&&k!=='content-length'&&k!=='transfer-encoding')out.set(k,v)})}catch(e){}return out}

    window.fetch=async function(input,init){
      var url=txUrl(input), method=txMethod(input,init), isTx=url.indexOf(TX)>=0;

      // Save ONLY the staff list to the dedicated online store. Pass the
      // original transaction request through byte-for-byte otherwise.
      if(isTx && (method==='POST'||method==='PUT')){
        try{
          var bodyText=null;
          if(init&&typeof init.body==='string')bodyText=init.body;
          else if(input&&input.clone)bodyText=await input.clone().text();
          if(bodyText){
            var sent=JSON.parse(bodyText);
            if(Array.isArray(sent.staffs)){
              cacheStaff(sent.staffs);
              saveOnline(sent.staffs);
            }
          }
        }catch(e){}
      }

      var response=await nativeFetch(input,init);
      if(!isTx||method!=='GET'||!response.ok)return response;

      try{
        var data=await response.clone().json();
        var online=await loadOnline();
        var staffs=null;
        if(online.ok)staffs=online.staffs;
        else if(online.missing){
          staffs=Array.isArray(data.staffs)?data.staffs:[];
          await saveOnline(staffs);
        }else{
          staffs=getCached();
          if(!Array.isArray(staffs))staffs=Array.isArray(data.staffs)?data.staffs:[];
        }
        // Change ONLY the staff field in the response. All transaction/sales
        // fields are returned exactly as received from Pantry.
        data.staffs=staffs;
        var headers=copyHeaders(response.headers);headers.set('content-type','application/json');headers.delete('content-encoding');
        return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:headers});
      }catch(e){return response}
    };
  }catch(e){}
})();
</script>`;
    text = text.replace('</body>', staffBridge + '</body>');

    return new Response(text, {
      status: original.status,
      statusText: original.statusText,
      headers: original.headers
    });
  } catch (e) { return original; }
}

self.addEventListener('fetch', event => {
  const url = event.request.url;
  let decodedPath = '';
  try { decodedPath = decodeURIComponent(new URL(url).pathname); } catch (e) {}

  if (event.request.method === 'GET' && decodedPath.endsWith('/index (1).html')) {
    event.respondWith(patchAppHtml(event.request));
    return;
  }

  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  // Account storage remains on the existing shared Mantle account store.
  if (url.includes(ACCOUNTS_BASKET)) {
    event.respondWith((async () => {
      let method = event.request.method;
      if (method === 'PUT' || method === 'POST') method = 'POST';
      const init = { method, headers: new Headers(event.request.headers), cache: 'no-store', mode: 'cors' };
      if (method !== 'GET' && method !== 'HEAD') init.body = await event.request.clone().arrayBuffer();
      try {
        return await fetch(MANTLE_ACCOUNTS, init);
      } catch (e) {
        return new Response(JSON.stringify({error:'storage unavailable'}), {
          status: 503, headers: {'Content-Type':'application/json','Cache-Control':'no-store'}
        });
      }
    })());
    return;
  }

  // Transaction/sales basket is fully pass-through. No request data is changed.
  if (url.includes(TX_BASKET)) event.respondWith(fetch(event.request));
});
