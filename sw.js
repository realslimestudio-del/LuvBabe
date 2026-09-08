const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const DATA_BASKET = '/basket/loveb_pink_complete_final';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

let lastStaffSnapshot = null;
let lastStaffWriteAt = 0;
let clearLockUntil = 0;

async function mantleGetStaffState() {
  try {
    const r = await fetch(MANTLE_STAFFS, {cache:'no-store', mode:'cors'});
    if (r.status === 404) return {status:'missing', found:false, staffs:null};
    if (!r.ok) return {status:'error', found:false, staffs:null};
    const d = await r.json();
    if (d && Array.isArray(d.staffs)) return {status:'ok', found:true, staffs:d.staffs};
    if (Array.isArray(d)) return {status:'ok', found:true, staffs:d};
    if (d && d.cleared === true) return {status:'ok', found:true, staffs:[]};
    return {status:'ok', found:true, staffs:[]};
  } catch (e) {
    return {status:'error', found:false, staffs:null};
  }
}

let staffSaveQueue = Promise.resolve();
function queueStaffSave(staffs) {
  const snapshot = Array.isArray(staffs) ? staffs.map(x => ({...x})) : [];
  staffSaveQueue = staffSaveQueue.then(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(MANTLE_STAFFS, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          cache:'no-store',
          mode:'cors',
          body:JSON.stringify({staffs:snapshot,cleared:snapshot.length===0,updatedAt:new Date().toISOString()})
        });
        if (r.ok) {
          lastStaffSnapshot = snapshot;
          lastStaffWriteAt = Date.now();
          if (snapshot.length === 0) clearLockUntil = Date.now() + 3000;
          return true;
        }
      } catch (e) {}
      await new Promise(resolve => setTimeout(resolve, 150 * attempt));
    }
    return false;
  });
  return staffSaveQueue;
}

self.addEventListener('fetch', event => {
  const url = event.request.url;
  let decodedPath = '';
  try { decodedPath = decodeURIComponent(new URL(url).pathname); } catch (e) {}

  // The original app uses a space in "index (1).html". URL.pathname is
  // percent-encoded, so decode it before matching. This only fixes staff
  // selection and does not modify transaction fields.
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

          if (state.status === 'ok') {
            data.staffs = state.staffs;
          } else if (state.status === 'missing') {
            // First migration only: seed the separate staff store once.
            if (Array.isArray(data.staffs)) {
              await queueStaffSave(data.staffs);
            } else {
              await queueStaffSave([]);
              data.staffs = [];
            }
          } else {
            // If the separate staff store is temporarily unavailable, never
            // resurrect old staff from Pantry. Use the last confirmed snapshot
            // when available; otherwise show an empty staff list.
            if (Array.isArray(lastStaffSnapshot) && Date.now() - lastStaffWriteAt < 60000) {
              data.staffs = lastStaffSnapshot;
            } else {
              data.staffs = [];
            }
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
          // Ignore a very-late stale non-empty autosave that arrives immediately
          // after the user has explicitly cleared everyone.
          if (payload.staffs.length > 0 && Date.now() < clearLockUntil) {
            const clean = {...payload};
            delete clean.staffs;
            const headers = new Headers(req.headers);
            headers.delete('content-length');
            return fetch(new Request(req.url,{method:'POST',headers,body:JSON.stringify(clean),mode:'cors',credentials:req.credentials,cache:'no-store'}));
          }

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