const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const DATA_BASKET = '/basket/loveb_pink_complete_final';
const APP_FILE = '/LuvBabe/index%20(1).html';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function mantleGetStaffState() {
  try {
    const r = await fetch(MANTLE_STAFFS, {cache:'no-store', mode:'cors'});
    if (r.status === 404) return {found:false, staffs:null};
    if (!r.ok) return {found:false, staffs:null};
    const d = await r.json();
    if (d && Array.isArray(d.staffs)) return {found:true, staffs:d.staffs};
    if (Array.isArray(d)) return {found:true, staffs:d};
    if (d && d.cleared === true) return {found:true, staffs:[]};
    return {found:true, staffs:[]};
  } catch (e) { return {found:false, staffs:null}; }
}

let staffSaveQueue = Promise.resolve();
function queueStaffSave(staffs) {
  const snapshot = Array.isArray(staffs) ? staffs.map(x => ({...x})) : [];
  staffSaveQueue = staffSaveQueue.then(async () => {
    try {
      const r = await fetch(MANTLE_STAFFS, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        mode:'cors',
        body:JSON.stringify({staffs:snapshot,cleared:snapshot.length===0,updatedAt:new Date().toISOString()})
      });
      return r.ok;
    } catch (e) { return false; }
  });
  return staffSaveQueue;
}

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Patch one existing app condition at response time. The original app used
  // "S.staffs?.length ? S.staffs : P.staffs", which resurrected the old local
  // staff list whenever the authoritative saved list was intentionally empty.
  // This changes only that staff-selection condition; transaction code/data is untouched.
  if (event.request.method === 'GET' && new URL(url).pathname.endsWith('/index (1).html')) {
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
          status:original.status,
          statusText:original.statusText,
          headers:original.headers
        });
      } catch (e) { return original; }
    })());
    return;
  }

  if (!url.startsWith(OLD_PANTRY_PREFIX)) return;

  const isAccountsBasket = url.includes(ACCOUNTS_BASKET);
  const isDataBasket = url.includes(DATA_BASKET);

  if (isAccountsBasket) {
    event.respondWith((async () => {
      let method = event.request.method;
      if (method === 'PUT' || method === 'POST') method = 'POST';
      const init = {method,headers:new Headers(event.request.headers),cache:'no-store',mode:'cors'};
      if (method !== 'GET' && method !== 'HEAD') init.body = await event.request.clone().arrayBuffer();
      try { return await fetch(MANTLE_ACCOUNTS, init); }
      catch (e) { return new Response(JSON.stringify({error:'storage unavailable'}), {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}); }
    })());
    return;
  }

  if (isDataBasket) {
    event.respondWith((async () => {
      const req = event.request;
      const method = req.method;

      if (method === 'GET') {
        try {
          const original = await fetch(req);
          if (!original.ok) return original;
          const data = await original.clone().json();
          const state = await mantleGetStaffState();
          if (state.found) {
            data.staffs = state.staffs;
          } else if (Array.isArray(data.staffs)) {
            await queueStaffSave(data.staffs);
          }
          return new Response(JSON.stringify(data), {
            status:original.status,statusText:original.statusText,
            headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
          });
        } catch (e) { return fetch(req); }
      }

      if (method === 'POST' || method === 'PUT') {
        let payload = null;
        try { payload = await req.clone().json(); } catch (e) {}
        if (payload && Array.isArray(payload.staffs)) {
          await queueStaffSave(payload.staffs);
          const clean = {...payload};
          delete clean.staffs;
          const headers = new Headers(req.headers);
          headers.delete('content-length');
          return fetch(new Request(req.url,{method:'POST',headers,body:JSON.stringify(clean),mode:'cors',credentials:req.credentials,cache:'no-store'}));
        }
        return fetch(req);
      }
      return fetch(req);
    })());
  }
});
