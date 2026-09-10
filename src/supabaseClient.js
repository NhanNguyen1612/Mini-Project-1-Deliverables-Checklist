import { createClient } from '@supabase/supabase-js';
import { db } from './db';

const defaultUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('vku_supabase_url') || 'https://your-project.supabase.co';
const defaultKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('vku_supabase_key') || 'your-anon-key';

export const isPlaceholderUrl = (url) => !url || url.includes('your-project.supabase.co');

export const realClient = isPlaceholderUrl(defaultUrl) ? null : createClient(defaultUrl, defaultKey);

const syncChannel = typeof window !== 'undefined' && window.BroadcastChannel ? new BroadcastChannel('vku_survey_sync_channel') : null;

let globalWs = null;
const initWebSocketRelay = () => {
  if (typeof window === 'undefined' || !window.WebSocket) return;
  try {
    globalWs = new WebSocket('wss://free.websocket.in/vku_survey_instant_channel_2026');
    globalWs.onmessage = () => {
      pullCloudRelaySync();
    };
    globalWs.onclose = () => {
      setTimeout(initWebSocketRelay, 3000);
    };
  } catch (e) {}
};
initWebSocketRelay();

const broadcastInstantWs = (type) => {
  if (globalWs && globalWs.readyState === 1) {
    try {
      globalWs.send(JSON.stringify({ type, timestamp: Date.now() }));
    } catch (e) {}
  }
};

const notifySync = (type) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type });
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
    try {
      localStorage.setItem('vku_last_sync_trigger', Date.now().toString());
    } catch (e) {}
  }
  broadcastInstantWs(type);
};

export const getRegisteredUsers = () => {
  try {
    return JSON.parse(localStorage.getItem('vku_registered_users') || '{}');
  } catch (e) {
    return {};
  }
};

const saveRegisteredUsersLocal = (usersObj) => {
  try {
    localStorage.setItem('vku_registered_users', JSON.stringify(usersObj));
  } catch (e) {}
};

export const registerLocalUser = async (email, role, password) => {
  if (!email) return;
  const lowerEmail = email.trim().toLowerCase();
  const local = getRegisteredUsers();
  local[lowerEmail] = { email: lowerEmail, role, password };
  saveRegisteredUsersLocal(local);
  saveUserRole(lowerEmail, role);

  if (realClient) {
    try {
      await realClient.from('profiles').insert([{ id: 'user-' + lowerEmail, email: lowerEmail, role }]);
    } catch (e) {}
  } else {
    await sendCloudRelaySync({
      type: 'REGISTER_USER',
      payload: { email: lowerEmail, role, password }
    });
    await sendFullCloudSync(true);
  }
  notifySync('PROFILE_UPDATED');
};

export const getRegisteredUser = (email) => {
  if (!email) return null;
  const users = getRegisteredUsers();
  return users[email.toLowerCase()] || null;
};

const getSavedRoles = () => {
  try {
    return JSON.parse(localStorage.getItem('vku_user_roles') || '{}');
  } catch (e) {
    return {};
  }
};

export const saveUserRole = (email, role) => {
  if (!email) return;
  const roles = getSavedRoles();
  const lower = email.toLowerCase();
  roles[lower] = role;
  localStorage.setItem('vku_user_roles', JSON.stringify(roles));
  localStorage.setItem('vku_active_session_role', role);
};

export const getUserRoleByEmail = (identifier) => {
  if (!identifier) return 'student';
  const roles = getSavedRoles();
  const lower = identifier.toLowerCase();

  const activeRole = sessionStorage.getItem('vku_active_session_role') || localStorage.getItem('vku_active_session_role');
  if (activeRole) return activeRole;

  if (roles[lower]) return roles[lower];

  const cleanId = lower.replace(/^user-|^demo-|^demo-user-/, '');
  for (const key in roles) {
    const keyLower = key.toLowerCase();
    if (keyLower === cleanId || keyLower.includes(cleanId) || cleanId.includes(keyLower)) {
      return roles[key];
    }
  }

  const users = getRegisteredUsers();
  for (const emailKey in users) {
    const emailLower = emailKey.toLowerCase();
    if (emailLower === cleanId || emailLower.includes(cleanId) || cleanId.includes(emailLower)) {
      return users[emailKey].role;
    }
  }

  if (lower.includes('teacher') || lower.includes('giangvien')) return 'teacher';
  return 'student';
};

const getLocalStorageBackup = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    return [];
  }
};

const saveLocalStorageBackup = (key, items) => {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.warn(e);
  }
};

const mergeItems = (primaryList = [], secondaryList = []) => {
  const map = new Map();
  for (const item of primaryList || []) {
    if (!item) continue;
    const k = item.id || (item.title + '_' + item.created_at) || JSON.stringify(item);
    map.set(String(k), item);
  }
  for (const item of secondaryList || []) {
    if (!item) continue;
    const k = item.id || (item.title + '_' + item.created_at) || JSON.stringify(item);
    if (!map.has(String(k))) {
      map.set(String(k), item);
    }
  }
  return Array.from(map.values());
};

const sendCloudRelaySync = async (payload) => {
  if (!navigator.onLine) return;
  if (realClient) return; // Direct Supabase handles sync if connected

  const localRequests = getLocalStorageBackup('vku_shared_survey_requests');
  const localInspections = getLocalStorageBackup('vku_shared_inspections');
  const localUsers = getRegisteredUsers();

  try {
    await fetch('/api/sync?t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      body: JSON.stringify({
        type: 'FULL_SYNC',
        payload: {
          survey_requests: localRequests,
          inspections: localInspections,
          users: localUsers
        }
      })
    });
  } catch (e) {}

  notifySync('CLOUD_SYNC_UPDATED');
};

export const sendFullCloudSync = async (isTeacherUpdate = false) => {
  if (!navigator.onLine) return;
  if (realClient) return;

  try {
    const localRequests = getLocalStorageBackup('vku_shared_survey_requests');
    const localInspections = getLocalStorageBackup('vku_shared_inspections');
    let dexieReqs = [];
    let dexieInsps = [];
    try { dexieReqs = await db.survey_requests.toArray(); } catch (e) {}
    try { dexieInsps = await db.cloud_inspections.toArray(); } catch (e) {}

    const allRequests = mergeItems(localRequests, dexieReqs);
    const allInspections = mergeItems(localInspections, dexieInsps);
    const allUsers = getRegisteredUsers();

    await sendCloudRelaySync({
      type: 'FULL_SYNC',
      payload: {
        survey_requests: allRequests,
        inspections: allInspections,
        users: allUsers,
        is_teacher_update: isTeacherUpdate
      }
    });
  } catch (e) {}
};

export const pullCloudRelaySync = async () => {
  if (!navigator.onLine) return;
  if (realClient) return;

  let store = { survey_requests: [], inspections: [], users: {} };
  let fetchSucceeded = false;

  try {
    const res = await fetch('/api/sync?t=' + Date.now(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data.survey_requests) || Array.isArray(data.inspections))) {
        store.survey_requests = mergeItems(data.survey_requests, store.survey_requests);
        store.inspections = mergeItems(data.inspections, store.inspections);
        if (data.users) store.users = { ...store.users, ...data.users };
        fetchSucceeded = true;
      }
    }
  } catch (err) {}

  if (!fetchSucceeded) return;

  let updated = false;

  if (store.users && typeof store.users === 'object' && Object.keys(store.users).length > 0) {
    const currentUsers = getRegisteredUsers();
    const currentStr = JSON.stringify(currentUsers);
    const mergedUsers = { ...currentUsers, ...store.users };
    const mergedStr = JSON.stringify(mergedUsers);
    if (mergedStr !== currentStr) {
      saveRegisteredUsersLocal(mergedUsers);
      for (const [em, u] of Object.entries(mergedUsers)) {
        if (u.role) saveUserRole(em, u.role);
      }
      updated = true;
    }
  }

  if (Array.isArray(store.survey_requests)) {
    const currentLocal = getLocalStorageBackup('vku_shared_survey_requests');
    const currentStr = JSON.stringify(currentLocal);
    const merged = mergeItems(store.survey_requests, currentLocal);
    const mergedStr = JSON.stringify(merged);
    saveLocalStorageBackup('vku_shared_survey_requests', merged);
    for (const req of merged) {
      try { await db.survey_requests.put(req); } catch (e) {}
    }
    if (mergedStr !== currentStr) {
      updated = true;
    }
  }

  if (Array.isArray(store.inspections)) {
    const currentLocal = getLocalStorageBackup('vku_shared_inspections');
    const currentStr = JSON.stringify(currentLocal);
    const merged = mergeItems(store.inspections, currentLocal);
    const mergedStr = JSON.stringify(merged);
    saveLocalStorageBackup('vku_shared_inspections', merged);
    for (const insp of merged) {
      try { await db.cloud_inspections.put(insp); } catch (e) {}
    }
    if (mergedStr !== currentStr) {
      updated = true;
    }
  }

  if (updated) {
    notifySync('CLOUD_SYNC_UPDATED');
  }
};

if (typeof window !== 'undefined') {
  setInterval(pullCloudRelaySync, 500);
  setInterval(() => sendFullCloudSync(false), 1000);
  window.addEventListener('focus', pullCloudRelaySync);
  pullCloudRelaySync();
}

class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.conditions = [];
    this.isSingle = false;
    this.orderByField = null;
    this.ascending = true;
  }

  eq(field, val) {
    this.conditions.push({ field, val });
    return this;
  }

  order(field, options = {}) {
    this.orderByField = field;
    this.ascending = options.ascending !== undefined ? options.ascending : true;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async execute() {
    if (this.table === 'profiles') {
      const emailCond = this.conditions.find(c => c.field === 'email' || c.field === 'id');
      if (emailCond) {
        const activeRole = sessionStorage.getItem('vku_active_session_role') || localStorage.getItem('vku_active_session_role');
        const role = activeRole || getUserRoleByEmail(emailCond.val);
        return { data: this.isSingle ? { role } : [{ role }], error: null };
      }
      return { data: this.isSingle ? null : [], error: null };
    }

    let items = [];
    if (this.table === 'survey_requests') {
      let dexieItems = [];
      try { dexieItems = await db.survey_requests.toArray(); } catch (e) {}
      const localItems = getLocalStorageBackup('vku_shared_survey_requests');
      items = mergeItems(localItems, dexieItems);
    } else if (this.table === 'inspections') {
      let dexieItems = [];
      try { dexieItems = await db.cloud_inspections.toArray(); } catch (e) {}
      const localItems = getLocalStorageBackup('vku_shared_inspections');
      items = mergeItems(localItems, dexieItems);
    }

    for (const cond of this.conditions) {
      items = items.filter(item => String(item[cond.field]) === String(cond.val));
    }

    if (this.orderByField) {
      const field = this.orderByField;
      const asc = this.ascending;
      items.sort((a, b) => {
        const valA = a[field] || '';
        const valB = b[field] || '';
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    } else {
      items.reverse();
    }

    if (this.isSingle) {
      return { data: items[0] || null, error: null };
    }

    return { data: items, error: null };
  }

  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const supabase = {
  auth: {
    async signUp({ email, password }) {
      if (realClient) {
        return await realClient.auth.signUp({ email, password });
      }
      return { data: { user: { id: 'user-' + email.split('@')[0], email } }, error: null };
    },
    async signInWithPassword({ email, password }) {
      if (realClient) {
        return await realClient.auth.signInWithPassword({ email, password });
      }

      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail) {
        return { data: { user: null }, error: new Error('Vui lòng nhập Email!') };
      }

      await pullCloudRelaySync();
      let registered = getRegisteredUser(cleanEmail);

      if (!registered) {
        // Fallback auto-registration for valid user credentials across devices
        const inferredRole = getUserRoleByEmail(cleanEmail);
        await registerLocalUser(cleanEmail, inferredRole, password || '123123');
        registered = getRegisteredUser(cleanEmail);
      }

      if (password && registered && registered.password && registered.password !== password) {
        return {
          data: { user: null },
          error: new Error('Mật khẩu không chính xác! Vui lòng kiểm tra lại.')
        };
      }

      saveUserRole(cleanEmail, registered ? registered.role : getUserRoleByEmail(cleanEmail));

      return { data: { user: { id: 'user-' + cleanEmail.split('@')[0], email: cleanEmail } }, error: null };
    },
    async getSession() {
      if (realClient) {
        return await realClient.auth.getSession();
      }
      const savedUser = sessionStorage.getItem('vku_current_demo_user') || localStorage.getItem('vku_current_demo_user');
      return { data: { session: savedUser ? { user: JSON.parse(savedUser) } : null } };
    },
    async signOut() {
      if (realClient) {
        return await realClient.auth.signOut();
      }
      sessionStorage.removeItem('vku_current_demo_user');
      sessionStorage.removeItem('vku_active_session_role');
      localStorage.removeItem('vku_current_demo_user');
      localStorage.removeItem('vku_active_session_role');
      return { error: null };
    }
  },
  from(table) {
    if (realClient) {
      return realClient.from(table);
    }
    return {
      select() {
        return new MockQueryBuilder(table);
      },
      async insert(rows) {
        if (table === 'profiles') {
          for (const row of rows) {
            if (row.email && row.role) {
              saveUserRole(row.email, row.role);
            }
          }
        } else if (table === 'survey_requests') {
          const currentLocal = getLocalStorageBackup('vku_shared_survey_requests');
          for (const row of rows) {
            const cleanRow = { ...row };
            if (!cleanRow.id) cleanRow.id = Date.now() + Math.floor(Math.random() * 1000);
            try { await db.survey_requests.put(cleanRow); } catch (e) {}
            currentLocal.push(cleanRow);
          }
          saveLocalStorageBackup('vku_shared_survey_requests', currentLocal);
          notifySync('REQUEST_ADDED');
          sendFullCloudSync(true).catch(() => {});
        } else if (table === 'inspections') {
          const currentLocal = getLocalStorageBackup('vku_shared_inspections');
          for (const row of rows) {
            const cleanRow = { ...row };
            if (!cleanRow.id) cleanRow.id = Date.now() + Math.floor(Math.random() * 1000);
            try { await db.cloud_inspections.put(cleanRow); } catch (e) {}
            currentLocal.push(cleanRow);
          }
          saveLocalStorageBackup('vku_shared_inspections', currentLocal);
          notifySync('INSPECTION_ADDED');
          sendFullCloudSync(false).catch(() => {});
        }
        return { data: rows, error: null };
      },
      delete() {
        return {
          async eq(field, val) {
            if (table === 'survey_requests') {
              try {
                const allLocal = await db.survey_requests.toArray();
                const target = allLocal.find(i => String(i[field]) === String(val));
                if (target && target.id) {
                  await db.survey_requests.delete(target.id);
                }
              } catch (e) {}
              let currentBackup = getLocalStorageBackup('vku_shared_survey_requests');
              currentBackup = currentBackup.filter(i => String(i[field]) !== String(val));
              saveLocalStorageBackup('vku_shared_survey_requests', currentBackup);
              sendCloudRelaySync({ type: 'DELETE_REQUEST', id: val }).catch(() => {});
              notifySync('REQUEST_DELETED');
              sendFullCloudSync(true).catch(() => {});
            } else if (table === 'inspections') {
              try {
                const allLocal = await db.cloud_inspections.toArray();
                const target = allLocal.find(i => String(i[field]) === String(val));
                if (target && target.id) {
                  await db.cloud_inspections.delete(target.id);
                }
              } catch (e) {}
              let currentBackup = getLocalStorageBackup('vku_shared_inspections');
              currentBackup = currentBackup.filter(i => String(i[field]) !== String(val));
              saveLocalStorageBackup('vku_shared_inspections', currentBackup);
              sendCloudRelaySync({ type: 'DELETE_INSPECTION', id: val }).catch(() => {});
              notifySync('INSPECTION_DELETED');
              sendFullCloudSync(false).catch(() => {});
            }
            return { error: null };
          }
        };
      }
    };
  }
};

export function updateSupabaseConfig(url, key) {
  if (url) localStorage.setItem('vku_supabase_url', url);
  if (key) localStorage.setItem('vku_supabase_key', key);
  window.location.reload();
}
