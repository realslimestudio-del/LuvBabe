const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const DATA_BASKET = '/basket/loveb_pink_complete_final';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function mantleGetStaffs() {
  try {
    const r = await fetch(MANTLE_STAFFS, {cache:'no-store', mode:'cors'});
    if (!r.ok) return null;
    const d = await r.json();
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.staffs)) return d.staffs;
  } catch (e) {}
  return null;
}

async function mantleSaveStaffs(staffs) {
  try {
    const r = await fetch(MANTLE_STAFFS, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      cache:'no-store',
      mode:'cors',
      body:JSON.stringify(staffs)
    });
    return r.ok;
  } catch (e) { return false; }
}

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  const isAccountsBasket = url.includes(ACCOUNTS_BASKET);
  const isDataBasket = url.includes(DATA_BASKET);

  // บัญชีพนักงาน: ใช้พื้นที่แยก ไม่กระทบข้อมูลธุรกรรม
  if (isAccountsBasket) {
    event.respondWith((async () => {
      let method = event.request.method;
      if (method === 'PUT' || method === 'POST') method = 'POST';
      const init = {
        method,
        headers: new Headers(event.request.headers),
        cache:'no-store',
        mode:'cors'
      };
      if (method !== 'GET' && method !== 'HEAD') init.body = await event.request.clone().arrayBuffer();
      try {
        return await fetch(MANTLE_ACCOUNTS, init);
      } catch (e) {
        return new Response(JSON.stringify({error:'storage unavailable'}), {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
      }
    })());
    return;
  }

  // ธุรกรรมเดิม: ยังคงใช้ Pantry เดิม แต่แยก staffs ออกจาก basket ธุรกรรม
  // เพื่อให้เพิ่ม/แก้ไข/ลบพนักงานไม่เขียนทับยอดซื้อ-ขาย
  if (isDataBasket) {
    event.respondWith((async () => {
      const req = event.request;
      const method = req.method;

      if (method === 'GET') {
        try {
          const original = await fetch(req);
          if (!original.ok) return original;
          const data = await original.clone().json();
          const staffs = await mantleGetStaffs();
          if (staffs !== null) data.staffs = staffs;
          else if (Array.isArray(data.staffs) && data.staffs.length) mantleSaveStaffs(data.staffs);
          return new Response(JSON.stringify(data), {
            status: original.status,
            statusText: original.statusText,
            headers: {'Content-Type':'application/json','Cache-Control':'no-store'}
          });
        } catch (e) {
          return fetch(req);
        }
      }

      if (method === 'POST' || method === 'PUT') {
        let payload = null;
        try { payload = await req.clone().json(); } catch (e) {}

        if (payload && Array.isArray(payload.staffs)) {
          // บันทึกพนักงานแยกก่อน โดยไม่แก้ข้อมูลซื้อ/ขาย/พรีเมียม/โอน
          await mantleSaveStaffs(payload.staffs);
          const clean = {...payload};
          delete clean.staffs;
          const headers = new Headers(req.headers);
          headers.delete('content-length');
          return fetch(new Request(req.url, {
            method:'POST',
            headers,
            body:JSON.stringify(clean),
            mode:'cors',
            credentials:req.credentials,
            cache:'no-store'
          }));
        }
        return fetch(req);
      }

      return fetch(req);
    })());
  }

  // ทุก basket อื่น ๆ ปล่อยผ่าน Pantry เดิม 100%
});
