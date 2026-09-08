const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_BASE = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283';
const MANTLE_ACCOUNTS = MANTLE_BASE + '/accounts';
const MANTLE_DATA = MANTLE_BASE + '/app-data';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  event.respondWith((async () => {
    const isAccounts = url.includes('/basket/loveb_accounts_v1');
    const isAppData = url.includes('/basket/loveb_pink_complete_final');

    // The old app also checks the Pantry root when an account basket is missing.
    if (!isAccounts && !isAppData) {
      return new Response(JSON.stringify({ok:true}), {
        status: 200,
        headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'}
      });
    }

    const target = isAccounts ? MANTLE_ACCOUNTS : MANTLE_DATA;
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
      const response = await fetch(target, init);
      return response;
    } catch (e) {
      return new Response(JSON.stringify({error:'storage unavailable'}), {
        status: 503,
        headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'}
      });
    }
  })());
});
