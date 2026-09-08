const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const TX_BASKET = '/basket/loveb_pink_complete_final';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function patchAppHtml(request) {
  const original = await fetch(request);
  if (!original.ok) return original;
  try {
    let text = await original.text();

    // Remove the old import/seed script that could overwrite staff and the full
    // transaction snapshot on every page load.
    text = text.replace(
      /<script>\s*\/\/ Auto seed data from image import if pantry empty[\s\S]*?<\/script>/,
      ''
    );

    // No built-in staff: users must explicitly add staff.
    text = text.replace(
      'l1=[{id:"st1",name:"เลิฟ",isOn:!0,clockInAt:Date.now()-2220000,secondsOffset:0,commission:10},{id:"st2",name:"เบบ",isOn:!1,clockInAt:null,secondsOffset:3425,commission:12},{id:"st3",name:"แอดมิน",isOn:!1,clockInAt:null,secondsOffset:0,commission:8}],',
      'l1=[],'
    );

    // An empty cloud array is valid and must not fall back to defaults.
    text = text.replace(
      'staffs:S.staffs?.length?S.staffs:P.staffs',
      'staffs:Array.isArray(S.staffs)?S.staffs:P.staffs'
    );

    // Login session lasts only for the current browser session.
    text = text.replace('var u = localStorage.getItem(SESSION_KEY);', 'var u = sessionStorage.getItem(SESSION_KEY);');
    text = text.replace(
      'function setSession(username){ try{ localStorage.setItem(SESSION_KEY, username); }catch(e){} }',
      'function setSession(username){ try{ sessionStorage.setItem(SESSION_KEY, username); }catch(e){} }'
    );
    text = text.replace(
      'function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} }',
      'function clearSession(){ try{ sessionStorage.removeItem(SESSION_KEY); }catch(e){} }'
    );

    // Staff is persisted separately in the browser. This does not modify, filter,
    // replace, or drop any transaction/sales fields in the Pantry basket.
    const staffBridge = `<script>
(function(){
  try{
    var STAFF_KEY='loveb_staffs_v2';
    var TX='${TX_BASKET}';
    var nativeFetch=window.fetch.bind(window);
    function txUrl(input){try{return typeof input==='string'?input:(input&&input.url)||''}catch(e){return ''}}
    function txMethod(input,init){return String((init&&init.method)||(input&&input.method)||'GET').toUpperCase()}
    function copyHeaders(h){var out=new Headers();try{h.forEach(function(v,k){if(k!=='content-encoding'&&k!=='content-length'&&k!=='transfer-encoding')out.set(k,v)})}catch(e){}return out}
    window.fetch=async function(input,init){
      var url=txUrl(input), method=txMethod(input,init), isTx=url.indexOf(TX)>=0;
      var bodyText=null;
      if(isTx && method!=='GET' && method!=='HEAD'){
        try{
          if(init && typeof init.body==='string') bodyText=init.body;
          else if(input && input.clone) bodyText=await input.clone().text();
          if(bodyText){var sent=JSON.parse(bodyText);if(Array.isArray(sent.staffs))localStorage.setItem(STAFF_KEY,JSON.stringify(sent.staffs));}
        }catch(e){}
      }
      var response=await nativeFetch(input,init);
      if(!isTx || method!=='GET' || !response.ok)return response;
      try{
        var data=await response.clone().json();
        var saved=localStorage.getItem(STAFF_KEY);
        if(saved!==null){var staffs=JSON.parse(saved);if(Array.isArray(staffs))data.staffs=staffs;}
        else if(Array.isArray(data.staffs))localStorage.setItem(STAFF_KEY,JSON.stringify(data.staffs));
        var headers=copyHeaders(response.headers);headers.set('content-type','application/json');
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

  // Keep account storage behavior unchanged.
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

  // Transaction/sales basket is fully pass-through. No transaction data is changed.
  if (url.includes(TX_BASKET)) event.respondWith(fetch(event.request));
});
