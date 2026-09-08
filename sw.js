const OLD_PANTRY_PREFIX = 'https://getpantry.cloud/apiv1/pantry/af4b9c-loveb-store-ratchaburi';
const MANTLE_ACCOUNTS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/accounts';
const MANTLE_STAFFS = 'https://mantledb.sh/v2/luv-babe-fdf1a72c430003fba7f4e922e0d00283/staffs';
const ACCOUNTS_BASKET = '/basket/loveb_accounts_v1';
const DATA_BASKET = '/basket/loveb_pink_complete_final';

self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

let lastStaffSnapshot = null;
let lastStaffWriteAt = 0;
let localClearedIds = new Set();

async function mantleGetStaffState() {
  try {
    const r = await fetch(MANTLE_STAFFS, {cache:'no-store', mode:'cors'});
    if (r.status === 404) return {status:'missing', found:false, staffs:null, clearedIds:[]};
    if (!r.ok) return {status:'error', found:false, staffs:null, clearedIds:[]};
    const d = await r.json();
    const clearedIds = Array.isArray(d?.clearedIds) ? d.clearedIds.filter(Boolean) : [];
    localClearedIds = new Set(clearedIds);
    if (d && Array.isArray(d.staffs)) return {status:'ok', found:true, staffs:d.staffs, clearedIds};
    if (Array.isArray(d)) return {status:'ok', found:true, staffs:d, clearedIds};
    if (d && d.cleared === true) return {status:'ok', found:true, staffs:[], clearedIds};
    return {status:'ok', found:true, staffs:[], clearedIds};
  } catch (e) {
    return {status:'error', found:false, staffs:null, clearedIds:Array.from(localClearedIds)};
  }
}

let staffSaveQueue = Promise.resolve();
function queueStaffSave(staffs) {
  const snapshot = Array.isArray(staffs) ? staffs.map(x => ({...x})) : [];
  staffSaveQueue = staffSaveQueue.then(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const state = await mantleGetStaffState();
        let effective = snapshot;
        let clearedIds = new Set(state.clearedIds || Array.from(localClearedIds));

        if (snapshot.length === 0) {
          // A clear is a durable tombstone: remember every staff ID that
          // existed before the clear so an older tab/autosave can never
          // resurrect those same records later.
          const previous = Array.isArray(state.staffs) ? state.staffs : (Array.isArray(lastStaffSnapshot) ? lastStaffSnapshot : []);
          previous.forEach(x => { if (x && x.id != null) clearedIds.add(String(x.id)); });
          effective = [];
        } else if (clearedIds.size) {
          // New staff receive fresh IDs. Remove only IDs that were known to
          // exist before a clear; keep genuinely new staff additions.
          effective = snapshot.filter(x => !clearedIds.has(String(x?.id ?? '')));
        }

        const body = {
          staffs: effective,
          cleared: effective.length === 0,
          clearedIds: Array.from(clearedIds),
          updatedAt: new Date().toISOString()
        };
        const r = await fetch(MANTLE_STAFFS, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          cache:'no-store',
          mode:'cors',
          body:JSON.stringify(body)
        });
        if (r.ok) {
          localClearedIds = clearedIds;
          lastStaffSnapshot = effective.map(x => ({...x}));
          lastStaffWriteAt = Date.now();
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
          // Staff persistence is handled separately in Mantle. The original
          // transaction payload is forwarded unchanged except for removing
          // the staffs field, so transaction/sales data is not modified.
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