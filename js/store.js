// Storage: instant local cache (localStorage) + background sync to Supabase.
// Works offline; unsynced changes are retried when the connection returns.

const CFG = window.UKMPPD_CONFIG || {};
const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !CFG.supabaseUrl.includes('YOUR-PROJECT'));

const now = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'e' + Date.now() + Math.random().toString(16).slice(2));

const listeners = new Set();
let sb = null;            // supabase client
let user = null;          // supabase user or null
let mode = configured ? 'cloud' : 'local';
let state = blank();
let dirty = { days: new Set(), errors: new Set(), settings: false };
let pushTimer = null;
let syncStatus = 'idle';  // idle | syncing | offline | error | local

function blank() { return { days: {}, errors: {}, settings: { data: {}, updated_at: null } }; }
const key = () => `ukmppd.v1.${user ? user.id : 'local'}`;
const dkey = () => `ukmppd.dirty.${user ? user.id : 'local'}`;

function load() {
  try { state = JSON.parse(localStorage.getItem(key())) || blank(); } catch { state = blank(); }
  if (!state.settings) state.settings = { data: {}, updated_at: null };
  try {
    const d = JSON.parse(localStorage.getItem(dkey())) || {};
    dirty = { days: new Set(d.days || []), errors: new Set(d.errors || []), settings: !!d.settings };
  } catch { dirty = { days: new Set(), errors: new Set(), settings: false }; }
}
function save() {
  try {
    localStorage.setItem(key(), JSON.stringify(state));
    localStorage.setItem(dkey(), JSON.stringify({ days: [...dirty.days], errors: [...dirty.errors], settings: dirty.settings }));
  } catch (e) { console.warn('Local save failed', e); }
}
function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }
function setStatus(s) { if (s !== syncStatus) { syncStatus = s; emit(); } }

// ---------- public API ----------
export const store = {
  get configured() { return configured; },
  get mode() { return mode; },
  get user() { return user; },
  get status() { return mode === 'local' ? 'local' : syncStatus; },
  get pending() { return dirty.days.size + dirty.errors.size + (dirty.settings ? 1 : 0); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async init() {
    if (!configured || !window.supabase) { mode = 'local'; load(); return { needsSignIn: false }; }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    if (localStorage.getItem('ukmppd.localMode') === '1' && !user) { mode = 'local'; load(); return { needsSignIn: false }; }
    sb.auth.onAuthStateChange((_evt, session) => {
      const next = session ? session.user : null;
      if ((next && next.id) !== (user && user.id)) { user = next; load(); emit(); if (user) store.sync(); }
    });
    wire();
    if (!user) return { needsSignIn: true };
    load();
    store.sync();
    return { needsSignIn: false };
  },

  async signInPassword(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user; load(); mode = 'cloud'; store.sync(); emit();
  },
  async sendCode(email) {
    const redirect = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
    if (error) throw error;
  },
  async verifyCode(email, token) {
    const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    user = data.user; load(); mode = 'cloud'; store.sync(); emit();
  },
  useLocalOnly() { localStorage.setItem('ukmppd.localMode', '1'); mode = 'local'; user = null; load(); emit(); },
  async signOut() {
    localStorage.removeItem('ukmppd.localMode');
    if (sb) await sb.auth.signOut();
    user = null; location.reload();
  },

  // ----- reads -----
  day(date) { return (state.days[date] && state.days[date].data) || {}; },
  allDays() { return Object.fromEntries(Object.entries(state.days).map(([k, v]) => [k, v.data])); },
  errors() { return Object.entries(state.errors).filter(([, v]) => !v.deleted).map(([id, v]) => ({ id, ...v.data })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || '')); },
  settings() { return state.settings.data || {}; },

  // ----- writes -----
  updateDay(date, patch) {
    const cur = this.day(date);
    state.days[date] = { data: { ...cur, ...patch }, updated_at: now() };
    dirty.days.add(date); save(); emit(); schedulePush();
  },
  addError(item) {
    const id = uid();
    state.errors[id] = { data: { ...item, created: now() }, deleted: false, updated_at: now() };
    dirty.errors.add(id); save(); emit(); schedulePush(); return id;
  },
  updateError(id, patch) {
    const cur = state.errors[id]; if (!cur) return;
    state.errors[id] = { ...cur, data: { ...cur.data, ...patch }, updated_at: now() };
    dirty.errors.add(id); save(); emit(); schedulePush();
  },
  deleteError(id) {
    const cur = state.errors[id]; if (!cur) return;
    state.errors[id] = { ...cur, deleted: true, updated_at: now() };
    dirty.errors.add(id); save(); emit(); schedulePush();
  },
  updateSettings(patch) {
    state.settings = { data: { ...this.settings(), ...patch }, updated_at: now() };
    dirty.settings = true; save(); emit(); schedulePush();
  },

  exportJSON() { return JSON.stringify({ app: 'ukmppd-planner', version: 1, exported: now(), state }, null, 2); },
  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || obj.app !== 'ukmppd-planner' || !obj.state) throw new Error('This file is not a UKMPPD Planner export.');
    state = { ...blank(), ...obj.state };
    Object.keys(state.days).forEach((d) => { state.days[d].updated_at = now(); dirty.days.add(d); });
    Object.keys(state.errors).forEach((id) => { state.errors[id].updated_at = now(); dirty.errors.add(id); });
    state.settings.updated_at = now(); dirty.settings = true;
    save(); emit(); schedulePush();
  },
  async resetAll() {
    // Soft-reset: clear logs and errors everywhere, keep settings.
    const dates = Object.keys(state.days), ids = Object.keys(state.errors);
    if (sb && user && mode === 'cloud') {
      await sb.from('day_logs').delete().eq('user_id', user.id);
      await sb.from('error_items').delete().eq('user_id', user.id);
    }
    state.days = {}; state.errors = {};
    dates.forEach((d) => dirty.days.delete(d)); ids.forEach((i) => dirty.errors.delete(i));
    save(); emit();
  },

  async sync() { if (mode !== 'cloud' || !user) return; await store.pull(); await store.push(); },

  async pull() {
    if (!sb || !user) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      const [d, e, s] = await Promise.all([
        sb.from('day_logs').select('day,data,updated_at').eq('user_id', user.id),
        sb.from('error_items').select('id,data,deleted,updated_at').eq('user_id', user.id),
        sb.from('planner_settings').select('data,updated_at').eq('user_id', user.id).maybeSingle(),
      ]);
      if (d.error || e.error || s.error) throw d.error || e.error || s.error;
      for (const r of d.data) {
        const l = state.days[r.day];
        if (!l || (!dirty.days.has(r.day) && r.updated_at > (l.updated_at || '')) || (dirty.days.has(r.day) && r.updated_at > l.updated_at)) {
          state.days[r.day] = { data: r.data, updated_at: r.updated_at }; dirty.days.delete(r.day);
        }
      }
      for (const r of e.data) {
        const l = state.errors[r.id];
        if (!l || r.updated_at > (l.updated_at || '')) { state.errors[r.id] = { data: r.data, deleted: r.deleted, updated_at: r.updated_at }; dirty.errors.delete(r.id); }
      }
      if (s.data && s.data.updated_at > (state.settings.updated_at || '')) { state.settings = { data: s.data.data, updated_at: s.data.updated_at }; dirty.settings = false; }
      save(); setStatus('idle'); emit();
    } catch (err) { console.warn('Pull failed', err); setStatus('error'); }
  },

  async push() {
    if (!sb || !user || mode !== 'cloud') return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    if (!store.pending) return;
    setStatus('syncing');
    try {
      const days = [...dirty.days].map((day) => ({ user_id: user.id, day, data: state.days[day].data, updated_at: state.days[day].updated_at }));
      const errs = [...dirty.errors].map((id) => ({ user_id: user.id, id, data: state.errors[id].data, deleted: !!state.errors[id].deleted, updated_at: state.errors[id].updated_at }));
      if (days.length) { const { error } = await sb.from('day_logs').upsert(days, { onConflict: 'user_id,day' }); if (error) throw error; days.forEach((r) => dirty.days.delete(r.day)); }
      if (errs.length) { const { error } = await sb.from('error_items').upsert(errs, { onConflict: 'id' }); if (error) throw error; errs.forEach((r) => dirty.errors.delete(r.id)); }
      if (dirty.settings) {
        const { error } = await sb.from('planner_settings').upsert({ user_id: user.id, data: state.settings.data, updated_at: state.settings.updated_at }, { onConflict: 'user_id' });
        if (error) throw error; dirty.settings = false;
      }
      save(); setStatus('idle');
    } catch (err) { console.warn('Push failed', err); setStatus(navigator.onLine ? 'error' : 'offline'); }
  },
};

let wired = false;
function wire() {
  if (wired) return; wired = true;
  window.addEventListener('online', () => store.sync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') store.sync(); });
  setInterval(() => { if (store.pending) store.push(); }, 30000);
}

function schedulePush() {
  if (mode !== 'cloud') return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => store.push(), 1200);
}
