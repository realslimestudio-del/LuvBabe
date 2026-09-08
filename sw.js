const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  let decodedPath = '';
  try { decodedPath = decodeURIComponent(new URL(url).pathname); } catch (e) {}

  // Patch the app HTML at the network boundary so old embedded scripts cannot
  // reseed the deleted staff list or keep a persistent login session.
  if (event.request.method === 'GET' && decodedPath.endsWith('/index (1).html')) {
    event.respondWith((async () => {
      const original = await fetch(event.request);
      if (!original.ok) return original;
      try {
        let text = await original.text();

        // Never let the old image-import seed script POST its hard-coded snapshot
        // back to Pantry. That script contained staff names and also wrote the
        // entire transaction snapshot on every page load.
        text = text.replace(
          /<script>\s*\/\/ Auto seed data from image import if pantry empty[\s\S]*?<\/script>/,
          ''
        );

        // The shipped default staff list must be empty. Staff can only exist after
        // the user explicitly adds them and the app autosaves that state.
        text = text.replace(
          'l1=[{id:"st1",name:"เลิฟ",isOn:!0,clockInAt:Date.now()-2220000,secondsOffset:0,commission:10},{id:"st2",name:"เบบ",isOn:!1,clockInAt:null,secondsOffset:3425,commission:12},{id:"st3",name:"แอดมิน",isOn:!1,clockInAt:null,secondsOffset:0,commission:8}],',
          'l1=[],'
        );

        // Empty cloud staff data is authoritative. Do not fall back to the old
        // built-in list when staffs:[] is returned.
        text = text.replace(
          'staffs:S.staffs?.length?S.staffs:P.staffs',
          'staffs:Array.isArray(S.staffs)?S.staffs:P.staffs'
        );

        // Login session must last only for the current browser tab/session.
        // The existing remember-login checkbox may still prefill credentials,
        // but it must not automatically authenticate the user after reopening.
        text = text.replace(
          'var u = localStorage.getItem(SESSION_KEY);',
          'var u = sessionStorage.getItem(SESSION_KEY);'
        );
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
    })());
    return;
  }

  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  // Keep the existing account storage behavior unchanged.
  if (url.includes(ACCOUNTS_BASKET)) {
    event.respondWith((async () => {
      let method = event.request.method;
      if (method === 'PUT' || method === 'POST') method = 'POST';
      const init = {
        method,
        headers: new Headers(event.request.headers),
        cache: 'no-store',
        mode: 'cors'
      };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = await event.request.clone().arrayBuffer();
      }
      try {
        return await fetch(MANTLE_ACCOUNTS, init);
      } catch (e) {
        return new Response(JSON.stringify({error:'storage unavailable'}), {
          status: 503,
          headers: {'Content-Type':'application/json','Cache-Control':'no-store'}
        });
      }
    })());
    return;
  }

  // IMPORTANT: transaction/sales basket is completely pass-through.
  // No transaction fields are modified, filtered, replaced, or rewritten here.
  if (url.includes('/basket/loveb_pink_complete_final')) {
    event.respondWith(fetch(event.request));
  }
});
