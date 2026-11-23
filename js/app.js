import { buildPlan, SUBJECT, SUBJECTS, rating, label, addDays, diffDays, weekStart, parse, TYPE_LABEL, DEFAULT_SETTINGS } from './schedule.js';
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
function nowHM() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

const ICON = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// ---------- plan (memoised on settings) ----------
let planCache = { key: '', plan: [] };
function settings() { return { ...DEFAULT_SETTINGS, ...store.settings() }; }
function plan() {
  const st = settings();
  const k = JSON.stringify([st.startDate, st.fullTimeStart, st.materialEnd, st.examDate, st.ramadanStart, st.ramadanEnd, st.toQuestions, st.toMinutes, st.ankiTarget, st.overrides || {}]);
  if (k !== planCache.key) planCache = { key: k, plan: buildPlan(st, st.overrides || {}) };
  return planCache.plan;
}
const dayOf = (date) => plan().find((d) => d.date === date);

// ---------- UI state ----------
const ui = { draft: {}, errFilter: { open: true, subj: '' }, errDraft: {}, confirmReset: false };
let toastTimer = null;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}

// ---------- shell ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, arg] = h.split('/');
  return { view: view || 'today', arg };
}
function nav(view) {
  const items = [['today', 'Today', ICON.today], ['cal', 'Calendar', ICON.cal], ['stats', 'Stats', ICON.stats], ['errors', 'Errors', ICON.err]];
  const on = (v) => (view === v || (view === 'day' && v === 'cal') ? 'on' : '');
  return {
    bottom: `<nav class="bottomnav" aria-label="Main">${items.map(([v, l, i]) => `<a href="#${v}" class="${on(v)}">${i}<span>${l}</span></a>`).join('')}</nav>`,
    top: `<header class="topbar"><span class="brand">UKMPPD Planner</span><nav class="topnav" aria-label="Main">${items.map(([v, l]) => `<a href="#${v}" class="${on(v)}">${l}</a>`).join('')}<a href="#settings" class="${view === 'settings' ? 'on' : ''}">Settings</a></nav></header>`,
  };
}
function syncBadge() {
  const s = store.status, p = store.pending;
  if (s === 'local') return '<span class="sync"><span class="dot off"></span>This device</span>';
  if (s === 'syncing') return '<span class="sync"><span class="dot busy"></span>Syncing</span>';
  if (s === 'offline') return `<span class="sync"><span class="dot warn"></span>Offline${p ? ` · ${p} to sync` : ''}</span>`;
  if (s === 'error') return `<span class="sync"><span class="dot warn"></span>Sync failed${p ? ` · ${p} waiting` : ''}</span>`;
  return `<span class="sync"><span class="dot"></span>${p ? `${p} to sync` : 'Synced'}</span>`;
}

let pendingRender = false;
function render() {
  const a = document.activeElement;
  if (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'button') { pendingRender = true; return; }
  pendingRender = false;
  const r = route();
  const n = nav(r.view);
  let body = '';
  try {
    if (r.view === 'today') body = viewDay(todayStr(), true);
    else if (r.view === 'day') body = viewDay(r.arg, false);
    else if (r.view === 'cal') body = viewCalendar();
    else if (r.view === 'stats') body = viewStats();
    else if (r.view === 'errors') body = viewErrors();
    else if (r.view === 'settings') body = viewSettings();
    else body = viewDay(todayStr(), true);
  } catch (e) { console.error(e); body = `<div class="card"><p>Something went wrong showing this page: ${esc(e.message)}</p></div>`; }
  const y = window.scrollY;
  $app.innerHTML = `${n.top}<main class="main">${body}</main>${n.bottom}`;
  window.scrollTo(0, y);
}
$app.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) render(); }, 0));

function pageHead(left, right, extra = '') {
  return `<div class="head"><div class="head-row"><span>${left}</span><span style="display:flex;align-items:center;gap:4px">${right}<a href="#settings" class="iconbtn" aria-label="Settings">${ICON.gear}</a></span></div>${extra}</div>`;
}

// ---------- Today / day detail ----------
function viewDay(date, isToday) {
  const P = plan();
  if (!P.length) return '<p>No plan.</p>';
  const st = settings();
  const first = P[0].date, last = P[P.length - 1].date;
  let preview = false;
  if (isToday && date < first) { preview = true; date = first; }
  if (isToday && date > last) return viewAfter();
  const day = dayOf(date);
  if (!day) return `<div class="card"><p>No plan for ${esc(date)}.</p><a href="#cal">Back to calendar</a></div>`;
  const log = store.day(date);
  const idx = P.indexOf(day) + 1;
  const daysLeft = diffDays(isToday && !preview ? todayStr() : date, st.examDate);
  const dlabel = label(date, { year: true }).toUpperCase();

  const left = isToday ? dlabel : `<a href="#cal" class="iconbtn" aria-label="Back to calendar" style="margin-left:-12px">${ICON.back}</a>${dlabel}`;
  const pills = [
    `<span class="pill">Day ${idx} of ${P.length}</span>`,
    `<span class="pill accent">${day.phase === 'Phase 1' ? 'Phase 1 · Material + questions' : day.phase === 'Phase 2' ? 'Phase 2 · Practice only' : day.phase}</span>`,
    `<span class="pill ${day.type === 'to' ? 'violet' : ''}">${day.type === 'focus' || day.type === 'drill' || day.type === 'to' ? (day.partTime ? 'After 15:00' : day.ramadan ? 'Ramadan · 6 h' : 'Full day') + ` · ${day.blocks.length} blocks` : TYPE_LABEL[day.type]}</span>`,
    day.ramadan && day.type !== 'focus' && day.type !== 'drill' && day.type !== 'to' ? '<span class="pill">Ramadan</span>' : '',
  ].join('');
  const head = pageHead(left, syncBadge(),
    `<div class="big"><b>${Math.max(0, daysLeft)}</b><span>${daysLeft === 1 ? 'day' : 'days'} to CBT · ${label(st.examDate)}</span></div><div class="pills">${pills}</div>`);

  const banner = preview ? `<div class="banner info">Mental preparation week. Structured study starts ${label(first)}. Here's day 1 so you can see what's coming.</div>` : '';
  if (!preview && !store.configured && isToday && !localStorage.getItem('ukmppd.hideLocalNote')) {
    // shown only when Supabase isn't set up yet
  }

  const suggs = isToday && !preview ? suggestionCards() : '';
  const left1 = subjectCard(day, log) + blocksCard(day, log, isToday && !preview);
  const right1 = (preview ? '' : suggs + logCard(day, log) + ankiEnergyCard(day, log)) + (!isToday ? changeDayCard(day) : '');
  return `${head}${banner}<div class="grid2"><div class="col">${left1}</div><div class="col">${right1}</div></div>`;
}

function tagFor(id) {
  const s = SUBJECT[id]; if (!s) return '';
  const r = rating(id);
  return `<span class="tag ${r === 'Y' ? 'y' : ''}">${s.tier === 'M' ? 'MAINTAIN' : 'TIER ' + s.tier} · ${r}</span>`;
}
function accClass(a) { return a === null ? '' : a >= 85 ? 'good' : a >= 70 ? 'warn' : 'bad'; }

function subjectCard(day, log) {
  const t = S.dayTotals(log);
  const qT = day.targets.q;
  const qTxt = qT[1] ? (qT[0] === qT[1] ? `${qT[0]}` : `${qT[0]}–${qT[1]}`) : '—';
  const tiles = day.type === 'exam' ? '' : `<div class="tiles">
    <div class="tile"><span>Questions</span><span class="v">${t.q}<small> / ${qT[1] || 0}</small></span></div>
    <div class="tile"><span>Accuracy</span><span class="v ${accClass(t.acc)}">${t.acc === null ? '—' : Math.round(t.acc) + '%'}</span></div>
    <div class="tile"><span>Anki</span><span class="v">${+log.anki || 0}<small> / ${day.targets.anki}</small></span></div>
  </div>`;
  let eyebrow = "Today's subject", main = '', note = '';
  switch (day.type) {
    case 'focus':
      main = `<div class="card-head"><div class="subject">${esc(SUBJECT[day.s1].name)}</div>${tagFor(day.s1)}</div>`;
      note = `Target ${qTxt} Q · questions first, then Medsense for the gaps only.`; break;
    case 'drill':
      eyebrow = 'Drill subjects';
      main = `<div class="card-head"><div class="subject">${esc(SUBJECT[day.s1].name)}</div>${tagFor(day.s1)}</div><div class="card-head"><div class="subject" style="font-size:18px">${esc(SUBJECT[day.s2].name)}</div>${tagFor(day.s2)}</div>`;
      note = `Target ${qTxt} Q from the banks · no module reading, 5–10 min lookups only.`; break;
    case 'to': {
      const st = settings();
      eyebrow = 'TO day';
      main = `<div class="subject">Full try-out · ${st.toQuestions} Q · ${st.toMinutes} min</div>`;
      note = 'Four locked sections, no backtracking. Review misses and guesses the same day.'; break;
    }
    case 'light': eyebrow = 'Light half day'; main = '<div class="subject">Due Anki, error log, short mixed set</div>'; note = '2–4 easy hours, finish around midday. No TO, no new modules, no evening catch-up.'; break;
    case 'taper': eyebrow = 'Taper'; main = `<div class="subject">${day.s1 ? 'Priority repair · ' + esc(SUBJECT[day.s1].name) : 'Mixed retrieval · weak areas'}</div>`; note = 'Short timed set, correct recurring errors, protect sleep. No new-content marathon.'; break;
    case 'eve': eyebrow = 'Exam eve'; main = '<div class="subject">Light review + logistics</div>'; note = 'Check exam card, ID, route and timing. Normal meals. Stop early and sleep.'; break;
    case 'exam': eyebrow = 'Exam day'; main = '<div class="subject">CBT exam</div>'; note = 'Brief warm-up only if it helps. Read the stem, commit, discriminate, move on.'; break;
  }
  const repair = day.repair ? `<div class="pill warn" style="align-self:flex-start">Repair added · ${esc(SUBJECT[day.repair].name)} in blocks 6–7</div>` : '';
  return `<section class="card" aria-label="Today's plan"><div class="eyebrow">${eyebrow}</div>${main}${repair}${tiles}<div class="note">${note}</div></section>`;
}

function blocksCard(day, log, live) {
  if (!day.blocks.length) return '';
  const b = log.blocks || [];
  const done = S.blocksDone(log, day);
  let nowIdx = live ? day.blocks.findIndex((_, i) => !b[i]) : -1;
  if (live && nowIdx >= 0) {
    // if the clock is past a later block's start, highlight the latest started undone block instead
    const t = nowHM();
    for (let i = nowIdx; i < day.blocks.length; i++) if (!b[i] && day.blocks[i].time && day.blocks[i].time <= t) nowIdx = i;
  }
  const rows = day.blocks.map((bl, i) => `
    <div class="block ${b[i] ? 'done' : ''} ${i === nowIdx ? 'now' : ''} ${bl.kind === 'to' ? 'to' : ''}">
      <span class="t">${esc(bl.time || '—')}</span>
      <span class="l">${esc(bl.title)}</span>
      <button class="check" data-act="block" data-date="${day.date}" data-i="${i}" aria-pressed="${!!b[i]}" aria-label="${b[i] ? 'Mark not done' : 'Mark done'}: ${esc(bl.title)}"><i>${b[i] ? ICON.check : ''}</i></button>
    </div>`).join('');
  return `<section class="card" aria-label="Blocks" style="gap:0;padding-top:8px;padding-bottom:8px">
    <div class="card-head" style="padding:8px 0"><span class="eyebrow">Blocks</span><span class="mono muted" style="font-size:12px">${done} of ${day.blocks.length} · ${done} h</span></div>
    <div class="blocks">${rows}</div></section>`;
}

function defaultKind(day) { return day.type === 'to' ? 'to' : 'set'; }
function logCard(day, log) {
  if (day.type === 'exam') return '';
  const st = settings();
  const d = getDraft(day.date);
  if (d.kind === undefined) d.kind = defaultKind(day);
  if (d.subj === undefined) d.subj = day.s1 || '';
  if (d.bank === undefined) d.bank = '';
  const isTO = d.kind === 'to';
  const subjChoices = day.type === 'drill' ? [day.s1, day.s2] : null;
  const subjField = isTO ? '' : subjChoices
    ? `<div class="field"><label>Subject</label><div class="chips">${subjChoices.map((s) => `<button class="chip ${d.subj === s ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="subj" data-v="${s}">${s}</button>`).join('')}<button class="chip ${d.subj && !subjChoices.includes(d.subj) ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="subj" data-v="MIX">Other</button></div></div>`
    : `<div class="field grow"><label for="subj-${day.date}">Subject</label><select id="subj-${day.date}" data-in="subj" data-date="${day.date}"><option value="">Mixed / not one subject</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${d.subj === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`;
  const otherSel = subjChoices && d.subj === 'MIX' ? `<div class="field grow"><label for="subj2-${day.date}">Which subject</label><select id="subj2-${day.date}" data-in="subjOther" data-date="${day.date}"><option value="">Mixed</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${d.subjOther === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : '';
  const sets = S.daySets(log);
  const list = sets.length ? `<div class="loglist">${sets.map((s, i) => `
    <div class="logitem"><span class="grow"><b class="mono">${s.c}/${s.q}</b> · ${S.pct(+s.c, +s.q)}% · ${s.kind === 'to' ? 'TO' : esc(s.subj ? s.subj : 'Mixed')}${s.bank ? ' · ' + esc(s.bank) : ''}</span>
    <button class="x" data-act="delset" data-date="${day.date}" data-i="${i}" aria-label="Remove this entry">${ICON.x}</button></div>`).join('')}</div>` : '';
  return `<section class="card" aria-label="Log questions">
    <div class="card-head"><span class="eyebrow">${isTO ? 'Log TO score' : 'Log a question set'}</span>
      <div class="chips"><button class="chip ${!isTO ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="kind" data-v="set">Set</button><button class="chip ${isTO ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="kind" data-v="to">TO</button></div></div>
    <div class="row">
      <div class="field num"><label for="q-${day.date}">${isTO ? 'Questions' : 'Questions'}</label><input id="q-${day.date}" inputmode="numeric" pattern="[0-9]*" data-in="q" data-date="${day.date}" value="${esc(d.q || (isTO ? st.toQuestions : ''))}" placeholder="${isTO ? st.toQuestions : '40'}"></div>
      <div class="field num"><label for="c-${day.date}">Correct</label><input id="c-${day.date}" inputmode="numeric" pattern="[0-9]*" data-in="c" data-date="${day.date}" value="${esc(d.c)}" placeholder="0"></div>
      <button class="btn primary" data-act="addset" data-date="${day.date}" style="flex:1">Add</button>
    </div>
    ${subjField}${otherSel}
    <div class="field"><label>Source (optional)</label><div class="chips">${BANKS.map((b) => `<button class="chip ${d.bank === b ? 'on' : ''}" data-act="draft" data-date="${day.date}" data-k="bank" data-v="${b}">${b}</button>`).join('')}</div></div>
    ${list}
  </section>`;
}

function ankiEnergyCard(day, log) {
  if (day.type === 'exam') return '';
  const e = +log.energy || 0;
  return `<section class="card" aria-label="Anki and energy">
    <div class="row">
      <div class="field grow"><label for="anki-${day.date}">Anki cards done · target ${day.targets.anki} (${esc(day.targets.ankiNote)})</label><input id="anki-${day.date}" inputmode="numeric" pattern="[0-9]*" data-in="anki" data-date="${day.date}" value="${log.anki ?? ''}" placeholder="0"></div>
    </div>
    <details ${+log.backlog ? 'open' : ''}><summary>+ Due backlog left over (only if there is one)</summary>
      <div class="field" style="margin-top:8px"><label for="bl-${day.date}">Cards still due</label><input id="bl-${day.date}" inputmode="numeric" pattern="[0-9]*" data-in="backlog" data-date="${day.date}" value="${log.backlog ?? ''}" placeholder="0"></div>
    </details>
    <div class="card-head"><span style="font-size:13px;color:var(--ink2)">Energy today</span>
      <div class="seg" role="group" aria-label="Energy 1 to 5">${[1, 2, 3, 4, 5].map((n) => `<button class="${e === n ? 'on' : ''}" data-act="energy" data-date="${day.date}" data-v="${n}" aria-pressed="${e === n}" aria-label="Energy ${n}">${n}</button>`).join('')}</div>
    </div>
  </section>`;
}

function suggestionCards() {
  const list = S.suggestions(plan(), store.allDays(), settings(), todayStr()).slice(0, 2);
  return list.map((s) => `<section class="card sugg ${s.tone}" aria-label="Suggestion">
    <div class="who"><span class="dot ${s.tone === 'warn' ? 'warn' : ''}"></span>SUGGESTION</div>
    <p>${s.text}</p>
    <div class="row"><button class="btn primary" data-act="accept" data-key="${esc(s.key)}">${s.accept.kind === 'ack' ? 'Got it' : 'Accept'}</button>${s.accept.kind === 'ack' ? '' : `<button class="btn" data-act="dismiss" data-key="${esc(s.key)}">Not now</button>`}</div>
  </section>`).join('');
}

function changeDayCard(day) {
  if (!['to', 'drill', 'light'].includes(day.type) || day.phase !== 'Phase 2' || day.date < todayStr()) return '';
  const ov = (settings().overrides || {})[day.date];
  const subjSel = day.type === 'drill' ? ['s1', 's2'].map((k, i) => `<div class="field grow"><label for="${k}-${day.date}">Drill subject ${i + 1}</label><select id="${k}-${day.date}" data-in="ov-${k}" data-date="${day.date}">${SUBJECTS.map((s) => `<option value="${s.id}" ${day[k] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`).join('') : '';
  return `<section class="card" aria-label="Change this day">
    <div class="eyebrow">Change this day</div>
    <div class="chips">${[['to', 'TO day'], ['drill', 'Drill day'], ['light', 'Light']].map(([t, l]) => `<button class="chip ${day.type === t ? 'on' : ''}" data-act="ovtype" data-date="${day.date}" data-v="${t}">${l}</button>`).join('')}</div>
    <div class="row">${subjSel}</div>
    ${ov ? `<button class="btn" data-act="ovreset" data-date="${day.date}">Reset to the original plan</button>` : ''}
  </section>`;
}

function viewAfter() {
  const st = settings();
  const tos = S.toResults(store.allDays());
  return `${pageHead('AFTER THE EXAM', syncBadge())}<section class="card"><div class="subject">The plan ended on ${label(st.examDate, { year: true })}.</div>
    <p class="note">You logged ${tos.length} TOs${tos.length ? `, last score ${tos[tos.length - 1].acc}%` : ''}. If your exam date moved, change it in <a href="#settings">Settings</a> and the plan rebuilds.</p></section>`;
}

// ---------- Calendar ----------
function viewCalendar() {
  const P = plan(); const logs = store.allDays(); const today = todayStr();
  const months = [];
  P.forEach((d) => { const m = d.date.slice(0, 7); if (!months.includes(m)) months.push(m); });
  const SC = { NEURO: 'NEU', OBGYN: 'OBG', RHEUM: 'RHEU' };
  const sc = (id) => SC[id] || id;
  const code = (d) => ({ focus: sc(d.s1), to: 'TO', drill: `${sc(d.s1)}<br>${sc(d.s2)}`, light: 'Light', taper: d.s1 ? sc(d.s1) : 'Mix', eve: 'Eve', exam: 'EXAM' }[d.type]);
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const body = months.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    const firstDow = (parse(`${m}-01`).getUTCDay() + 6) % 7;
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dh">${d}</div>`).join('');
    for (let i = 0; i < firstDow; i++) cells += '<div class="cell empty"></div>';
    for (let n = 1; n <= dim; n++) {
      const date = `${m}-${pad(n)}`; const d = P.find((x) => x.date === date);
      if (!d) { cells += `<div class="cell empty"><span class="n">${n}</span></div>`; continue; }
      const lg = logs[date] || {};
      const ok = (lg.blocks || []).some(Boolean) || S.daySets(lg).length;
      cells += `<a class="cell t-${d.type} ${date === today ? 'today' : ''} ${date < today ? 'past' : ''}" href="#day/${date}" aria-label="${label(date)}: ${esc(d.title)}"><span class="n">${n}</span><span class="c">${code(d)}</span>${ok ? '<span class="ok" aria-hidden="true"></span>' : ''}</a>`;
    }
    return `<section class="card month"><h3>${MON[mo - 1]} ${y}</h3><div class="cal">${cells}</div></section>`;
  }).join('');
  const counts = P.reduce((a, d) => { a[d.type] = (a[d.type] || 0) + 1; return a; }, {});
  const legend = `<div class="legend">
    <span><i class="sw t-focus" style="border:1px solid var(--line2)"></i>Material ${counts.focus || 0}</span>
    <span><i class="sw t-to"></i>TO ${counts.to || 0}</span>
    <span><i class="sw t-drill"></i>Drill ${counts.drill || 0}</span>
    <span><i class="sw" style="background:var(--surface);border:1px solid var(--line2)"></i>Light ${counts.light || 0}</span>
    <span><i class="sw t-taper"></i>Taper</span>
    <span><i class="dot"></i>Logged</span></div>`;
  return `${pageHead('CALENDAR', syncBadge(), `<div class="big"><b>${P.length}</b><span>days · ${label(P[0].date)} → ${label(P[P.length - 1].date)}</span></div>${legend}`)}<div class="col">${body}</div>`;
}

// ---------- Stats ----------
function viewStats() {
  const P = plan(); const logs = store.allDays(); const today = todayStr();
  const ref = today < P[0].date ? P[0].date : today;
  const wk = S.weekSummary(P, logs, ref, today);
  const all = S.allSets(logs).filter((s) => s.kind !== 'to');
  const totQ = all.reduce((n, s) => n + (+s.q || 0), 0), totC = all.reduce((n, s) => n + (+s.c || 0), 0);
  const tos = S.toResults(logs);
  const tosPlanned = P.filter((d) => d.type === 'to').length;
  const ankiTot = Object.values(logs).reduce((n, l) => n + (+l.anki || 0), 0);
  const subj = S.subjectStats(logs).sort((a, b) => (a.rolling ?? a.acc ?? 101) - (b.rolling ?? b.acc ?? 101));
  const errs = store.errors();

  const kpis = `<div class="kpis">
    <div class="kpi"><span>This week · blocks</span><b>${wk.done}<small> / ${wk.planned || '—'}</small></b><small>${wk.adherence === null ? 'no days yet' : wk.adherence + '% adherence'}</small></div>
    <div class="kpi"><span>This week · questions</span><b>${wk.q}</b><small>${wk.acc === null ? 'no sets yet' : wk.acc + '% correct'}</small></div>
    <div class="kpi"><span>TOs done</span><b>${tos.length}<small> / ${tosPlanned}</small></b><small>${tos.length ? 'last ' + tos[tos.length - 1].acc + '%' : 'none yet'}</small></div>
    <div class="kpi"><span>All sets · accuracy</span><b>${S.pct(totC, totQ) ?? '—'}${totQ ? '%' : ''}</b><small>${totQ} Q · Anki ${ankiTot}</small></div>
  </div>`;

  const toChart = tos.length ? lineChart(tos.map((t) => ({ x: label(t.date), y: t.acc }))) : '<div class="empty-state">Log your first TO to see the trend against your 92 target and the 66.4% pass mark.</div>';
  const series = S.weeklySeries(P, logs, today).filter((w) => w.q > 0);
  const wkChart = series.length ? barChart(series.map((w) => ({ x: label(w.ws).replace(/^\w+ /, ''), y: w.acc, q: w.q }))) : '<div class="empty-state">Weekly accuracy from your question sets (TOs excluded) appears here.</div>';

  const rows = subj.map((s) => {
    const a = s.rolling ?? s.acc;
    const cls = a === null ? '' : a >= 85 ? 'good' : a >= 70 ? 'warn' : 'bad';
    return `<tr><td><div class="sname">${esc(SUBJECT[s.id].name)}</div><div class="bar"><i class="${cls}" style="width:${a ?? 0}%"></i></div></td><td class="hide-sm">${tagFor(s.id)}</td><td class="num">${s.q}</td><td class="num hide-sm">${s.acc === null ? '—' : Math.round(s.acc) + '%'}</td><td class="num"><b>${s.rolling === null ? '—' : Math.round(s.rolling) + '%'}</b></td></tr>`;
  }).join('');
  const cat = CATEGORIES.map((c) => [c, errs.filter((e) => e.cat === c).length]).filter(([, n]) => n);
  const catHtml = cat.length ? `<div class="loglist">${cat.sort((a, b) => b[1] - a[1]).map(([c, n]) => `<div class="logitem" style="padding-right:10px"><span class="grow">${esc(c)}</span><b class="mono">${n}</b></div>`).join('')}</div>` : '<div class="empty-state">Error categories show up once you log misses.</div>';

  return `${pageHead('STATS', syncBadge(), `<div class="big"><b>${wk.hours}</b><span>focused hours this week · ${label(wk.ws)} – ${label(wk.we)}</span></div>`)}
    <div class="col">${kpis}
    <div class="grid2"><section class="card"><div class="eyebrow">TO scores</div>${toChart}</section>
    <section class="card"><div class="eyebrow">Weekly accuracy · question sets</div>${wkChart}</section></div>
    <section class="card"><div class="card-head"><span class="eyebrow">Subjects · weakest first</span><span class="muted" style="font-size:12px">rolling = last 4 sets</span></div>
      <div class="tablewrap"><table><thead><tr><th>Subject</th><th class="hide-sm">Tier</th><th style="text-align:right">Q</th><th class="hide-sm" style="text-align:right">All</th><th style="text-align:right">Rolling</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="card"><div class="eyebrow">Error categories · ${errs.length} logged</div>${catHtml}</section></div>`;
}

function lineChart(pts) {
  const W = 420, H = 220, L = 30, R = 10, T = 16, B = 26;
  const y0 = 40, y1 = 100;
  const sx = (i) => (pts.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const sy = (v) => T + ((y1 - Math.max(y0, Math.min(y1, v))) * (H - T - B)) / (y1 - y0);
  const grid = [40, 60, 80, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const ref = `<line x1="${L}" x2="${W - R}" y1="${sy(S.TARGET)}" y2="${sy(S.TARGET)}" stroke="var(--accent)" stroke-dasharray="5 4"/><text x="${W - R}" y="${sy(S.TARGET) - 5}" text-anchor="end">target 92</text>
    <line x1="${L}" x2="${W - R}" y1="${sy(S.PASS_MARK)}" y2="${sy(S.PASS_MARK)}" stroke="var(--red)" stroke-dasharray="5 4"/><text x="${W - R}" y="${sy(S.PASS_MARK) - 5}" text-anchor="end">pass 66.4 (Feb 2026)</text>`;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(p.y)}`).join(' ');
  const area = pts.length > 1 ? `<path d="${path} L${sx(pts.length - 1)},${sy(y0)} L${sx(0)},${sy(y0)} Z" fill="var(--accent)" opacity="0.08"/>` : '';
  const step = Math.ceil(pts.length / 4);
  const xl = pts.map((p, i) => (i % step === 0 || i === pts.length - 1 ? `<text x="${sx(i)}" y="${H - 8}" text-anchor="${i === pts.length - 1 && pts.length > 1 ? 'end' : i === 0 && pts.length > 1 ? 'start' : 'middle'}">${esc(p.x.replace(/^\w+ /, ''))}</text>` : '')).join('');
  const dots = pts.map((p, i) => `<circle cx="${sx(i)}" cy="${sy(p.y)}" r="${i === pts.length - 1 ? 5 : 3}" fill="var(--accent)"/>`).join('');
  const lastP = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="TO scores over time, latest ${lastP.y}%">${grid}${ref}${area}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}<text x="${sx(pts.length - 1)}" y="${sy(lastP.y) - 10}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${lastP.y}</text>${xl}</svg>`;
}
function barChart(pts) {
  const W = 420, H = 220, L = 30, R = 10, T = 20, B = 26;
  const sy = (v) => T + ((100 - v) * (H - T - B)) / 100;
  const bw = Math.min(48, ((W - L - R) / pts.length) * 0.6);
  const sx = (i) => L + ((i + 0.5) * (W - L - R)) / pts.length;
  const grid = [0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const bars = pts.map((p, i) => `<rect x="${sx(i) - bw / 2}" y="${sy(p.y)}" width="${bw}" height="${sy(0) - sy(p.y)}" rx="4" fill="var(--accent)" opacity="${i === pts.length - 1 ? 1 : 0.55}"/><text x="${sx(i)}" y="${sy(p.y) - 6}" text-anchor="middle" style="fill:var(--ink)">${Math.round(p.y)}</text><text x="${sx(i)}" y="${H - 8}" text-anchor="middle">${esc(p.x)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly accuracy">${grid}<line x1="${L}" x2="${W - R}" y1="${sy(S.TARGET)}" y2="${sy(S.TARGET)}" stroke="var(--accent)" stroke-dasharray="5 4"/>${bars}</svg>`;
}

// ---------- Errors ----------
function viewErrors() {
  const all = store.errors();
  const f = ui.errFilter;
  const list = all.filter((e) => (!f.open || !e.closed) && (!f.subj || e.subj === f.subj));
  const today = dayOf(todayStr());
  const d = ui.errDraft;
  if (d.subj === undefined) d.subj = (today && today.s1) || '';
  const form = `<section class="card" aria-label="Add an error">
    <div class="eyebrow">Log a miss</div>
    <div class="field"><label for="err-note">Correct rule / discriminator (one line)</label><input id="err-note" data-in="errNote" value="${esc(d.note || '')}" placeholder="e.g. Pityriasis rosea: herald patch first, Christmas-tree pattern"></div>
    <div class="row">
      <div class="field grow"><label for="err-subj">Subject</label><select id="err-subj" data-in="errSubj"><option value="">—</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${d.subj === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field grow"><label for="err-cat">Category</label><select id="err-cat" data-in="errCat">${CATEGORIES.map((c) => `<option ${d.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    </div>
    <button class="btn primary wide" data-act="adderr">Add to error log</button>
  </section>`;
  const filters = `<div class="row" style="align-items:center">
    <div class="chips"><button class="chip ${f.open ? 'on' : ''}" data-act="errf" data-k="open" data-v="1">Open</button><button class="chip ${!f.open ? 'on' : ''}" data-act="errf" data-k="open" data-v="0">All</button></div>
    <div class="field grow"><label for="err-filter" class="hidden">Filter by subject</label><select id="err-filter" data-in="errFilterSubj"><option value="">All subjects</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${f.subj === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>`;
  const items = list.length ? list.map((e) => `<div class="err ${e.closed ? 'closed' : ''}">
      <button class="box" data-act="errtoggle" data-id="${e.id}" aria-pressed="${!!e.closed}" aria-label="${e.closed ? 'Reopen' : 'Mark closed'}"><i>${e.closed ? ICON.check : ''}</i></button>
      <div class="body"><div class="txt">${esc(e.note || '(no note)')}</div>
      <div class="meta"><span class="pill">${esc(e.cat || '')}</span>${e.subj ? `<span>${esc(SUBJECT[e.subj] ? SUBJECT[e.subj].name : e.subj)}</span>` : ''}<span class="mono">${e.date ? label(e.date) : ''}</span></div></div>
      <button class="x" data-act="errdel" data-id="${e.id}" aria-label="Delete">${ICON.x}</button></div>`).join('')
    : `<div class="empty-state">${all.length ? 'Nothing matches this filter.' : 'No misses logged yet. Add one line per miss: the rule that would have got it right.'}</div>`;
  const open = all.filter((e) => !e.closed).length;
  return `${pageHead('ERROR LOG', syncBadge(), `<div class="big"><b>${open}</b><span>open · ${all.length - open} closed</span></div>`)}
    <div class="grid2"><div class="col">${form}</div><div class="col"><section class="card" style="gap:8px">${filters}<div>${items}</div></section></div></div>`;
}

// ---------- Settings ----------
function viewSettings() {
  const st = settings();
  const P = plan();
  const c = P.reduce((a, d) => { a[d.type] = (a[d.type] || 0) + 1; return a; }, {});
  const acct = store.mode === 'cloud' && store.user
    ? `<p class="note">Signed in as <b>${esc(store.user.email)}</b>. ${syncBadge()}</p><div class="row"><button class="btn" data-act="syncnow">Sync now</button><button class="btn" data-act="signout">Sign out</button></div>`
    : store.configured
      ? `<p class="note">Using this device only. Sign in to sync your phone and laptop.</p><button class="btn primary" data-act="signout">Sign in</button>`
      : `<div class="banner">Supabase isn't connected yet, so data is saved on this device only. Add your Project URL and key to <span class="mono">js/config.js</span> (see README).</div>`;
  const f = (id, lbl, type, val, hint = '') => `<div class="field grow"><label for="${id}">${lbl}</label><input id="${id}" type="${type}" data-in="set-${id}" value="${esc(val)}">${hint ? `<span class="muted" style="font-size:12px">${hint}</span>` : ''}</div>`;
  return `${pageHead('SETTINGS', '')}
  <div class="grid2"><div class="col">
    <section class="card"><div class="eyebrow">Exam and phases</div>
      <div class="row">${f('examDate', 'CBT exam date', 'date', st.examDate, 'The 7-day taper follows this date.')}${f('materialEnd', 'Material study ends', 'date', st.materialEnd)}</div>
      <div class="row">${f('ramadanStart', 'Ramadan starts', 'date', st.ramadanStart)}${f('ramadanEnd', 'Ramadan ends', 'date', st.ramadanEnd)}</div>
      <div class="row">${f('toQuestions', 'TO questions', 'number', st.toQuestions)}${f('toMinutes', 'TO minutes', 'number', st.toMinutes)}${f('ankiTarget', 'Anki per day', 'number', st.ankiTarget)}</div>
      <p class="note">Current plan: ${P.length} days · ${c.focus || 0} material days · ${c.to || 0} TOs · ${c.drill || 0} drill days · ${c.light || 0} light days · taper ${label(addDays(st.examDate, -6))} → ${label(addDays(st.examDate, -1))}.</p>
      ${Object.keys(st.overrides || {}).length ? '<button class="btn" data-act="clearov">Undo all accepted changes to the plan</button>' : ''}
    </section>
  </div><div class="col">
    <section class="card"><div class="eyebrow">Account and sync</div>${acct}</section>
    <section class="card"><div class="eyebrow">Backup</div>
      <p class="note">Download everything as a file, or restore from one.</p>
      <div class="row"><button class="btn" data-act="export">Export JSON</button><label class="btn" style="display:inline-flex;align-items:center" for="importfile">Import JSON</label><input id="importfile" type="file" accept="application/json,.json" class="hidden" data-in="import"></div>
    </section>
    <section class="card"><div class="eyebrow">Reset</div>
      <p class="note">Deletes all logged days and errors (settings stay). Use it after testing.</p>
      ${ui.confirmReset ? '<div class="row"><button class="btn danger" data-act="resetyes">Yes, delete all logs</button><button class="btn" data-act="resetno">Cancel</button></div>' : '<button class="btn danger" data-act="reset">Reset logs</button>'}
    </section>
  </div></div>`;
}

// ---------- sign in ----------
function viewSignIn(msg = '') {
  const email = ui.email || '';
  $app.innerHTML = `<main class="signin">
    <h1 style="font-size:28px">UKMPPD Planner</h1>
    <p class="note">Sign in to sync your phone and laptop.</p>
    ${msg ? `<div class="banner">${msg}</div>` : ''}
    <form id="si-form" class="col" style="gap:12px">
      <div class="field"><label for="si-email">Email</label><input id="si-email" type="email" autocomplete="username" value="${esc(email)}" required></div>
      <div class="field"><label for="si-pass">Password</label><input id="si-pass" type="password" autocomplete="current-password" required></div>
      <button class="btn primary wide" type="submit" id="si-go">Sign in</button>
    </form>
    <button class="btn wide" id="si-local">Use on this device only</button>
    <p class="muted" style="font-size:12px">Your account is the one you created in Supabase → Authentication → Users.</p>
  </main>`;
  document.getElementById('si-form').onsubmit = async (ev) => {
    ev.preventDefault();
    ui.email = document.getElementById('si-email').value.trim();
    const pw = document.getElementById('si-pass').value;
    const btn = document.getElementById('si-go'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { await store.signInPassword(ui.email, pw); location.hash = '#today'; render(); }
    catch (e) { viewSignIn(esc(/invalid/i.test(e.message || '') ? 'Wrong email or password.' : (e.message || 'Could not sign in. Check your connection.'))); }
  };
  document.getElementById('si-local').onclick = () => { store.useLocalOnly(); render(); };
}

// ---------- events ----------
function getDraft(date) { return ui.draft[date] || (ui.draft[date] = {}); }
function intOrNull(v) { const n = parseInt(String(v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; }

$app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, date = el.dataset.date;
  const st = settings();
  switch (act) {
    case 'block': {
      const log = store.day(date); const b = [...(log.blocks || [])]; const i = +el.dataset.i;
      b[i] = !b[i]; store.updateDay(date, { blocks: b }); break;
    }
    case 'energy': { const v = +el.dataset.v; const cur = +store.day(date).energy; store.updateDay(date, { energy: cur === v ? null : v }); break; }
    case 'draft': {
      const d = getDraft(date); const k = el.dataset.k; const v = el.dataset.v;
      if (k === 'kind' && v !== d.kind) { d.q = ''; d.c = ''; }
      d[k] = d[k] === v && k === 'bank' ? '' : v; render(); break;
    }
    case 'addset': {
      const d = getDraft(date); const day = dayOf(date);
      const isTO = (d.kind || defaultKind(day)) === 'to';
      const q = intOrNull(d.q) ?? (isTO ? st.toQuestions : null); const c = intOrNull(d.c);
      if (!q || c === null) { toast('Enter the number of questions and how many you got right.'); return; }
      if (c > q) { toast('Correct can’t be more than the number of questions.'); return; }
      let subj = isTO ? '' : d.subj === 'MIX' ? d.subjOther || '' : d.subj ?? day.s1 ?? '';
      const sets = [...S.daySets(store.day(date)), { kind: isTO ? 'to' : 'set', q, c, subj, bank: d.bank || '' }];
      store.updateDay(date, { sets });
      ui.draft[date] = { kind: d.kind, subj: d.subj, subjOther: d.subjOther, bank: d.bank, q: '', c: '' };
      toast(`Logged ${c}/${q} · ${S.pct(c, q)}%`); break;
    }
    case 'delset': { const sets = [...S.daySets(store.day(date))]; sets.splice(+el.dataset.i, 1); store.updateDay(date, { sets }); break; }
    case 'accept': case 'dismiss': {
      const key = el.dataset.key;
      const s = S.suggestions(plan(), store.allDays(), st, todayStr()).find((x) => x.key === key);
      const dismissed = { ...(st.dismissed || {}), [key]: true };
      const patch = { dismissed };
      if (act === 'accept' && s) {
        const ov = { ...(st.overrides || {}) };
        if (s.accept.kind === 'override') ov[s.accept.date] = { ...(ov[s.accept.date] || {}), ...s.accept.patch };
        if (s.accept.kind === 'qFactor') s.accept.dates.forEach((d) => { ov[d] = { ...(ov[d] || {}), qFactor: s.accept.f }; });
        if (s.accept.kind === 'maintain') ov.__maintained = [...new Set([...(ov.__maintained || []), s.accept.subj])];
        patch.overrides = ov;
        if (s.accept.kind !== 'ack') toast('Plan updated.');
      }
      store.updateSettings(patch); break;
    }
    case 'ovtype': { const ov = { ...(st.overrides || {}) }; ov[date] = { type: el.dataset.v }; store.updateSettings({ overrides: ov }); toast('Day changed.'); break; }
    case 'ovreset': { const ov = { ...(st.overrides || {}) }; delete ov[date]; store.updateSettings({ overrides: ov }); break; }
    case 'clearov': store.updateSettings({ overrides: {} }); toast('Plan restored to the default.'); break;
    case 'adderr': {
      const d = ui.errDraft;
      if (!(d.note || '').trim()) { toast('Write the rule or discriminator first.'); return; }
      store.addError({ note: d.note.trim(), subj: d.subj || '', cat: d.cat || CATEGORIES[0], date: todayStr(), closed: false });
      ui.errDraft = { subj: d.subj, cat: d.cat }; toast('Added to error log.'); break;
    }
    case 'errtoggle': { const e = store.errors().find((x) => x.id === el.dataset.id); if (e) store.updateError(e.id, { closed: !e.closed }); break; }
    case 'errdel': store.deleteError(el.dataset.id); break;
    case 'errf': ui.errFilter.open = el.dataset.v === '1'; render(); break;
    case 'syncnow': await store.sync(); toast(store.status === 'idle' ? 'Synced.' : 'Sync didn’t finish. It will retry.'); render(); break;
    case 'signout': await store.signOut(); break;
    case 'export': {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ukmppd-planner-${todayStr()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); break;
    }
    case 'reset': ui.confirmReset = true; render(); break;
    case 'resetno': ui.confirmReset = false; render(); break;
    case 'resetyes': ui.confirmReset = false; await store.resetAll(); toast('All logs deleted.'); render(); break;
  }
});

$app.addEventListener('input', (ev) => {
  const el = ev.target; const k = el.dataset.in; if (!k) return;
  const date = el.dataset.date;
  if (k === 'q' || k === 'c') getDraft(date)[k] = el.value;
  else if (k === 'errNote') ui.errDraft.note = el.value;
});
$app.addEventListener('change', async (ev) => {
  const el = ev.target; const k = el.dataset.in; if (!k) return;
  const date = el.dataset.date;
  if (k === 'subj') getDraft(date).subj = el.value;
  else if (k === 'subjOther') getDraft(date).subjOther = el.value;
  else if (k === 'anki') store.updateDay(date, { anki: intOrNull(el.value) });
  else if (k === 'backlog') store.updateDay(date, { backlog: intOrNull(el.value) });
  else if (k === 'errSubj') ui.errDraft.subj = el.value;
  else if (k === 'errCat') ui.errDraft.cat = el.value;
  else if (k === 'errFilterSubj') { ui.errFilter.subj = el.value; el.blur(); render(); }
  else if (k === 'ov-s1' || k === 'ov-s2') {
    const st = settings(); const ov = { ...(st.overrides || {}) }; const day = dayOf(date);
    ov[date] = { ...(ov[date] || {}), type: 'drill', s1: day.s1, s2: day.s2, [k.slice(3)]: el.value };
    store.updateSettings({ overrides: ov });
  } else if (k.startsWith('set-')) {
    const id = k.slice(4); let v = el.value;
    if (['toQuestions', 'toMinutes', 'ankiTarget'].includes(id)) { v = intOrNull(v); if (!v) return; }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (id === 'examDate' && v <= DEFAULT_SETTINGS.startDate) { toast('The exam date must be after the plan start (1 Dec).'); return; }
    store.updateSettings({ [id]: v }); toast('Saved. The plan has been rebuilt.');
  } else if (k === 'import') {
    const file = el.files && el.files[0]; if (!file) return;
    try { store.importJSON(await file.text()); toast('Backup restored.'); } catch (e) { toast(e.message); }
  }
  if (['anki', 'backlog'].includes(k)) { el.blur(); }
});
$app.addEventListener('keydown', (ev) => {
  const el = ev.target;
  if (ev.key === 'Enter' && el.dataset && (el.dataset.in === 'q' || el.dataset.in === 'c')) { ev.preventDefault(); const b = $app.querySelector(`[data-act="addset"][data-date="${el.dataset.date}"]`); el.blur(); if (b) b.click(); }
  if (ev.key === 'Enter' && el.dataset && el.dataset.in === 'errNote') { ev.preventDefault(); el.blur(); const b = $app.querySelector('[data-act="adderr"]'); if (b) b.click(); }
  if (ev.key === 'Enter' && el.dataset && (el.dataset.in === 'anki' || el.dataset.in === 'backlog')) { ev.preventDefault(); el.blur(); }
});

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
store.subscribe(render);

// ---------- boot ----------
(async () => {
  const { needsSignIn } = await store.init();
  if (needsSignIn) viewSignIn(); else render();
  // refresh "now" highlighting every few minutes
  setInterval(() => { if (route().view === 'today') render(); }, 5 * 60 * 1000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
