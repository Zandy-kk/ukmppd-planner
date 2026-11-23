import { buildPlan, materialize as mat, snapshotOf, SUBJECT, SUBJECTS, TIERS, tierOf, partLabel, label, monthName, addDays, diffDays, weekStart, parse, fmtH, TYPE_LABEL, DEFAULT_SETTINGS } from './schedule.js';
import { store } from './store.js';
import * as S from './stats.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const BANKS = ['Medsense', 'Mediko', 'UKDI', 'Other'];
const CATEGORIES = ['Knowledge gap', 'Diagnostic confusion', 'Management confusion', 'Vignette interpretation', 'Careless error', 'Changed answer'];

// "today" can be faked for previews with ?today=YYYY-MM-DD
function todayStr() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const I = {
  check: (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`,
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// ---------- plan ----------
let cache = { key: '', plan: [] };
const settings = () => ({ ...DEFAULT_SETTINGS, ...store.settings() });
function plan() {
  const st = settings();
  const logs = store.allDays();
  const weakest = S.weakestIds(logs, st.tiers || {});
  const k = JSON.stringify([st, weakest]);
  if (k !== cache.key) cache = { key: k, plan: buildPlan(st, { weakest }) };
  return cache.plan;
}
const materialize = (pd, log) => mat(pd, log, settings());
const dayOf = (date) => { const pd = plan().find((d) => d.date === date); return pd ? materialize(pd, store.day(date)) : null; };

// Every write to a day also stores what was planned, so later tier changes don't rewrite history.
function writeDay(date, patch) {
  const log = store.day(date);
  const extra = {};
  if (!log.snap) { const pd = plan().find((d) => d.date === date); if (pd) extra.snap = snapshotOf(pd); }
  store.updateDay(date, { ...extra, ...patch });
}

// ---------- UI state ----------
const ui = { draft: {}, err: { open: true, rewatch: false, subj: '' }, errDraft: {}, confirmReset: false, timer: null };
let toastTimer = null;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}

// ---------- shell ----------
function route() { const [view, arg] = location.hash.replace(/^#\/?/, '').split('/'); return { view: view || 'today', arg }; }
function syncBadge() {
  const s = store.status, p = store.pending;
  const map = { local: ['off', 'This device only'], syncing: ['busy', 'Syncing'], offline: ['warn', `Offline${p ? ` · ${p} waiting` : ''}`], error: ['warn', `Sync failed${p ? ` · ${p} waiting` : ''}`] };
  const [cls, txt] = map[s] || ['', p ? `${p} to sync` : 'Synced'];
  return `<span class="sync" title="${esc(txt)}"><span class="dot ${cls}"></span><span class="sync-label">${esc(txt)}</span></span>`;
}
function shell(view, body) {
  const items = [['today', 'Today', I.today], ['cal', 'Calendar', I.cal], ['stats', 'Stats', I.stats], ['errors', 'Errors', I.err]];
  const on = (v) => (view === v || (view === 'day' && v === 'cal') ? 'on' : '');
  return `<header class="top">
      <a class="brand" href="#today"><span class="logo">${I.check(16)}</span>UKMPPD Planner</a>
      <nav class="nav" aria-label="Main">${items.map(([v, l]) => `<a href="#${v}" class="${on(v)}">${l}</a>`).join('')}</nav>
      <div class="right">${syncBadge()}<a href="#settings" class="round ${view === 'settings' ? 'on' : ''}" aria-label="Settings">${I.gear}</a></div>
    </header>
    <main class="wrap">${body}</main>
    <nav class="tabbar" aria-label="Main">${items.map(([v, l, i]) => `<a href="#${v}" class="${on(v)}">${i}<span>${l}</span></a>`).join('')}</nav>`;
}

let pendingRender = false;
function render() {
  const a = document.activeElement;
  if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'file') { pendingRender = true; return; }
  pendingRender = false;
  const r = route();
  let body;
  try {
    body = r.view === 'day' ? viewDay(r.arg, false)
      : r.view === 'cal' ? viewCalendar()
      : r.view === 'stats' ? viewStats()
      : r.view === 'errors' ? viewErrors()
      : r.view === 'settings' ? viewSettings()
      : viewDay(todayStr(), true);
  } catch (e) { console.error(e); body = `<div class="card"><p class="note">Something went wrong showing this page: ${esc(e.message)}</p></div>`; }
  const y = window.scrollY;
  $app.innerHTML = shell(r.view, body);
  window.scrollTo(0, y);
  tickTimer();
}
$app.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) render(); }, 0));

// ---------- shared bits ----------
const tierChip = (id) => { const t = tierOf(id, settings().tiers); return `<span class="chip ${t}"><i></i>${TIERS[t]}</span>`; };
const accCls = (a) => (a === null || a === undefined ? '' : a >= 85 ? 'good' : a >= 70 ? 'warnc' : 'bad');
const typeDot = (d) => ({ lecture: 'var(--accent)', practice: 'var(--mai-dot)', review: 'var(--plum)', to: 'var(--accent-ink)', drill: 'var(--str-dot)', light: 'var(--line2)', taper: 'var(--pri-dot)', eve: 'var(--pri-dot)', exam: 'var(--pri)' }[d.type]);
const short = (id) => (SUBJECT[id] ? SUBJECT[id].short : id);
const code = (id) => (SUBJECT[id] ? SUBJECT[id].code : id);
function dayCode(d) {
  switch (d.type) {
    case 'lecture': return esc(code(d.lecture.id) + (SUBJECT[d.lecture.id].parts.length > 1 ? ' ' + (d.lecture.part + 1) : ''));
    case 'practice': return 'Practice';
    case 'review': case 'drill': return `${esc(code(d.subjects[0]))}<br>${esc(code(d.subjects[1]))}`;
    case 'to': return 'TO';
    case 'light': return 'Light';
    case 'taper': return d.subjects && d.subjects[0] ? esc(code(d.subjects[0])) : 'Mixed';
    case 'eve': return 'Eve';
    case 'exam': return 'EXAM';
  }
  return '';
}

// ---------- Today / day detail ----------
function viewDay(date, isToday) {
  const P = plan();
  const st = settings();
  const first = P[0].date, last = P[P.length - 1].date;
  let preview = false;
  if (isToday && date < first) { preview = true; date = first; }
  if (isToday && date > last) return viewAfter();
  const day = dayOf(date);
  if (!day) return `<div class="card"><p class="note">There's no plan for ${esc(date)}.</p><a class="btn" href="#cal">Back to calendar</a></div>`;
  const log = store.day(date);
  const live = isToday && !preview;
  const idx = P.findIndex((d) => d.date === date) + 1;
  const daysLeft = diffDays(live ? todayStr() : date, st.examDate);

  const heading = day.type === 'lecture' ? SUBJECT[day.lecture.id].name + (SUBJECT[day.lecture.id].parts.length > 1 ? ` · part ${day.lecture.part + 1}` : '')
    : day.type === 'review' || day.type === 'drill' ? `${short(day.subjects[0])} + ${short(day.subjects[1])}`
    : day.type === 'practice' ? (day.subjects.length ? `Practice · ${day.subjects.map(short).join(', ')}` : 'Practice + catch-up')
    : day.type === 'to' ? 'Full try-out' : day.type === 'light' ? 'Light day' : day.type === 'taper' ? (day.subjects[0] ? `Taper · ${short(day.subjects[0])}` : 'Taper · mixed') : day.type === 'eve' ? 'Exam eve' : 'Exam day';
  const tiers = [...new Set((day.subjects || []).map((s) => tierOf(s, st.tiers)))].sort((a, b) => 'PSM'.indexOf(a) - 'PSM'.indexOf(b)).map((t) => `<span class="chip ${t}"><i></i>${TIERS[t]}</span>`).join('');
  const chips = `${tiers}<span class="chip accent">${day.phase === 'Phase 1' ? 'Phase 1 · Material' : day.phase === 'Phase 2' ? 'Phase 2 · Practice' : day.phase}</span><span class="chip">${TYPE_LABEL[day.type]}${day.hours ? ' · ~' + fmtH(day.hours) : ''}</span>${day.ramadan ? '<span class="chip">Ramadan</span>' : ''}${day.partTime ? '<span class="chip">After 15:00</span>' : ''}`;
  const back = isToday ? '' : `<a href="#cal" class="btn" style="margin-bottom:10px">${I.back}Calendar</a>`;
  const hero = `${back}<section class="hero"><div>
      <div class="eyebrow">${label(date, { long: true })} · Day ${idx} of ${P.length}</div>
      <h1 class="h1">${esc(heading)}</h1><div class="chips">${chips}</div></div>
      <div class="count"><b>${Math.max(0, daysLeft)}</b><span>${daysLeft === 1 ? 'day' : 'days'} to CBT · ${label(st.examDate)}</span></div></section>`;
  const banner = preview ? `<div class="banner">Structured study starts ${label(first, { long: true })}. Here's day 1 so you know what's coming.</div>` : '';

  const main = planCard(day, log, live) + (live ? carryCard() : '') + (day.type === 'light' ? recapCard(date) : '');
  const side = (live ? suggestionCards() : '') + (preview || day.type === 'exam' ? '' : logCard(day, log) + checkinCard(day, log)) + weekCard(date) + (!isToday ? changeDayCard(day) : '');
  return `${hero}${banner}<div class="grid"><div class="col">${main}</div><aside class="col" aria-label="Log and week">${side}</aside></div>`;
}

function planCard(day, log, live) {
  if (day.type === 'exam') return `<section class="card"><div class="ttl">Exam day</div><p class="note">Brief warm-up only if it helps. Read the stem, commit, discriminate, move on. Good luck.</p></section>`;
  const req = S.required(day);
  const doneReq = req.filter((s) => S.isDone(log, s.key)).length;
  const h = S.hoursDone(day, log);
  const pctDone = day.hours ? Math.min(100, Math.round((h / day.hours) * 100)) : 0;
  const nowKey = live ? (day.steps.find((s) => !S.isDone(log, s.key) && !s.optional) || {}).key : null;
  const errs = store.errors();
  const rows = day.steps.map((s) => {
    const done = S.isDone(log, s.key);
    let extra = '';
    if (s.kind === 'rewatch') {
      const items = errs.filter((e) => e.rewatch && !e.closed && e.subj === s.subj);
      extra = items.length ? `<ul class="rw">${items.slice(0, 4).map((e) => `<li>${esc(e.note)}</li>`).join('')}${items.length > 4 ? `<li>+${items.length - 4} more in Errors</li>` : ''}</ul>` : '<div class="sd">No flagged items yet. Skim the lecture chapters you found hardest.</div>';
    }
    if (live && (s.kind === 'practice' || s.kind === 'to') && !done) {
      const mins = s.kind === 'to' ? settings().toMinutes : Math.round(s.hours * 60);
      const running = ui.timer && ui.timer.key === s.key;
      extra += `<div class="inline"><button class="btn p" data-act="logfor" data-date="${day.date}" data-subj="${s.subj || ''}" data-kind="${s.kind === 'to' ? 'to' : 'set'}">Log result</button><button class="btn" data-act="timer" data-key="${s.key}" data-min="${mins}">${running ? `<span class="timer" id="timer-left">--:--</span> · Stop` : `Start ${mins}-min timer`}</button></div>`;
    }
    return `<div class="step ${done ? 'done' : ''} ${s.key === nowKey ? 'now' : ''}">
      <button class="ck" data-act="step" data-date="${day.date}" data-key="${esc(s.key)}" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(s.title)}"><i>${done ? I.check() : ''}</i></button>
      <div><div class="st">${esc(s.title)}${s.optional ? '<span class="opt">optional</span>' : ''}</div><div class="sd">${esc(s.detail)}</div>${extra}</div>
      <span class="dur">${s.kind === 'anki' && day.targets.anki ? day.targets.anki + ' cards' : '~' + fmtH(s.hours)}</span></div>`;
  }).join('');
  return `<section class="card" aria-label="Today's plan">
    <div class="card-h"><span class="ttl">${live ? "Today's plan" : 'Plan'}</span><span class="meta">${doneReq} of ${req.length} done · ${fmtH(h)} logged</span></div>
    <div class="bar" aria-hidden="true"><i style="width:${pctDone}%"></i></div>
    <div class="steps">${rows}</div></section>`;
}

function carryCard() {
  const today = todayStr();
  const items = S.carryOver(plan(), store.allDays(), today, materialize);
  if (!items.length) return '';
  const best = S.nextCatchUp(plan(), today);
  return `<section class="card" aria-label="Carried over">
    <div class="card-h"><span class="ttl">Carried over · ${items.length}</span><span class="meta">${best ? `Best fit: ${best === today ? 'today' : label(best)}` : ''}</span></div>
    <div class="list">${items.map((it) => `<div class="li"><button class="ck" style="margin:-4px 0 -4px -10px" data-act="carrydone" data-date="${it.date}" data-key="${esc(it.key)}" aria-label="Mark done: ${esc(it.title)}"><i></i></button>
      <span class="grow"><b style="font-weight:600">${esc(it.title)}</b><br><span class="meta">from ${label(it.date)} · ~${fmtH(it.hours)}</span></span>
      <button class="x" data-act="carrydrop" data-date="${it.date}" data-key="${esc(it.key)}" aria-label="Drop: ${esc(it.title)}">${I.x}</button></div>`).join('')}</div></section>`;
}

function recapCard(date) {
  const wkDate = addDays(date, -1) >= plan()[0].date ? addDays(date, -1) : date;
  const r = S.weekSummary(plan(), store.allDays(), wkDate, todayStr(), materialize, store.errors());
  const weak = r.weakest.length ? r.weakest.map((w) => `<span class="chip ${tierOf(w.id, settings().tiers)}"><i></i>${esc(short(w.id))} · ${Math.round(w.acc)}%</span>`).join('') : '<span class="meta">Log a few sets to see your weakest subjects.</span>';
  return `<section class="card" aria-label="Weekly recap">
    <div class="card-h"><span class="ttl">Weekly recap</span><span class="meta">${label(r.ws)} – ${label(r.we)}</span></div>
    <div class="minis"><div class="mini"><span>Questions</span><b>${r.q}</b></div><div class="mini"><span>Accuracy</span><b class="${accCls(r.acc)}">${r.acc === null ? '—' : Math.round(r.acc) + '%'}</b></div><div class="mini"><span>Hours</span><b>${Math.round(r.hours)}</b></div></div>
    <div class="minis"><div class="mini"><span>Steps done</span><b>${r.adherence === null ? '—' : r.adherence + '%'}</b></div><div class="mini"><span>TOs</span><b>${r.tos}<small> / ${r.tosPlanned}</small></b></div><div class="mini"><span>To rewatch</span><b>${r.rewatchOpen}</b></div></div>
    <div><div class="meta" style="margin-bottom:6px">Weakest this week · pick next week's repair targets from here</div><div class="chips">${weak}</div></div></section>`;
}

function logCard(day, log) {
  const st = settings();
  const d = ui.draft[day.date] || (ui.draft[day.date] = {});
  if (d.kind === undefined) d.kind = day.type === 'to' ? 'to' : 'set';
  if (d.subj === undefined) d.subj = (day.subjects && day.subjects[0]) || '';
  const isTO = d.kind === 'to';
  const choices = (day.subjects || []).filter((s, i, a) => a.indexOf(s) === i);
  const subj = isTO ? '' : `<div class="f"><label>Subject</label><div class="pills">${choices.map((s) => `<button class="pill ${d.subj === s ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="subj" data-v="${s}">${esc(short(s))}</button>`).join('')}<button class="pill ${!choices.includes(d.subj) ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="subj" data-v="">${choices.length ? 'Other' : 'Mixed'}</button></div></div>
    ${!choices.includes(d.subj) ? `<div class="f"><label for="so-${day.date}">Which subject</label><select id="so-${day.date}" data-in="subjOther" data-date="${day.date}"><option value="">Mixed</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${d.subjOther === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}`;
  const sets = S.daySets(log);
  const t = S.dayTotals(log);
  const list = sets.length ? `<div class="list">${sets.map((s, i) => `<div class="li"><span class="grow"><b>${s.c}/${s.q}</b> · ${S.pct(+s.c, +s.q)}% · ${s.kind === 'to' ? 'TO' : esc(s.subj ? short(s.subj) : 'Mixed')}${s.bank ? ' · ' + esc(s.bank) : ''}</span><button class="x" data-act="delset" data-date="${day.date}" data-i="${i}" aria-label="Remove this entry">${I.x}</button></div>`).join('')}</div>` : '';
  return `<section class="card" id="logcard" aria-label="Log questions">
    <div class="card-h"><span class="ttl">${isTO ? 'Log TO score' : 'Log practice'}</span><div class="pills"><button class="pill ${!isTO ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="kind" data-v="set">Set</button><button class="pill ${isTO ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="kind" data-v="to">TO</button></div></div>
    <div class="fields">
      <div class="f"><label for="q-${day.date}">Questions</label><input id="q-${day.date}" inputmode="numeric" data-in="q" data-date="${day.date}" value="${esc(d.q ?? '')}" placeholder="${isTO ? st.toQuestions : '60'}"></div>
      <div class="f"><label for="c-${day.date}">Correct</label><input id="c-${day.date}" inputmode="numeric" data-in="c" data-date="${day.date}" value="${esc(d.c ?? '')}" placeholder="0"></div>
    </div>
    ${subj}
    <div class="f"><label>Source (optional)</label><div class="pills">${BANKS.map((b) => `<button class="pill ${d.bank === b ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="bank" data-v="${b}">${b}</button>`).join('')}</div></div>
    <button class="btn p wide" data-act="addset" data-date="${day.date}">Save</button>
    <div class="minis"><div class="mini"><span>Questions</span><b>${t.q}<small> / ${day.targets.q[1] || '—'}</small></b></div><div class="mini"><span>Accuracy</span><b class="${accCls(t.acc)}">${t.acc === null ? '—' : Math.round(t.acc) + '%'}</b></div><div class="mini"><span>Anki</span><b>${+log.anki || 0}</b></div></div>
    ${list}</section>`;
}

function checkinCard(day, log) {
  const e = +log.energy || 0;
  return `<section class="card" aria-label="Anki and energy">
    <div class="f"><label for="anki-${day.date}">Anki cards done${day.targets.anki ? ` · target ${day.targets.anki}` : ''} (${esc(day.targets.ankiNote)})</label><input id="anki-${day.date}" inputmode="numeric" data-in="anki" data-date="${day.date}" value="${log.anki ?? ''}" placeholder="0"></div>
    <details ${+log.backlog ? 'open' : ''}><summary>+ Due backlog left over (only if there is one)</summary>
      <div class="f" style="margin-top:8px"><label for="bl-${day.date}">Cards still due</label><input id="bl-${day.date}" inputmode="numeric" data-in="backlog" data-date="${day.date}" value="${log.backlog ?? ''}" placeholder="0"></div></details>
    <div class="card-h"><span class="ttl" style="font-size:17px">Energy</span><span class="meta">1 = drained · 5 = sharp</span></div>
    <div class="seg" role="group" aria-label="Energy 1 to 5">${[1, 2, 3, 4, 5].map((n) => `<button class="${e === n ? 'on' : ''}" data-act="energy" data-date="${day.date}" data-v="${n}" aria-pressed="${e === n}">${n}</button>`).join('')}</div>
  </section>`;
}

function weekCard(date) {
  const ws = weekStart(date);
  const P = plan(); const logs = store.allDays();
  const cells = Array.from({ length: 7 }, (_, i) => {
    const dt = addDays(ws, i); const pd = P.find((x) => x.date === dt);
    if (!pd) return `<div class="wd"><span>${label(dt).slice(0, 3)}</span><b>—</b></div>`;
    const d = materialize(pd, logs[dt]);
    const c = d.type === 'practice' ? 'Prac' : dayCode(d).replace('<br>', ' + ');
    return `<a class="wd ${dt === date ? 'today' : ''}" href="#day/${dt}" aria-label="${label(dt)}: ${esc(d.title)}"><span>${label(dt).slice(0, 3)}</span><b>${d.type === 'review' || d.type === 'drill' ? esc(code(d.subjects[0])) : c}</b><i style="background:${typeDot(d)}"></i></a>`;
  }).join('');
  return `<section class="card" aria-label="This week"><div class="card-h"><span class="ttl">This week</span><span class="meta">${label(ws)} – ${label(addDays(ws, 6))}</span></div><div class="week">${cells}</div></section>`;
}

function suggestionCards() {
  const list = S.suggestions(plan(), store.allDays(), settings(), todayStr(), materialize).slice(0, 2);
  return list.map((s) => `<section class="card sugg" aria-label="Suggestion">
    <div class="eyebrow"><span class="dot ${s.tone === 'warn' ? 'warn' : ''}"></span>Suggestion</div>
    <p>${s.text}</p>
    <div class="row"><button class="btn p" data-act="accept" data-key="${esc(s.key)}">${s.accept.kind === 'ack' ? 'Got it' : 'Accept'}</button>${s.accept.kind === 'ack' ? '' : `<button class="btn" data-act="dismiss" data-key="${esc(s.key)}">Not now</button>`}</div></section>`).join('');
}

function changeDayCard(day) {
  if (!['to', 'drill', 'light'].includes(day.type) || day.phase !== 'Phase 2' || day.date < todayStr()) return '';
  const ov = (settings().overrides || {})[day.date];
  const sel = day.type === 'drill' ? ['s1', 's2'].map((k, i) => `<div class="f"><label for="${k}-${day.date}">Drill subject ${i + 1}</label><select id="${k}-${day.date}" data-in="ov-${k}" data-date="${day.date}">${SUBJECTS.map((s) => `<option value="${s.id}" ${day.subjects[i] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`).join('') : '';
  return `<section class="card" aria-label="Change this day"><span class="ttl">Change this day</span>
    <div class="pills">${[['to', 'TO day'], ['drill', 'Drill day'], ['light', 'Light']].map(([t, l]) => `<button class="pill ${day.type === t ? 'on' : ''}" data-act="ovtype" data-date="${day.date}" data-v="${t}">${l}</button>`).join('')}</div>
    ${sel}${ov ? `<button class="btn" data-act="ovreset" data-date="${day.date}">Reset to the original plan</button>` : ''}</section>`;
}

function viewAfter() {
  const st = settings(); const tos = S.toResults(store.allDays());
  return `<section class="hero"><div><div class="eyebrow">After the exam</div><h1 class="h1">The plan ended ${label(st.examDate, { long: true })}</h1></div></section>
    <section class="card"><p class="note">You logged ${tos.length} TOs${tos.length ? `, last score ${tos[tos.length - 1].acc}%` : ''}. If your exam date moved, change it in <a href="#settings">Settings</a> and the plan rebuilds.</p></section>`;
}

// ---------- Calendar ----------
function viewCalendar() {
  const P = plan(); const logs = store.allDays(); const today = todayStr();
  const months = [...new Set(P.map((d) => d.date.slice(0, 7)))];
  const body = months.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    const firstDow = (parse(`${m}-01`).getUTCDay() + 6) % 7;
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dh">${d}</div>`).join('');
    for (let i = 0; i < firstDow; i++) cells += '<div class="cell empty"></div>';
    for (let n = 1; n <= dim; n++) {
      const date = `${m}-${pad(n)}`; const pd = P.find((x) => x.date === date);
      if (!pd) { cells += `<div class="cell empty"><span class="n">${n}</span></div>`; continue; }
      const lg = logs[date] || {}; const d = materialize(pd, lg);
      const ok = lg.done && Object.values(lg.done).some(Boolean);
      cells += `<a class="cell t-${d.type} ${date === today ? 'today' : ''} ${date < today ? 'past' : ''}" href="#day/${date}" aria-label="${label(date)}: ${esc(d.title)}"><span class="n">${n}</span><span class="c">${dayCode(d)}</span>${ok ? '<span class="ok" aria-hidden="true"></span>' : ''}</a>`;
    }
    return `<section class="card"><span class="ttl">${monthName(mo - 1)} ${y}</span><div class="cal">${cells}</div></section>`;
  }).join('');
  const c = P.reduce((a, d) => { a[d.type] = (a[d.type] || 0) + 1; return a; }, {});
  const lg = (cls, txt) => `<span class="chip"><span class="sw ${cls}"></span>${txt}</span>`;
  const legend = `<div class="legend">${lg('t-lecture', `Lecture ${c.lecture || 0}`)}${lg('t-practice', `Practice ${c.practice || 0}`)}${lg('t-review', `Review ${c.review || 0}`)}${lg('t-to', `TO ${c.to || 0}`)}${lg('t-drill', `Drill ${c.drill || 0}`)}${lg('t-light" style="border:1px solid var(--line2)', `Light ${c.light || 0}`)}${lg('t-taper', 'Taper')}<span class="chip"><span class="dot"></span>Logged</span></div>`;
  return `<section class="hero"><div><div class="eyebrow">Calendar</div><h1 class="h1">${P.length} days</h1><div class="meta" style="margin-bottom:12px">${label(P[0].date, { long: true })} → ${label(P[P.length - 1].date, { long: true })}</div>${legend}</div></section><div class="months">${body}</div>`;
}

// ---------- Stats ----------
function viewStats() {
  const P = plan(); const logs = store.allDays(); const today = todayStr(); const st = settings();
  const ref = today < P[0].date ? P[0].date : today;
  const wk = S.weekSummary(P, logs, ref, today, materialize, store.errors());
  const all = S.allSets(logs).filter((s) => s.kind !== 'to');
  const totQ = all.reduce((n, s) => n + (+s.q || 0), 0), totC = all.reduce((n, s) => n + (+s.c || 0), 0);
  const tos = S.toResults(logs);
  const lp = S.lectureProgress(P, logs);
  const subj = S.subjectStats(logs, st.tiers).sort((a, b) => (a.rolling ?? a.acc ?? 101) - (b.rolling ?? b.acc ?? 101));
  const errs = store.errors();

  const kpis = `<div class="kpis">
    <div class="kpi"><span>Hours this week</span><b>${Math.round(wk.hours)}</b><em>${wk.adherence === null ? 'no steps yet' : wk.adherence + '% of steps done'}</em></div>
    <div class="kpi"><span>Questions this week</span><b>${wk.q}</b><em>${wk.acc === null ? 'no sets yet' : Math.round(wk.acc) + '% correct'}</em></div>
    <div class="kpi"><span>TOs done</span><b>${tos.length}<small> / ${P.filter((d) => d.type === 'to').length}</small></b><em>${tos.length ? 'last ' + tos[tos.length - 1].acc + '%' : 'none yet'}</em></div>
    <div class="kpi"><span>Lectures watched</span><b>${lp.done}<small> / ${lp.total}</small></b><em>${fmtH(lp.hoursDone)} of ${fmtH(lp.hoursTotal)}</em></div></div>`;
  const toChart = tos.length ? lineChart(tos.map((t) => ({ x: label(t.date), y: t.acc }))) : '<div class="empty">Your TO scores appear here, with lines at your 92 target and the 66.4% pass mark.</div>';
  const series = S.weeklySeries(P, logs, today).filter((w) => w.q > 0);
  const wkChart = series.length ? barChart(series.map((w) => ({ x: label(w.ws).replace(/^\w+ /, ''), y: w.acc }))) : '<div class="empty">Weekly accuracy from your practice sets (TOs excluded) appears here.</div>';
  const lec = `<div class="lec">${Object.values(lp.bySubj).map((b) => `<div class="li"><span class="grow">${esc(short(b.id))}</span><span class="parts" aria-label="${b.done} of ${b.parts.length} parts">${b.parts.map((p) => `<i class="${p.done ? 'on' : ''}"></i>`).join('')}</span></div>`).join('')}</div>`;
  const rows = subj.map((s) => {
    const a = s.rolling ?? s.acc;
    const color = a === null ? 'var(--line2)' : a >= 85 ? 'var(--mai-dot)' : a >= 70 ? 'var(--str-dot)' : 'var(--pri-dot)';
    return `<tr><td>${esc(SUBJECT[s.id].name)}<div class="sbar"><i style="width:${a ?? 0}%;background:${color}"></i></div></td><td>${tierChip(s.id)}</td><td class="num hide-sm">${s.q}</td><td class="num hide-sm">${s.acc === null ? '—' : Math.round(s.acc) + '%'}</td><td class="num"><b>${s.rolling === null ? '—' : Math.round(s.rolling) + '%'}</b></td></tr>`;
  }).join('');
  const cats = CATEGORIES.map((c) => [c, errs.filter((e) => e.cat === c).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  const catHtml = cats.length ? `<div class="list">${cats.map(([c, n]) => `<div class="li" style="padding-right:14px"><span class="grow">${esc(c)}</span><b>${n}</b></div>`).join('')}</div>` : '<div class="empty">Error categories show up once you log misses.</div>';

  return `<section class="hero"><div><div class="eyebrow">Stats · week of ${label(wk.ws)}</div><h1 class="h1">How it's going</h1></div></section>
    <div class="col">${kpis}
    <div class="grid even"><section class="card"><span class="ttl">TO scores</span>${toChart}</section><section class="card"><span class="ttl">Weekly accuracy · practice sets</span>${wkChart}</section></div>
    <div class="grid even"><section class="card"><div class="card-h"><span class="ttl">Lecture progress</span><span class="meta">${lp.done} of ${lp.total} parts</span></div>${lec}</section>${recapCard(ref)}</div>
    <section class="card"><div class="card-h"><span class="ttl">Subjects · weakest first</span><span class="meta">Rolling = last 4 sets</span></div>
      <div class="tablewrap"><table><thead><tr><th>Subject</th><th>Tier</th><th class="num hide-sm">Q</th><th class="num hide-sm">All</th><th class="num">Rolling</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="card"><div class="card-h"><span class="ttl">Error categories</span><span class="meta">${errs.length} logged</span></div>${catHtml}</section></div>`;
}

function lineChart(pts) {
  const W = 480, H = 230, L = 34, R = 12, T = 16, B = 28, y0 = 40, y1 = 100;
  const sx = (i) => (pts.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const sy = (v) => T + ((y1 - Math.max(y0, Math.min(y1, v))) * (H - T - B)) / (y1 - y0);
  const grid = [40, 60, 80, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const ref = `<line x1="${L}" x2="${W - R}" y1="${sy(S.TARGET)}" y2="${sy(S.TARGET)}" stroke="var(--accent)" stroke-dasharray="5 4"/><text x="${W - R}" y="${sy(S.TARGET) - 6}" text-anchor="end">target 92</text>
    <line x1="${L}" x2="${W - R}" y1="${sy(S.PASS_MARK)}" y2="${sy(S.PASS_MARK)}" stroke="var(--pri-dot)" stroke-dasharray="5 4"/><text x="${W - R}" y="${sy(S.PASS_MARK) - 6}" text-anchor="end">pass mark 66.4 (Feb 2026)</text>`;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(p.y)}`).join(' ');
  const area = pts.length > 1 ? `<path d="${path} L${sx(pts.length - 1)},${sy(y0)} L${sx(0)},${sy(y0)} Z" fill="var(--accent)" opacity="0.07"/>` : '';
  const step = Math.ceil(pts.length / 4);
  const xl = pts.map((p, i) => (i % step === 0 || i === pts.length - 1 ? `<text x="${sx(i)}" y="${H - 8}" text-anchor="${pts.length > 1 && i === pts.length - 1 ? 'end' : pts.length > 1 && i === 0 ? 'start' : 'middle'}">${esc(p.x.replace(/^\w+ /, ''))}</text>` : '')).join('');
  const dots = pts.map((p, i) => `<circle cx="${sx(i)}" cy="${sy(p.y)}" r="${i === pts.length - 1 ? 5 : 3}" fill="var(--accent)"/>`).join('');
  const lp = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="TO scores, latest ${lp.y}%">${grid}${ref}${area}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}<text x="${sx(pts.length - 1)}" y="${sy(lp.y) - 10}" text-anchor="${pts.length > 1 ? 'end' : 'middle'}" style="fill:var(--ink);font-weight:700">${lp.y}</text>${xl}</svg>`;
}
function barChart(pts) {
  const W = 480, H = 230, L = 34, R = 12, T = 20, B = 28;
  const sy = (v) => T + ((100 - v) * (H - T - B)) / 100;
  const bw = Math.min(44, ((W - L - R) / pts.length) * 0.6);
  const sx = (i) => L + ((i + 0.5) * (W - L - R)) / pts.length;
  const grid = [0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const bars = pts.map((p, i) => `<rect x="${sx(i) - bw / 2}" y="${sy(p.y)}" width="${bw}" height="${sy(0) - sy(p.y)}" rx="5" fill="var(--accent)" opacity="${i === pts.length - 1 ? 1 : 0.45}"/><text x="${sx(i)}" y="${sy(p.y) - 6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${Math.round(p.y)}</text><text x="${sx(i)}" y="${H - 8}" text-anchor="middle">${esc(p.x)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly accuracy">${grid}<line x1="${L}" x2="${W - R}" y1="${sy(S.TARGET)}" y2="${sy(S.TARGET)}" stroke="var(--accent)" stroke-dasharray="5 4"/>${bars}</svg>`;
}

// ---------- Errors ----------
function viewErrors() {
  const all = store.errors(); const f = ui.err; const d = ui.errDraft;
  if (d.subj === undefined) { const t = dayOf(todayStr()); d.subj = (t && t.subjects && t.subjects[0]) || ''; }
  const list = all.filter((e) => (!f.open || !e.closed) && (!f.rewatch || e.rewatch) && (!f.subj || e.subj === f.subj));
  const open = all.filter((e) => !e.closed).length, rw = all.filter((e) => e.rewatch && !e.closed).length;
  const form = `<section class="card" aria-label="Log a miss"><span class="ttl">Log a miss</span>
    <div class="f"><label for="err-note">The rule that would have got it right (one line)</label><input id="err-note" data-in="errNote" value="${esc(d.note || '')}" placeholder="e.g. Pityriasis rosea: herald patch first, then Christmas-tree pattern"></div>
    <div class="row"><div class="f"><label for="err-subj">Subject</label><select id="err-subj" data-in="errSubj"><option value="">—</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${d.subj === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="f"><label for="err-cat">Category</label><select id="err-cat" data-in="errCat">${CATEGORIES.map((c) => `<option ${d.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
    <button class="flag ${d.rewatch ? 'on' : ''}" style="align-self:flex-start;min-height:36px" data-act="errdraftrw" aria-pressed="${!!d.rewatch}">${d.rewatch ? '✓ ' : ''}Rewatch this concept</button>
    <p class="meta" style="margin:0">Flagged items show up on that subject's next review day.</p>
    <button class="btn p wide" data-act="adderr">Add to error log</button></section>`;
  const filters = `<div class="row" style="align-items:center"><div class="pills">
      <button class="pill ${f.open ? 'on' : ''}" data-act="errf" data-k="open" data-v="1">Open</button><button class="pill ${!f.open ? 'on' : ''}" data-act="errf" data-k="open" data-v="0">All</button>
      <button class="pill ${f.rewatch ? 'on' : ''}" data-act="errf" data-k="rewatch" data-v="${f.rewatch ? '0' : '1'}">Rewatch · ${rw}</button></div>
    <div class="f"><label for="err-filter" class="hidden">Filter by subject</label><select id="err-filter" data-in="errFilterSubj"><option value="">All subjects</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${f.subj === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>`;
  const items = list.length ? list.map((e) => `<div class="err ${e.closed ? 'closed' : ''}">
      <button class="box" data-act="errtoggle" data-id="${e.id}" aria-pressed="${!!e.closed}" aria-label="${e.closed ? 'Reopen' : 'Mark understood'}"><i>${e.closed ? I.check() : ''}</i></button>
      <div class="body"><div class="txt">${esc(e.note || '(no note)')}</div>
      <div class="m">${e.subj ? tierChip(e.subj).replace(TIERS[tierOf(e.subj, settings().tiers)], esc(short(e.subj))) : ''}<span class="chip">${esc(e.cat || '')}</span><span>${e.date ? label(e.date) : ''}</span>
      <button class="flag ${e.rewatch ? 'on' : ''}" data-act="errrw" data-id="${e.id}" aria-pressed="${!!e.rewatch}">${e.rewatch ? 'Rewatch' : '+ Rewatch'}</button></div></div>
      <button class="x" data-act="errdel" data-id="${e.id}" aria-label="Delete">${I.x}</button></div>`).join('')
    : `<div class="empty">${all.length ? 'Nothing matches this filter.' : 'No misses logged yet. Add one line per miss: the rule that would have got it right.'}</div>`;
  return `<section class="hero"><div><div class="eyebrow">Error log</div><h1 class="h1">${open} open</h1><div class="chips"><span class="chip">${all.length - open} understood</span><span class="chip" style="background:var(--plum-bg);color:var(--plum)">${rw} to rewatch</span></div></div></section>
    <div class="grid"><div class="col"><section class="card" style="gap:10px">${filters}<div>${items}</div></section></div><aside class="col">${form}</aside></div>`;
}

// ---------- Settings ----------
function viewSettings() {
  const st = settings(); const P = plan();
  const c = P.reduce((a, d) => { a[d.type] = (a[d.type] || 0) + 1; return a; }, {});
  const acct = store.mode === 'cloud' && store.user
    ? `<p class="note">Signed in as <b>${esc(store.user.email)}</b> · ${syncBadge().replace('sync-label', '')}</p><div class="row"><button class="btn" data-act="syncnow">Sync now</button><button class="btn" data-act="signout">Sign out</button></div>`
    : store.configured ? `<p class="note">Using this device only. Sign in to sync your phone and laptop.</p><button class="btn p" data-act="signout">Sign in</button>`
      : `<div class="banner warn" style="margin:0">Supabase isn't connected, so data is saved on this device only. Add your Project URL and key to js/config.js.</div>`;
  const fld = (id, lbl, type, val) => `<div class="f"><label for="${id}">${lbl}</label><input id="${id}" type="${type}" data-in="set-${id}" value="${esc(val)}"></div>`;
  const tiers = SUBJECTS.map((s) => { const t = tierOf(s.id, st.tiers); return `<div class="tr"><span class="nm">${esc(s.name)}</span><span class="tseg" role="group" aria-label="${esc(s.name)} tier">${['P', 'S', 'M'].map((k) => `<button class="${t === k ? 'on ' + k : ''}" data-act="tier" data-id="${s.id}" data-v="${k}" aria-pressed="${t === k}">${TIERS[k]}</button>`).join('')}</span></div>`; }).join('');
  return `<section class="hero"><div><div class="eyebrow">Settings</div><h1 class="h1">Your plan</h1></div></section>
  <div class="grid even"><div class="col">
    <section class="card"><span class="ttl">Exam and phases</span>
      <div class="row">${fld('examDate', 'CBT exam date', 'date', st.examDate)}${fld('materialEnd', 'Lectures end', 'date', st.materialEnd)}</div>
      <div class="row">${fld('ramadanStart', 'Ramadan starts', 'date', st.ramadanStart)}${fld('ramadanEnd', 'Ramadan ends', 'date', st.ramadanEnd)}</div>
      <div class="row">${fld('toQuestions', 'TO questions', 'number', st.toQuestions)}${fld('toMinutes', 'TO minutes', 'number', st.toMinutes)}${fld('ankiTarget', 'Anki per day', 'number', st.ankiTarget)}</div>
      <p class="note">${P.length} days · ${c.lecture || 0} lecture · ${c.practice || 0} practice · ${c.review || 0} review · ${c.to || 0} TO · ${c.drill || 0} drill · ${c.light || 0} light · taper ${label(addDays(st.examDate, -6))} → ${label(addDays(st.examDate, -1))}</p>
      ${Object.keys(st.overrides || {}).length ? '<button class="btn" data-act="clearov">Undo all day changes</button>' : ''}</section>
    <section class="card"><div class="card-h"><span class="ttl">Subject tiers</span><span class="meta">Decides review and drill slots</span></div><div class="tiers">${tiers}</div></section>
  </div><div class="col">
    <section class="card"><span class="ttl">Account and sync</span>${acct}</section>
    <section class="card"><span class="ttl">Backup</span><p class="note">Download everything as a file, or restore from one.</p>
      <div class="row"><button class="btn" data-act="export">Export JSON</button><label class="btn" for="importfile">Import JSON</label><input id="importfile" type="file" accept="application/json,.json" class="hidden" data-in="import"></div></section>
    <section class="card"><span class="ttl">Reset</span><p class="note">Deletes all logged days and errors. Settings and tiers stay.</p>
      ${ui.confirmReset ? '<div class="row"><button class="btn danger" data-act="resetyes">Yes, delete all logs</button><button class="btn" data-act="resetno">Cancel</button></div>' : '<button class="btn danger" data-act="reset" style="align-self:flex-start">Reset logs</button>'}</section>
  </div></div>`;
}

// ---------- sign in ----------
function viewSignIn(msg = '') {
  $app.innerHTML = `<main class="signin">
    <span class="logo" style="width:44px;height:44px;border-radius:12px">${I.check(22)}</span>
    <h1 class="h1" style="margin:0">UKMPPD Planner</h1>
    <p class="note">Sign in to sync your phone and laptop.</p>
    ${msg ? `<div class="banner warn" style="margin:0">${msg}</div>` : ''}
    <form id="si-form" class="col" style="gap:12px">
      <div class="f"><label for="si-email">Email</label><input id="si-email" type="email" autocomplete="username" value="${esc(ui.email || '')}" required></div>
      <div class="f"><label for="si-pass">Password</label><input id="si-pass" type="password" autocomplete="current-password" required></div>
      <button class="btn p wide" type="submit" id="si-go">Sign in</button>
    </form>
    <button class="btn wide" id="si-local">Use on this device only</button>
    <p class="meta">Your account is the one you created in Supabase → Authentication → Users.</p></main>`;
  document.getElementById('si-form').onsubmit = async (ev) => {
    ev.preventDefault();
    ui.email = document.getElementById('si-email').value.trim();
    const btn = document.getElementById('si-go'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { await store.signInPassword(ui.email, document.getElementById('si-pass').value); location.hash = '#today'; render(); }
    catch (e) { viewSignIn(esc(/invalid/i.test(e.message || '') ? 'Wrong email or password.' : (e.message || 'Could not sign in. Check your connection.'))); }
  };
  document.getElementById('si-local').onclick = () => { store.useLocalOnly(); render(); };
}

// ---------- timer ----------
function tickTimer() {
  const el = document.getElementById('timer-left');
  if (!ui.timer || !el) return;
  const left = Math.max(0, ui.timer.end - Date.now());
  el.textContent = `${pad(Math.floor(left / 60000))}:${pad(Math.floor((left % 60000) / 1000))}`;
}
setInterval(() => {
  if (!ui.timer) return;
  if (Date.now() >= ui.timer.end) { ui.timer = null; toast('Time is up.'); render(); return; }
  tickTimer();
}, 1000);

// ---------- events ----------
const intOrNull = (v) => { const n = parseInt(String(v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const draft = (date) => ui.draft[date] || (ui.draft[date] = {});

$app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, date = el.dataset.date; const st = settings();
  switch (act) {
    case 'step': {
      const key = el.dataset.key; const log = store.day(date); const done = { ...(log.done || {}) };
      done[key] = !done[key];
      const patch = { done };
      if (key === 'lec') { const d = dayOf(date); if (d && d.lecture) patch.lec = d.lecture.key; }
      writeDay(date, patch); break;
    }
    case 'carrydone': {
      const log = store.day(date); const done = { ...(log.done || {}), [el.dataset.key]: true };
      const patch = { done };
      if (el.dataset.key === 'lec') { const d = dayOf(date); if (d && d.lecture) patch.lec = d.lecture.key; }
      writeDay(date, patch); toast('Marked done.'); break;
    }
    case 'carrydrop': { const log = store.day(date); writeDay(date, { dropped: { ...(log.dropped || {}), [el.dataset.key]: true } }); toast('Dropped from carry-over.'); break; }
    case 'energy': { const v = +el.dataset.v; writeDay(date, { energy: +store.day(date).energy === v ? null : v }); break; }
    case 'draft': { const d = draft(date); const k = el.dataset.k, v = el.dataset.v; if (k === 'kind' && v !== d.kind) { d.q = ''; d.c = ''; } d[k] = k === 'bank' && d.bank === v ? '' : v; render(); break; }
    case 'logfor': {
      const d = draft(date); d.kind = el.dataset.kind; if (el.dataset.subj) d.subj = el.dataset.subj;
      render(); const card = document.getElementById('logcard'); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); const q = document.getElementById(`q-${date}`); if (q) setTimeout(() => q.focus(), 300); }
      break;
    }
    case 'timer': {
      if (ui.timer && ui.timer.key === el.dataset.key) ui.timer = null;
      else ui.timer = { key: el.dataset.key, end: Date.now() + (+el.dataset.min) * 60000 };
      render(); break;
    }
    case 'addset': {
      const d = draft(date); const day = dayOf(date);
      const isTO = d.kind === 'to';
      const q = intOrNull(d.q) ?? (isTO ? st.toQuestions : null); const c = intOrNull(d.c);
      if (!q || c === null) { toast('Enter the number of questions and how many you got right.'); return; }
      if (c > q) { toast('Correct can’t be more than the number of questions.'); return; }
      const choices = day.subjects || [];
      const subj = isTO ? '' : choices.includes(d.subj) ? d.subj : (d.subjOther || '');
      const log = store.day(date);
      const sets = [...S.daySets(log), { kind: isTO ? 'to' : 'set', q, c, subj, bank: d.bank || '' }];
      const done = { ...(log.done || {}) };
      const stepKey = isTO ? 'to' : subj ? `q:${subj}` : null;
      if (stepKey && day.steps.some((s) => s.key === stepKey)) done[stepKey] = true;
      writeDay(date, { sets, done });
      ui.draft[date] = { kind: d.kind, subj: d.subj, subjOther: d.subjOther, bank: d.bank, q: '', c: '' };
      toast(`Saved ${c}/${q} · ${S.pct(c, q)}%`); break;
    }
    case 'delset': { const sets = [...S.daySets(store.day(date))]; sets.splice(+el.dataset.i, 1); writeDay(date, { sets }); break; }
    case 'accept': case 'dismiss': {
      const key = el.dataset.key;
      const s = S.suggestions(plan(), store.allDays(), st, todayStr(), materialize).find((x) => x.key === key);
      const patch = { dismissed: { ...(st.dismissed || {}), [key]: true } };
      if (act === 'accept' && s) {
        if (s.accept.kind === 'tier') patch.tiers = { ...(st.tiers || {}), [s.accept.subj]: s.accept.tier };
        if (s.accept.kind === 'qFactor') { const ov = { ...(st.overrides || {}) }; s.accept.dates.forEach((dd) => { ov[dd] = { ...(ov[dd] || {}), qFactor: s.accept.f }; }); patch.overrides = ov; }
        if (s.accept.kind !== 'ack') toast('Plan updated.');
      }
      store.updateSettings(patch); break;
    }
    case 'tier': store.updateSettings({ tiers: { ...(st.tiers || {}), [el.dataset.id]: el.dataset.v } }); toast(`${short(el.dataset.id)} → ${TIERS[el.dataset.v]}`); break;
    case 'ovtype': { const ov = { ...(st.overrides || {}) }; ov[date] = { type: el.dataset.v }; store.updateSettings({ overrides: ov }); toast('Day changed.'); break; }
    case 'ovreset': { const ov = { ...(st.overrides || {}) }; delete ov[date]; store.updateSettings({ overrides: ov }); break; }
    case 'clearov': store.updateSettings({ overrides: {} }); toast('Day changes undone.'); break;
    case 'errdraftrw': ui.errDraft.rewatch = !ui.errDraft.rewatch; render(); break;
    case 'adderr': {
      const d = ui.errDraft;
      if (!(d.note || '').trim()) { toast('Write the rule first.'); return; }
      store.addError({ note: d.note.trim(), subj: d.subj || '', cat: d.cat || CATEGORIES[0], rewatch: !!d.rewatch, date: todayStr(), closed: false });
      ui.errDraft = { subj: d.subj, cat: d.cat }; toast('Added to error log.'); break;
    }
    case 'errtoggle': { const e = store.errors().find((x) => x.id === el.dataset.id); if (e) store.updateError(e.id, { closed: !e.closed }); break; }
    case 'errrw': { const e = store.errors().find((x) => x.id === el.dataset.id); if (e) store.updateError(e.id, { rewatch: !e.rewatch }); break; }
    case 'errdel': store.deleteError(el.dataset.id); break;
    case 'errf': ui.err[el.dataset.k] = el.dataset.v === '1'; render(); break;
    case 'syncnow': await store.sync(); toast(store.status === 'idle' ? 'Synced.' : 'Sync didn’t finish. It will retry.'); render(); break;
    case 'signout': await store.signOut(); break;
    case 'export': { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })); a.download = `ukmppd-planner-${todayStr()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); break; }
    case 'reset': ui.confirmReset = true; render(); break;
    case 'resetno': ui.confirmReset = false; render(); break;
    case 'resetyes': ui.confirmReset = false; await store.resetAll(); toast('All logs deleted.'); render(); break;
  }
});

$app.addEventListener('input', (ev) => {
  const el = ev.target; const k = el.dataset.in; if (!k) return;
  if (k === 'q' || k === 'c') draft(el.dataset.date)[k] = el.value;
  else if (k === 'errNote') ui.errDraft.note = el.value;
});
$app.addEventListener('change', async (ev) => {
  const el = ev.target; const k = el.dataset.in; if (!k) return; const date = el.dataset.date;
  if (k === 'subjOther') draft(date).subjOther = el.value;
  else if (k === 'anki') { writeDay(date, { anki: intOrNull(el.value) }); el.blur(); }
  else if (k === 'backlog') { writeDay(date, { backlog: intOrNull(el.value) }); el.blur(); }
  else if (k === 'errSubj') ui.errDraft.subj = el.value;
  else if (k === 'errCat') ui.errDraft.cat = el.value;
  else if (k === 'errFilterSubj') { ui.err.subj = el.value; el.blur(); render(); }
  else if (k === 'ov-s1' || k === 'ov-s2') {
    const st = settings(); const ov = { ...(st.overrides || {}) }; const day = dayOf(date);
    ov[date] = { ...(ov[date] || {}), type: 'drill', s1: day.subjects[0], s2: day.subjects[1], [k.slice(3)]: el.value };
    store.updateSettings({ overrides: ov });
  } else if (k.startsWith('set-')) {
    const id = k.slice(4); let v = el.value;
    if (['toQuestions', 'toMinutes', 'ankiTarget'].includes(id)) { v = intOrNull(v); if (!v) return; }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (id === 'examDate' && v <= DEFAULT_SETTINGS.fullTimeStart) { toast('The exam date must be after 25 Dec.'); return; }
    store.updateSettings({ [id]: v }); toast('Saved. The plan has been rebuilt.');
  } else if (k === 'import') {
    const file = el.files && el.files[0]; if (!file) return;
    try { store.importJSON(await file.text()); toast('Backup restored.'); } catch (e) { toast(e.message); }
  }
});
$app.addEventListener('keydown', (ev) => {
  const el = ev.target; if (ev.key !== 'Enter' || !el.dataset) return;
  const k = el.dataset.in;
  if (k === 'q' || k === 'c') { ev.preventDefault(); el.blur(); const b = $app.querySelector(`[data-act="addset"][data-date="${el.dataset.date}"]`); if (b) b.click(); }
  else if (k === 'errNote') { ev.preventDefault(); el.blur(); const b = $app.querySelector('[data-act="adderr"]'); if (b) b.click(); }
  else if (k === 'anki' || k === 'backlog') { ev.preventDefault(); el.blur(); }
});

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
store.subscribe(render);

(async () => {
  const { needsSignIn } = await store.init();
  if (needsSignIn) viewSignIn(); else render();
  setInterval(() => { if (route().view === 'today' && !ui.timer) render(); }, 5 * 60 * 1000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
