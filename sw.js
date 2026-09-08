const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  event.respondWith((async () => {
    const isBasket = url.includes('/basket/loveb_accounts_v1');
    if (!isBasket) {
      return new Response(JSON.stringify({ok:true}), {
        status: 200,
        headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'}
      });
    }

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
        headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'}
      });
    }
  })());
});
