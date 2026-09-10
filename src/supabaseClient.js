import { createClient } from '@supabase/supabase-js';
import { db } from './db';

const defaultUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('vku_supabase_url') || 'https://your-project.supabase.co';
const defaultKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('vku_supabase_key') || 'your-anon-key';

export const isPlaceholderUrl = (url) => !url || url.includes('your-project.supabase.co');

const realClient = isPlaceholderUrl(defaultUrl) ? null : createClient(defaultUrl, defaultKey);

const syncChannel = typeof window !== 'undefined' && window.BroadcastChannel ? new BroadcastChannel('vku_survey_sync_channel') : null;

const getRegisteredUsers = () => {
  try {
    return JSON.parse(localStorage.getItem('vku_registered_users') || '{}');
  } catch (e) {
    return {};
  }
};

const saveCloudProfile = (email, role, password) => {
  if (!email) return;
  const local = getRegisteredUsers();
  local[email.toLowerCase()] = { email, role, password };
  localStorage.setItem('vku_registered_users', JSON.stringify(local));
  saveUserRole(email, role);
  notifySync('PROFILE_UPDATED');
};

export const registerLocalUser = (email, role, password) => {
  saveCloudProfile(email, role, password);
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
  roles[email.toLowerCase()] = role;
  localStorage.setItem('vku_user_roles', JSON.stringify(roles));
};

export const getUserRoleByEmail = (identifier) => {
  if (!identifier) return 'student';
  const roles = getSavedRoles();
  const lower = identifier.toLowerCase();
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
  for (const item of primaryList) {
    if (!item) continue;
    const k = item.id || (item.title + '_' + item.created_at) || JSON.stringify(item);
    map.set(String(k), item);
  }
  for (const item of secondaryList) {
    if (!item) continue;
    const k = item.id || (item.title + '_' + item.created_at) || JSON.stringify(item);
    if (!map.has(String(k))) {
      map.set(String(k), item);
    }
  }
  return Array.from(map.values());
};

const notifySync = (type) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type });
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
};

const sendCloudRelaySync = async (payload) => {
  if (!navigator.onLine) return;
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
};

export const sendFullCloudSync = async (isTeacherUpdate = false) => {
  if (!navigator.onLine) return;
  try {
    const localRequests = getLocalStorageBackup('vku_shared_survey_requests');
    const localInspections = getLocalStorageBackup('vku_shared_inspections');
    let dexieReqs = [];
    let dexieInsps = [];
    try { dexieReqs = await db.survey_requests.toArray(); } catch (e) {}
    try { dexieInsps = await db.cloud_inspections.toArray(); } catch (e) {}

    const allRequests = mergeItems(localRequests, dexieReqs);
    const allInspections = mergeItems(localInspections, dexieInsps);

    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'FULL_SYNC',
        payload: {
          survey_requests: allRequests,
          inspections: allInspections,
          is_teacher_update: isTeacherUpdate
        }
      })
    });
  } catch (e) {}
};

const pullCloudRelaySync = async () => {
  if (!navigator.onLine) return;
  try {
    const res = await fetch('/api/sync');
    if (!res.ok) return;
    const store = await res.json();
    let updated = false;

    if (store && Array.isArray(store.survey_requests) && store.survey_requests.length > 0) {
      const currentLocal = getLocalStorageBackup('vku_shared_survey_requests');
      const merged = mergeItems(store.survey_requests, currentLocal);
      saveLocalStorageBackup('vku_shared_survey_requests', merged);
      for (const req of merged) {
        try { await db.survey_requests.put(req); } catch (e) {}
      }
      if (merged.length !== currentLocal.length || store.survey_requests.length > currentLocal.length) {
        updated = true;
      }
    }

    if (store && Array.isArray(store.inspections) && store.inspections.length > 0) {
      const currentLocal = getLocalStorageBackup('vku_shared_inspections');
      const merged = mergeItems(store.inspections, currentLocal);
      saveLocalStorageBackup('vku_shared_inspections', merged);
      for (const insp of merged) {
        try { await db.cloud_inspections.put(insp); } catch (e) {}
      }
      if (merged.length !== currentLocal.length || store.inspections.length > currentLocal.length) {
        updated = true;
      }
    }

    if (updated) {
      notifySync('CLOUD_SYNC_UPDATED');
    }
  } catch (e) {}
};

if (typeof window !== 'undefined') {
  setInterval(pullCloudRelaySync, 2000);
  setInterval(() => sendFullCloudSync(false), 4000);
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
        const role = getUserRoleByEmail(emailCond.val);
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
      const registered = getRegisteredUser(email);
      if (!registered) {
        return {
          data: { user: null },
          error: new Error('Tài khoản chưa được đăng ký! Vui lòng chọn "Chưa có tài khoản? Đăng ký ngay" phía dưới.')
        };
      }
      if (password && registered.password && registered.password !== password) {
        return {
          data: { user: null },
          error: new Error('Mật khẩu không chính xác! Vui lòng kiểm tra lại.')
        };
      }
      return { data: { user: { id: 'user-' + email.split('@')[0], email } }, error: null };
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
          await sendFullCloudSync(true);
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
          await sendFullCloudSync(false);
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
              sendCloudRelaySync({ type: 'DELETE_REQUEST', id: val });
              notifySync('REQUEST_DELETED');
              await sendFullCloudSync(true);
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
              sendCloudRelaySync({ type: 'DELETE_INSPECTION', id: val });
              notifySync('INSPECTION_DELETED');
              await sendFullCloudSync(false);
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
