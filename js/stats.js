// Analytics, carry-over, lecture progress, weekly recap and suggestion rules.
// Pure functions over the plan and the logs.
import { SUBJECT, SUBJECTS, LECTURE_PARTS, TIERS, tierOf, addDays, weekStart, label, diffDays } from './schedule.js';

export const PASS_MARK = 66.38; // MCQs-CBT pass mark, Feb 2026 period (reference line only)
export const TARGET = 92;

export const pct = (c, q) => (q > 0 ? Math.round((c / q) * 1000) / 10 : null);
export const daySets = (log) => (Array.isArray(log && log.sets) ? log.sets : []);
export function dayTotals(log) {
  let q = 0, c = 0;
  daySets(log).forEach((s) => { q += +s.q || 0; c += +s.c || 0; });
  return { q, c, acc: pct(c, q) };
}
export const isDone = (log, key) => !!(log && log.done && log.done[key]);
export function stepsDone(day, log) { return day.steps.filter((s) => isDone(log, s.key)); }
export function hoursDone(day, log) { return stepsDone(day, log).reduce((n, s) => n + s.hours, 0); }
export function required(day) { return day.steps.filter((s) => !s.optional); }

export function allSets(logs) {
  const out = [];
  Object.keys(logs).sort().forEach((date) => daySets(logs[date]).forEach((s) => out.push({ ...s, date })));
  return out;
}
export function toResults(logs) {
  return allSets(logs).filter((s) => s.kind === 'to' && +s.q > 0).map((s) => ({ date: s.date, q: +s.q, c: +s.c, acc: pct(+s.c, +s.q), src: s.bank || '' }));
}

export function subjectStats(logs, tiers = {}) {
  const by = {};
  SUBJECTS.forEach((s) => { by[s.id] = { id: s.id, tier: tierOf(s.id, tiers), q: 0, c: 0, sets: [], last: null }; });
  allSets(logs).filter((s) => s.kind !== 'to' && s.subj && by[s.subj]).forEach((s) => {
    const b = by[s.subj]; b.q += +s.q || 0; b.c += +s.c || 0; b.sets.push(s); b.last = s.date;
  });
  return Object.values(by).map((b) => {
    const recent = b.sets.slice(-4);
    const rq = recent.reduce((n, s) => n + (+s.q || 0), 0), rc = recent.reduce((n, s) => n + (+s.c || 0), 0);
    const lastTwo = b.sets.slice(-2);
    const lastTwoHigh = lastTwo.length === 2 && lastTwo.every((s) => pct(+s.c, +s.q) >= 85) && lastTwo[0].date !== lastTwo[1].date;
    return { ...b, acc: pct(b.c, b.q), rolling: recent.length >= 2 ? pct(rc, rq) : null, nSets: b.sets.length, lastTwoHigh };
  });
}
export function weakestIds(logs, tiers) {
  return subjectStats(logs, tiers).filter((s) => s.rolling !== null).sort((a, b) => a.rolling - b.rolling).map((s) => s.id);
}

// ---------- lecture progress ----------
export function lectureProgress(plan, logs) {
  const done = new Set();
  Object.values(logs).forEach((l) => { if (l && l.lec && l.done && l.done.lec) done.add(l.lec); });
  const bySubj = {};
  LECTURE_PARTS.forEach((p) => {
    const b = bySubj[p.id] || (bySubj[p.id] = { id: p.id, parts: [], done: 0 });
    const d = done.has(p.key);
    b.parts.push({ ...p, done: d, date: (plan.find((x) => x.lecture && x.lecture.key === p.key) || {}).date });
    if (d) b.done++;
  });
  return { bySubj, done: done.size, total: LECTURE_PARTS.length, hoursDone: LECTURE_PARTS.filter((p) => done.has(p.key)).reduce((n, p) => n + p.hours, 0), hoursTotal: LECTURE_PARTS.reduce((n, p) => n + p.hours, 0) };
}

// ---------- carry-over: unfinished important steps from the last 14 days ----------
const CARRY_KINDS = new Set(['lecture', 'rewatch', 'practice', 'to']);
export function carryOver(plan, logs, today, materialize) {
  const out = [];
  plan.forEach((pd) => {
    if (pd.date >= today || diffDays(pd.date, today) > 14) return;
    const log = logs[pd.date] || {};
    const day = materialize(pd, log);
    day.steps.forEach((s) => {
      if (!CARRY_KINDS.has(s.kind) || s.optional || isDone(log, s.key) || (log.dropped && log.dropped[s.key])) return;
      out.push({ date: pd.date, key: s.key, title: s.title, hours: s.hours, kind: s.kind, lecture: s.lecture });
    });
  });
  return out;
}
// The next Saturday practice day or Sunday light day, where carried items fit best.
export function nextCatchUp(plan, today) {
  const d = plan.find((x) => x.date >= today && (x.type === 'light' || x.type === 'practice'));
  return d ? d.date : null;
}

// ---------- weekly summary / recap ----------
export function weekSummary(plan, logs, anyDate, today, materialize, errors = []) {
  const ws = weekStart(anyDate), we = addDays(ws, 6);
  const days = plan.filter((d) => d.date >= ws && d.date <= we);
  let planned = 0, doneN = 0, hours = 0, q = 0, c = 0, tos = 0, tosPlanned = 0, anki = 0;
  days.forEach((pd) => {
    const log = logs[pd.date] || {};
    const d = materialize(pd, log);
    if (d.type === 'to') tosPlanned++;
    if (d.date <= today) { planned += required(d).length; doneN += required(d).filter((s) => isDone(log, s.key)).length; }
    hours += hoursDone(d, log);
    const t = dayTotals(log); q += t.q; c += t.c;
    tos += daySets(log).filter((s) => s.kind === 'to').length;
    anki += +log.anki || 0;
  });
  const wkSets = {};
  days.forEach((d) => daySets(logs[d.date]).filter((s) => s.kind !== 'to' && s.subj).forEach((s) => { const b = wkSets[s.subj] || (wkSets[s.subj] = { q: 0, c: 0 }); b.q += +s.q; b.c += +s.c; }));
  const weakest = Object.entries(wkSets).map(([id, v]) => ({ id, acc: pct(v.c, v.q), q: v.q })).sort((a, b) => a.acc - b.acc).slice(0, 3);
  const rewatchOpen = errors.filter((e) => e.rewatch && !e.closed).length;
  return { ws, we, planned, done: doneN, hours, adherence: planned ? Math.round((doneN / planned) * 100) : null, q, c, acc: pct(c, q), tos, tosPlanned, anki, weakest, rewatchOpen };
}

export function weeklySeries(plan, logs, today) {
  if (!plan.length) return [];
  const out = [];
  for (let ws = weekStart(plan[0].date); ws <= weekStart(plan[plan.length - 1].date); ws = addDays(ws, 7)) {
    if (ws > today) break;
    let q = 0, c = 0;
    for (let i = 0; i < 7; i++) daySets(logs[addDays(ws, i)]).filter((s) => s.kind !== 'to').forEach((s) => { q += +s.q || 0; c += +s.c || 0; });
    out.push({ ws, q, acc: pct(c, q) });
  }
  return out;
}

// ---------- suggestions ----------
export function suggestions(plan, logs, settings, today, materialize) {
  const out = [];
  const dismissed = settings.dismissed || {};
  const tiers = settings.tiers || {};
  const wk = weekStart(today);
  const exam = plan.length ? plan[plan.length - 1].date : today;

  // 1. Tier moves from rolling accuracy.
  subjectStats(logs, tiers).forEach((s) => {
    if (s.rolling === null) return;
    let to = null, why = '';
    if (s.rolling < 70 && s.tier !== 'P') { to = 'P'; why = `is at <b>${Math.round(s.rolling)}%</b> over its last ${Math.min(s.nSets, 4)} sets`; }
    else if (s.lastTwoHigh && s.tier !== 'M') { to = 'M'; why = 'scored <b>85%+</b> on two separate days'; }
    else if (s.tier === 'P' && s.nSets >= 3 && s.rolling >= 78 && s.rolling < 85) { to = 'S'; why = `is up to <b>${Math.round(s.rolling)}%</b>`; }
    if (!to) return;
    const key = `tier:${s.id}:${to}:${wk}`;
    if (dismissed[key]) return;
    const effect = to === 'P' ? 'It gets more review and drill slots.' : to === 'M' ? 'Its drill slots go to weaker subjects; TOs keep it fresh.' : 'It keeps drills but frees a Priority slot.';
    out.push({ key, tone: to === 'M' ? 'good' : 'warn', text: `${SUBJECT[s.id].name} ${why}. Move it from ${TIERS[s.tier]} to <b>${TIERS[to]}</b>? ${effect}`, accept: { kind: 'tier', subj: s.id, tier: to } });
  });

  // 2. Energy ≤ 2 for 3 logged days in a row.
  const e = [0, 1, 2].map((i) => (logs[addDays(today, -i)] || {}).energy);
  if (e.every((v) => v && v <= 2)) {
    const key = `energy:${today}`;
    if (!dismissed[key]) out.push({ key, tone: 'warn', text: 'Energy has been 2 or lower for 3 days. Cut question targets by about 40% for the next 48 hours and protect your sleep?', accept: { kind: 'qFactor', dates: [today, addDays(today, 1)], f: 0.6 } });
  }

  // 3. Last week's adherence < 80%.
  const lastWk = addDays(wk, -7);
  if (plan.length && lastWk >= weekStart(plan[0].date)) {
    const s = weekSummary(plan, logs, lastWk, addDays(wk, -1), materialize);
    const key = `adh:${wk}`;
    if (s.planned >= 10 && s.adherence !== null && s.adherence < 80 && !dismissed[key]) {
      const dates = []; for (let i = 0; i < 7; i++) { const d = addDays(wk, i); if (d >= today && d < exam) dates.push(d); }
      out.push({ key, tone: 'warn', text: `Last week you finished <b>${s.adherence}%</b> of planned steps. Lower this week's question targets by about 13% to rebuild a steady rhythm?`, accept: { kind: 'qFactor', dates, f: 0.87 } });
    }
  }

  // 4. Anki backlog.
  const latest = Object.keys(logs).filter((d) => d <= today && logs[d] && +logs[d].backlog > 0).sort().pop();
  if (latest && diffDays(latest, today) <= 2) {
    const key = `anki:${latest}`;
    if (!dismissed[key]) out.push({ key, tone: 'info', text: `Anki backlog is <b>${logs[latest].backlog}</b>. Set new cards to 0 and clear due reviews first until it's gone.`, accept: { kind: 'ack' } });
  }
  return out;
}
