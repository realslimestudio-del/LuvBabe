const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const TX_BASKET = '/basket/loveb_pink_complete_final';
const STAFF_LOCAL_KEY = 'loveb_staffs_v2';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function patchAppHtml(request) {
  const original = await fetch(request);
  if (!original.ok) return original;
  try {
    let text = await original.text();
    text = text.replace(
      /<script>\s*\/\/ Auto seed data from image import if pantry empty[\s\S]*?<\/script>/,
      ''
    );
    text = text.replace(
      'l1=[{id:"st1",name:"เลิฟ",isOn:!0,clockInAt:Date.now()-2220000,secondsOffset:0,commission:10},{id:"st2",name:"เบบ",isOn:!1,clockInAt:null,secondsOffset:3425,commission:12},{id:"st3",name:"แอดมิน",isOn:!1,clockInAt:null,secondsOffset:0,commission:8}],',
      'l1=[],'
    );
    text = text.replace(
      'staffs:S.staffs?.length?S.staffs:P.staffs',
      'staffs:Array.isArray(S.staffs)?S.staffs:P.staffs'
    );
    text = text.replace('var u = localStorage.getItem(SESSION_KEY);', 'var u = sessionStorage.getItem(SESSION_KEY);');
    text = text.replace(
      'function setSession(username){ try{ localStorage.setItem(SESSION_KEY, username); }catch(e){} }',
      'function setSession(username){ try{ sessionStorage.setItem(SESSION_KEY, username); }catch(e){} }'
    );
    text = text.replace(
      'function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} }',
      'function clearSession(){ try{ sessionStorage.removeItem(SESSION_KEY); }catch(e){} }'
    );
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

  // Staff persistence is kept separately in the browser. Transaction/sales
  // records are NEVER rewritten, filtered, replaced, or dropped.
  if (url.includes(TX_BASKET)) {
    if (event.request.method === 'POST' || event.request.method === 'PUT') {
      event.respondWith((async () => {
        const body = await event.request.clone().text();
        try {
          const payload = JSON.parse(body);
          if (Array.isArray(payload.staffs)) {
            const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
            for (const client of clients) {
              client.postMessage({type:'LOVEb_SAVE_STAFFS', staffs: payload.staffs});
            }
          }
        } catch (e) {}
        return fetch(event.request);
      })());
      return;
    }

    if (event.request.method === 'GET') {
      event.respondWith((async () => {
        const response = await fetch(event.request);
        if (!response.ok) return response;
        try {
          const payload = await response.clone().json();
          const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
          for (const client of clients) client.postMessage({type:'LOVEb_LOAD_STAFFS'});
          // Keep the server response itself untouched. The app's normal staff
          // merge remains authoritative, so this path is intentionally pass-through.
          return response;
        } catch (e) { return response; }
      })());
      return;
    }

    // All other transaction requests are completely pass-through.
    event.respondWith(fetch(event.request));
  }
});

// Persist staff state in the page's localStorage without touching transactions.
self.addEventListener('message', event => {
  const data = event.data || {};
  const client = event.source;
  if (!client) return;
  if (data.type === 'LOVEb_SAVE_STAFFS' && Array.isArray(data.staffs)) {
    client.postMessage({type:'LOVEb_STAFFS_TO_STORE', staffs:data.staffs});
  }
  if (data.type === 'LOVEb_LOAD_STAFFS') {
    client.postMessage({type:'LOVEb_STAFFS_REQUEST'});
  }
});
