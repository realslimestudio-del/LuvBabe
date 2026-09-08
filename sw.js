const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  // สำคัญ: ข้อมูลธุรกรรม/ข้อมูลอื่นทั้งหมดให้กลับไปใช้ Pantry เดิม 100%
  // แตะเฉพาะ basket บัญชีพนักงานเท่านั้น
  const isAccountsBasket = url.includes(ACCOUNTS_BASKET);
  if (!isAccountsBasket) return;

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
        headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'}
      });
    }
  })());
});
