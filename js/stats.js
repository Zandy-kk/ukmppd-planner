// Analytics + suggestion rules. Pure functions over the plan and the logs.
import { SUBJECT, SUBJECTS, addDays, weekStart, label, diffDays } from './schedule.js';

export const PASS_MARK = 66.38; // MCQs-CBT pass mark, Feb 2026 period (reference line only)
export const TARGET = 92;

export const pct = (c, q) => (q > 0 ? Math.round((c / q) * 1000) / 10 : null);

export function daySets(log) { return Array.isArray(log && log.sets) ? log.sets : []; }
export function dayTotals(log) {
  let q = 0, c = 0;
  daySets(log).forEach((s) => { q += +s.q || 0; c += +s.c || 0; });
  return { q, c, acc: pct(c, q) };
}
export function blocksDone(log, day) {
  const b = (log && log.blocks) || [];
  return day.blocks.reduce((n, _, i) => n + (b[i] ? 1 : 0), 0);
}

// All question sets (not TOs) flattened with their date.
export function allSets(logs) {
  const out = [];
  Object.keys(logs).sort().forEach((date) => daySets(logs[date]).forEach((s) => out.push({ ...s, date })));
  return out;
}
export function toResults(logs) {
  return allSets(logs).filter((s) => s.kind === 'to' && +s.q > 0).map((s) => ({ date: s.date, q: +s.q, c: +s.c, acc: pct(+s.c, +s.q), src: s.bank || '' }));
}

export function subjectStats(logs) {
  const by = {};
  SUBJECTS.forEach((s) => { by[s.id] = { id: s.id, q: 0, c: 0, sets: [], last: null }; });
  allSets(logs).filter((s) => s.kind !== 'to' && s.subj && by[s.subj]).forEach((s) => {
    const b = by[s.subj]; b.q += +s.q || 0; b.c += +s.c || 0; b.sets.push(s); b.last = s.date;
  });
  return Object.values(by).map((b) => {
    const recent = b.sets.slice(-4);
    const rq = recent.reduce((n, s) => n + (+s.q || 0), 0), rc = recent.reduce((n, s) => n + (+s.c || 0), 0);
    const lastTwo = b.sets.slice(-2).map((s) => pct(+s.c, +s.q));
    return { ...b, acc: pct(b.c, b.q), rolling: recent.length >= 2 ? pct(rc, rq) : null, nSets: b.sets.length, lastTwoHigh: lastTwo.length === 2 && lastTwo.every((a) => a >= 85) && b.sets.slice(-2)[0].date !== b.sets.slice(-1)[0].date };
  });
}

export function weekSummary(plan, logs, anyDate, today) {
  const ws = weekStart(anyDate), we = addDays(ws, 6);
  const days = plan.filter((d) => d.date >= ws && d.date <= we);
  let planned = 0, done = 0, q = 0, c = 0, tos = 0, tosPlanned = 0, anki = 0, logged = 0;
  days.forEach((d) => {
    const log = logs[d.date] || {};
    if (d.type === 'to') tosPlanned++;
    if (d.date <= today) { planned += d.blocks.length; done += blocksDone(log, d); }
    const t = dayTotals(log); q += t.q; c += t.c;
    tos += daySets(log).filter((s) => s.kind === 'to').length;
    anki += +log.anki || 0;
    if (Object.keys(log).length) logged++;
  });
  return { ws, we, planned, done, hours: done, adherence: planned ? Math.round((done / planned) * 100) : null, q, c, acc: pct(c, q), tos, tosPlanned, anki, logged, nDays: days.length };
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
// Returns [{key, tone, text, accept: {kind, ...}}]
export function suggestions(plan, logs, settings, today) {
  const out = [];
  const dismissed = settings.dismissed || {};
  const overrides = settings.overrides || {};
  const maintained = new Set((overrides.__maintained) || []);
  const wk = weekStart(today);
  const exam = plan.length ? plan[plan.length - 1].date : today;
  const future = plan.filter((d) => d.date > today && d.type !== 'taper' && d.type !== 'eve' && d.type !== 'exam');

  // 1. Repair: rolling accuracy < 70% on a red subject.
  const stats = subjectStats(logs);
  stats.filter((s) => s.rolling !== null && s.rolling < 70).sort((a, b) => a.rolling - b.rolling).forEach((s) => {
    const key = `repair:${s.id}:${wk}`;
    if (dismissed[key]) return;
    const already = Object.entries(overrides).some(([d, o]) => d > today && o && (o.repair === s.id || o.s2 === s.id));
    if (already) return;
    const target = future.find((d) => (d.type === 'drill' && d.s1 !== s.id && d.s2 !== s.id) || (d.type === 'focus' && !d.partTime && !d.repair && d.s1 !== s.id));
    if (!target) return;
    const how = target.type === 'drill' ? 'as the second drill subject' : 'in blocks 6–7';
    out.push({
      key, tone: 'warn',
      text: `${SUBJECT[s.id].name} rolling accuracy is <b>${s.rolling}%</b> over its last ${Math.min(s.nSets, 4)} sets. Add a repair session on ${label(target.date)} ${how}?`,
      accept: target.type === 'drill' ? { kind: 'override', date: target.date, patch: { s2: s.id } } : { kind: 'override', date: target.date, patch: { repair: s.id } },
    });
  });

  // 2. Maintain: two separate sets ≥ 85%.
  stats.filter((s) => s.lastTwoHigh && SUBJECT[s.id].tier !== 'M' && !maintained.has(s.id)).forEach((s) => {
    const key = `maintain:${s.id}`;
    if (dismissed[key]) return;
    out.push({ key, tone: 'good', text: `${SUBJECT[s.id].name} scored 85%+ on two separate sets. Switch it to maintenance (mixed questions + retrieval) and free its drill slots for weaker subjects?`, accept: { kind: 'maintain', subj: s.id } });
  });

  // 3. Energy ≤ 2 for 3 logged days in a row.
  const e = [0, 1, 2].map((i) => (logs[addDays(today, -i)] || {}).energy);
  if (e.every((v) => v && v <= 2)) {
    const key = `energy:${today}`;
    if (!dismissed[key]) out.push({ key, tone: 'warn', text: 'Energy has been 2 or lower for 3 days. Cut question targets by about 40% for the next 48 hours and protect sleep?', accept: { kind: 'qFactor', dates: [today, addDays(today, 1)], f: 0.6 } });
  }

  // 4. Adherence last week < 80%.
  const lastWk = addDays(wk, -7);
  if (plan.length && lastWk >= weekStart(plan[0].date)) {
    const s = weekSummary(plan, logs, lastWk, addDays(wk, -1));
    const key = `adh:${wk}`;
    if (s.planned >= 15 && s.adherence !== null && s.adherence < 80 && !dismissed[key]) {
      const dates = []; for (let i = 0; i < 7; i++) { const d = addDays(wk, i); if (d >= today && d < exam) dates.push(d); }
      out.push({ key, tone: 'warn', text: `Last week you completed <b>${s.adherence}%</b> of planned blocks. Lower this week's question targets by about 13% and rebuild a steady rhythm?`, accept: { kind: 'qFactor', dates, f: 0.87 } });
    }
  }

  // 5. Anki backlog.
  const latest = Object.keys(logs).filter((d) => d <= today && logs[d] && +logs[d].backlog > 0).sort().pop();
  if (latest && diffDays(latest, today) <= 2) {
    const key = `anki:${latest}`;
    if (!dismissed[key]) out.push({ key, tone: 'info', text: `Anki backlog is <b>${logs[latest].backlog}</b>. Set new cards to 0 and clear due reviews first until the backlog is gone.`, accept: { kind: 'ack' } });
  }
  return out;
}
