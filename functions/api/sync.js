let memoryStore = {
  survey_requests: [],
  inspections: [],
  users: {}
};

const mergeArrays = (listA = [], listB = []) => {
  const map = new Map();
  for (const item of listA || []) {
    if (!item) continue;
    const k = item.id || (item.title + '_' + item.created_at) || JSON.stringify(item);
    map.set(String(k), item);
  }
  for (const item of listB || []) {
    if (!item) continue;
    const k = item.id || (item.title + '_' + item.created_at) || JSON.stringify(item);
    if (!map.has(String(k))) {
      map.set(String(k), item);
    }
  }
  return Array.from(map.values());
};

const mergeUsers = (usersA = {}, usersB = {}) => {
  return { ...usersB, ...usersA };
};

const KEYVAL_URL = 'https://api.keyval.org/get/vku_pwa_survey_store_2026';
const KEYVAL_SET_BASE = 'https://api.keyval.org/set/vku_pwa_survey_store_2026/';

async function getStore(env) {
  // Try Cloudflare KV if bound
  if (env && env.SURVEY_KV) {
    try {
      const data = await env.SURVEY_KV.get('vku_store', { type: 'json' });
      if (data && (Array.isArray(data.survey_requests) || Array.isArray(data.inspections))) {
        memoryStore.survey_requests = mergeArrays(memoryStore.survey_requests, data.survey_requests || []);
        memoryStore.inspections = mergeArrays(memoryStore.inspections, data.inspections || []);
        memoryStore.users = mergeUsers(memoryStore.users, data.users || {});
        return memoryStore;
      }
    } catch (e) {}
  }

  // Persistent keyval store sync across edge isolates (only fetch if memoryStore is empty)
  if (memoryStore.survey_requests.length === 0 && memoryStore.inspections.length === 0) {
    try {
      const res = await fetch(KEYVAL_URL);
      if (res.ok) {
        const json = await res.json();
        if (json && json.val) {
          const parsed = JSON.parse(json.val);
          if (parsed && (Array.isArray(parsed.survey_requests) || Array.isArray(parsed.inspections))) {
            memoryStore.survey_requests = mergeArrays(parsed.survey_requests || [], memoryStore.survey_requests);
            memoryStore.inspections = mergeArrays(parsed.inspections || [], memoryStore.inspections);
            memoryStore.users = mergeUsers(parsed.users || {}, memoryStore.users);
          }
        }
      }
    } catch (e) {}
  }

  return memoryStore;
}

async function saveStore(env, store) {
  memoryStore = store;

  // Save to Cloudflare KV if available
  if (env && env.SURVEY_KV) {
    try {
      await env.SURVEY_KV.put('vku_store', JSON.stringify(store));
    } catch (e) {}
  }

  // Non-blocking persistent keyval store save
  try {
    const encoded = encodeURIComponent(JSON.stringify(store));
    fetch(KEYVAL_SET_BASE + encoded).catch(() => {});
  } catch (e) {}
}

export async function onRequestGet(context) {
  const store = await getStore(context.env);
  return new Response(JSON.stringify(store), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestPost(context) {
  try {
    const store = await getStore(context.env);
    const body = await context.request.json();

    if (body && body.type === 'REGISTER_USER' && body.payload) {
      const { email, role, password } = body.payload;
      if (email) {
        store.users[email.toLowerCase()] = { email, role, password };
      }
    } else if (body && body.type === 'ADD_REQUEST' && body.payload) {
      const exists = store.survey_requests.some(r => String(r.id) === String(body.payload.id));
      if (!exists) {
        store.survey_requests.unshift(body.payload);
      }
    } else if (body && body.type === 'DELETE_REQUEST' && body.id) {
      store.survey_requests = store.survey_requests.filter(r => String(r.id) !== String(body.id));
    } else if (body && body.type === 'ADD_INSPECTION' && body.payload) {
      const exists = store.inspections.some(i => String(i.id) === String(body.payload.id));
      if (!exists) {
        store.inspections.unshift(body.payload);
      }
    } else if (body && body.type === 'DELETE_INSPECTION' && body.id) {
      store.inspections = store.inspections.filter(i => String(i.id) !== String(body.id));
    } else if (body && body.type === 'FULL_SYNC' && body.payload) {
      if (Array.isArray(body.payload.survey_requests)) {
        store.survey_requests = mergeArrays(body.payload.survey_requests, store.survey_requests);
      }
      if (Array.isArray(body.payload.inspections)) {
        store.inspections = mergeArrays(body.payload.inspections, store.inspections);
      }
      if (body.payload.users && typeof body.payload.users === 'object') {
        store.users = mergeUsers(body.payload.users, store.users);
      }
    }

    await saveStore(context.env, store);

    return new Response(JSON.stringify({ success: true, store }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
