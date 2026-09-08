const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  let decodedPath = '';
  try { decodedPath = decodeURIComponent(new URL(url).pathname); } catch (e) {}

  // Fix only the original empty-staff fallback in the app. An empty array
  // must remain empty; it must not fall back to the old Pantry staff list.
  if (event.request.method === 'GET' && decodedPath.endsWith('/index (1).html')) {
    event.respondWith((async () => {
      const original = await fetch(event.request);
      if (!original.ok) return original;
      try {
        const text = await original.text();
        const fixed = text.replace(
          'staffs:S.staffs?.length?S.staffs:P.staffs',
          'staffs:Array.isArray(S.staffs)?S.staffs:P.staffs'
        );
        return new Response(fixed, {
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

  // IMPORTANT: the transaction basket is now completely pass-through.
  // Staff are saved/removed by the app's normal autosave together with the
  // existing state. No staff resurrection, filtering, tombstones, or delayed
  // writes are performed here. Transaction/sales fields are not changed.
  if (url.includes('/basket/loveb_pink_complete_final')) {
    event.respondWith(fetch(event.request));
  }
});
