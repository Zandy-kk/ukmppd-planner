// Schedule engine: turns settings into a day-by-day plan of steps.
// Pure functions only (no DOM, no storage) so it can be tested in Node.

// parts = lecture hours per part (Medsense rewatch). tier: P = Priority, S = Strengthen, M = Maintain.
export const SUBJECTS = [
  { id: 'CARD', name: 'Cardiology', short: 'Cardio', code: 'Cardio', parts: [4], tier: 'P' },
  { id: 'HEMA', name: 'Hematology & Immunology', short: 'Hema', code: 'Hema', parts: [3], tier: 'P' },
  { id: 'ENDO', name: 'Endocrinology, Metabolism & Nutrition', short: 'Endo', code: 'Endo', parts: [3.5], tier: 'P' },
  { id: 'DERM', name: 'Dermatovenerology', short: 'Derm', code: 'Derm', parts: [4, 3.5], tier: 'P' },
  { id: 'GI', name: 'Gastrointestinal & Hepatobiliary', short: 'GI', code: 'GI', parts: [3.5], tier: 'S' },
  { id: 'INF', name: 'Infectious Diseases', short: 'Infectious', code: 'Infect', parts: [3.5], tier: 'S' },
  { id: 'NEPH', name: 'Nephrology & Urology', short: 'Nephro', code: 'Nephro', parts: [4], tier: 'S' },
  { id: 'NEURO', name: 'Neurology', short: 'Neuro', code: 'Neuro', parts: [3, 3], tier: 'S' },
  { id: 'OBGYN', name: 'Obstetrics & Gynecology', short: 'ObGyn', code: 'ObGyn', parts: [4, 3.5], tier: 'S' },
  { id: 'PED', name: 'Pediatrics', short: 'Peds', code: 'Peds', parts: [4, 3.5], tier: 'S' },
  { id: 'PULM', name: 'Pulmonology', short: 'Pulmo', code: 'Pulmo', parts: [4.5], tier: 'S' },
  { id: 'RHEUM', name: 'Rheumatology', short: 'Rheum', code: 'Rheum', parts: [4], tier: 'S' },
  { id: 'SURG', name: 'Surgery', short: 'Surgery', code: 'Surg', parts: [3.5, 3.5], tier: 'S' },
  { id: 'ENT', name: 'ENT', short: 'ENT', code: 'ENT', parts: [4], tier: 'M' },
  { id: 'FOR', name: 'Forensic Medicine & Bioethics', short: 'Forensic', code: 'Foren', parts: [3], tier: 'M' },
  { id: 'OPH', name: 'Ophthalmology', short: 'Ophtha', code: 'Ophtha', parts: [3, 2.5], tier: 'M' },
  { id: 'PSY', name: 'Psychiatry', short: 'Psych', code: 'Psych', parts: [4], tier: 'M' },
  { id: 'PH', name: 'Public Health & Statistics', short: 'Public Health', code: 'PH', parts: [4], tier: 'M' },
];
export const SUBJECT = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const TIERS = { P: 'Priority', S: 'Strengthen', M: 'Maintain' };
export const tierOf = (id, tiers = {}) => tiers[id] || (SUBJECT[id] && SUBJECT[id].tier) || 'S';
export const partLabel = (id, i) => (SUBJECT[id].parts.length > 1 ? `${SUBJECT[id].short} ${i + 1}` : SUBJECT[id].short);

export const DEFAULT_SETTINGS = {
  startDate: '2026-12-01',
  fullTimeStart: '2026-12-25',
  materialEnd: '2027-01-17',
  examDate: '2027-02-28',
  ramadanStart: '2027-02-08',
  ramadanEnd: '2027-03-09',
  toQuestions: 150,
  toMinutes: 180,
  ankiTarget: 100,
};

// Lecture order: Priority + Strengthen in December, Maintain after Dec 25.
const LECTURE_ORDER = ['CARD', 'HEMA', 'ENDO', 'DERM', 'GI', 'INF', 'NEPH', 'NEURO', 'OBGYN', 'PED', 'PULM', 'RHEUM', 'SURG', 'ENT', 'FOR', 'OPH', 'PSY', 'PH'];
export const LECTURE_PARTS = LECTURE_ORDER.flatMap((id) => SUBJECT[id].parts.map((h, i) => ({ id, part: i, hours: h, key: `${id}#${i}` })));

// ---------- date helpers ('YYYY-MM-DD' strings, no time zones) ----------
export function parse(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
export function fmt(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(d, n) { const t = parse(d); t.setUTCDate(t.getUTCDate() + n); return fmt(t); }
export function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
export function dow(d) { return parse(d).getUTCDay(); } // 0 Sun … 6 Sat
export function weekStart(d) { const w = dow(d); return addDays(d, w === 0 ? -6 : 1 - w); }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function label(d, opts = {}) {
  const t = parse(d);
  if (opts.long) return `${DOWL[t.getUTCDay()]}, ${t.getUTCDate()} ${MONL[t.getUTCMonth()]}`;
  const s = `${DOW[t.getUTCDay()]} ${t.getUTCDate()} ${MON[t.getUTCMonth()]}`;
  return opts.year ? `${s} ${t.getUTCFullYear()}` : s;
}
export const monthName = (m) => MONL[m];
export const inRange = (d, a, b) => d >= a && d <= b;

export function fmtH(h) {
  if (!h) return '0 h';
  const H = Math.floor(h + 1e-9), M = Math.round((h - H) * 60);
  return M ? (H ? `${H} h ${M} m` : `${M} m`) : `${H} h`;
}

// ---------- queues that depend on tiers ----------
function reviewSlots(tiers, n) {
  const P = LECTURE_ORDER.filter((id) => tierOf(id, tiers) === 'P');
  const S = LECTURE_ORDER.filter((id) => tierOf(id, tiers) === 'S');
  const out = [];
  for (let i = 0; i < Math.max(P.length, S.length); i++) { if (P[i]) out.push(P[i]); if (S[i]) out.push(S[i]); }
  out.push(...P);                           // Priority gets a second review
  while (out.length < n) out.push('FLEX');  // filled with your weakest subjects
  return out.slice(0, n);
}
function drillQueue(tiers) {
  const P = LECTURE_ORDER.filter((id) => tierOf(id, tiers) === 'P');
  const S = LECTURE_ORDER.filter((id) => tierOf(id, tiers) === 'S');
  const out = [];
  // Priority subjects appear twice per cycle, Strengthen once.
  for (let i = 0; i < Math.max(P.length * 2, S.length); i++) { if (P[i % P.length] && i < P.length * 2) out.push(P[i % P.length]); if (S[i]) out.push(S[i]); }
  return out.length ? out : LECTURE_ORDER.slice();
}
// pair slots so the two subjects of a day differ
function pairUp(list) {
  const pairs = [];
  const q = list.slice();
  while (q.length) {
    const a = q.shift();
    let j = q.findIndex((x) => x !== a || x === 'FLEX');
    if (j < 0) j = 0;
    const b = q.length ? q.splice(j, 1)[0] : 'FLEX';
    pairs.push([a, b]);
  }
  return pairs;
}

// ---------- step templates ----------
// Each step: { key, title, detail, hours, kind } — kind: lecture | rewatch | practice | to | review | anki | other
const S_ = (key, title, detail, hours, kind = 'other', extra = {}) => ({ key, title, detail, hours, kind, ...extra });

function stepsFor(day, st) {
  const nm = (id) => SUBJECT[id].name;
  const ram = day.ramadan;
  switch (day.type) {
    case 'lecture': {
      const L = day.lecture; const s = SUBJECT[L.id];
      const lt = `Rewatch lecture · ${s.name}${s.parts.length > 1 ? ` part ${L.part + 1}` : ''}`;
      if (day.partTime) return [
        S_('lec', lt, 'Medsense · note one fact per topic that separates it from look-alikes', L.hours, 'lecture', { lecture: L.key }),
        S_(`q:${L.id}`, `Quick questions · ${s.short}`, 'Only if time is left · 15–20 Q, otherwise Saturday covers it', 0.4, 'practice', { optional: true, subj: L.id }),
        S_('anki', 'Anki · due cards', 'Keep the queue at zero; new cards on full days', 0.3, 'anki'),
      ];
      return [
        S_('lec', lt, 'Medsense · note one fact per topic that separates it from look-alikes', L.hours, 'lecture', { lecture: L.key }),
        S_(`q:${L.id}`, `Practice questions · ${s.short}`, '60–80 Q, about 1 min each', 1.5, 'practice', { subj: L.id }),
        S_('rev', 'Review + error log', 'Every wrong or guessed answer → one-line rule · flag “rewatch” if you still don’t get it', 1, 'review'),
        S_('anki', 'Anki', `${st.ankiTarget} cards · due first, then new from ${s.short}`, 0.75, 'anki'),
      ];
    }
    case 'practice': {
      const per = day.partTime ? '30–40 Q' : '50 Q';
      return [
        ...day.subjects.map((id) => S_(`q:${id}`, `Practice questions · ${SUBJECT[id].short}`, per, day.partTime ? 0.6 : 1, 'practice', { subj: id })),
        S_('rev', 'Review + error log', 'One-line rule per miss · flag “rewatch” items', day.partTime ? 0.75 : 1.5, 'review'),
        S_('anki', 'Anki', day.partTime ? 'Due cards' : `${st.ankiTarget} cards · due first`, day.partTime ? 0.3 : 0.75, 'anki'),
      ];
    }
    case 'review':
      return [
        ...day.subjects.flatMap((id) => [
          S_(`rw:${id}`, `Rewatch what you’re stuck on · ${SUBJECT[id].short}`, 'Only the concepts flagged in your error log · max ~1 h', 1, 'rewatch', { subj: id }),
          S_(`q:${id}`, `Practice questions · ${SUBJECT[id].short}`, '50–60 Q', 1, 'practice', { subj: id }),
        ]),
        S_('rev', 'Review + error log', 'Close the rewatch items you now understand', 1, 'review'),
        S_('anki', 'Anki', `${st.ankiTarget} cards · due first`, 0.75, 'anki'),
      ];
    case 'to': {
      const toH = st.toMinutes / 60;
      return [
        S_('to', `Full TO · ${st.toQuestions} Q`, `${st.toMinutes} min · locked sections, no going back`, toH, 'to'),
        S_('torev', 'Review misses + guesses', 'Same day · pick your top 3 repair themes', ram ? 1.75 : 2.5, 'review'),
        S_('rev', 'Error log', 'One-line rule per miss · flag “rewatch” items', ram ? 0.5 : 0.75, 'review'),
        S_('anki', 'Anki · due cards', 'No new cards on TO days', 0.5, 'anki'),
      ];
    }
    case 'drill':
      return [
        S_(`q:${day.subjects[0]}`, `Practice questions · ${SUBJECT[day.subjects[0]].short}`, ram ? '40–50 Q' : '60 Q', ram ? 0.9 : 1.25, 'practice', { subj: day.subjects[0] }),
        S_(`q:${day.subjects[1]}`, `Practice questions · ${SUBJECT[day.subjects[1]].short}`, ram ? '40–50 Q' : '60 Q', ram ? 0.9 : 1.25, 'practice', { subj: day.subjects[1] }),
        S_('rev', 'Review + error log', '5–10 min lookups only · no lecture rewatching in Phase 2', ram ? 1.25 : 2, 'review'),
        S_('retest', 'Error-log retest', 'Cover the rule, answer from memory, close what you now know', ram ? 0.75 : 1, 'other'),
        S_('anki', 'Anki', `${st.ankiTarget} cards · due first`, 0.75, 'anki'),
      ];
    case 'light':
      return [
        S_('recap', 'Read your weekly recap', 'Below · pick next week’s 3 repair targets', 0.25, 'other'),
        S_('carry', 'Clear anything carried over', 'Unfinished lectures or sets from this week', 1, 'other', { optional: true }),
        S_('mix', 'Mixed questions from the error log', '20–30 Q', 0.75, 'practice'),
        S_('anki', 'Anki · due cards', 'Then stop · rest is part of the plan', 0.5, 'anki'),
      ];
    case 'taper':
      return [
        S_('q', 'Short timed set', `40–60 Q${day.subjects && day.subjects[0] ? ` · ${SUBJECT[day.subjects[0]].short}` : ' · mixed weak areas'}`, 1, 'practice', day.subjects && day.subjects[0] ? { subj: day.subjects[0] } : {}),
        S_('rev', 'Review misses only', 'Fix recurring errors, no new content', 1, 'review'),
        S_('retest', 'Error-log retrieval', 'Top corrections, out loud', 0.75, 'other'),
        S_('anki', 'Anki · due only', '', 0.5, 'anki'),
      ];
    case 'eve':
      return [
        S_('skim', 'Skim your error log', 'Top corrections only', 0.75, 'other'),
        S_('logi', 'Logistics', 'Exam card, ID, route, timing, clothes, food', 0.5, 'other'),
        S_('anki', 'Anki · due only, stop early', 'Sleep on time', 0.3, 'anki'),
      ];
    default: return [];
  }
}

function targetsFor(day, st, f = 1) {
  const r = (a, b) => [Math.round((a * f) / 5) * 5, Math.round((b * f) / 5) * 5];
  let q = [0, 0];
  switch (day.type) {
    case 'lecture': q = day.partTime ? [0, 20] : r(60, 80); break;
    case 'practice': q = day.partTime ? r(day.subjects.length * 30, day.subjects.length * 40) : r(day.subjects.length * 50, day.subjects.length * 50); break;
    case 'review': q = r(100, 120); break;
    case 'drill': q = day.ramadan ? r(80, 100) : r(110, 130); break;
    case 'to': q = [st.toQuestions, st.toQuestions]; break;
    case 'light': q = [20, 30]; break;
    case 'taper': q = [40, 60]; break;
  }
  const anki = ['lecture', 'practice', 'review', 'drill'].includes(day.type) && !day.partTime ? st.ankiTarget : 0;
  return { q, anki, ankiNote: anki ? 'due first, then new' : 'due cards only' };
}

// ---------- main generator ----------
// ctx.weakest: subject ids ordered weakest-first (from stats) used for FLEX slots.
export function buildPlan(settingsIn = {}, ctx = {}) {
  const st = { ...DEFAULT_SETTINGS, ...settingsIn };
  const tiers = st.tiers || {};
  const overrides = st.overrides || {};
  const exam = st.examDate;
  const taperStart = addDays(exam, -6);
  const weakest = (ctx.weakest || []).filter((id) => tierOf(id, tiers) !== 'M');
  const days = [];

  // Pre-count review days so review slots can be sized.
  let lecIdx = 0, pending = [], lectured = {}, reviewDays = [];
  const lastSatBeforeCut = addDays(st.materialEnd, -((dow(st.materialEnd) + 1) % 7));

  for (let d = st.startDate; d <= exam; d = addDays(d, 1)) {
    const w = dow(d);
    const ramadan = inRange(d, st.ramadanStart, st.ramadanEnd);
    const partTime = d < st.fullTimeStart;
    let day = { date: d, ramadan, partTime };

    if (d === exam) day = { ...day, type: 'exam', phase: 'Exam', title: 'CBT exam day' };
    else if (d === addDays(exam, -1)) day = { ...day, type: 'eve', phase: 'Taper', title: 'Exam eve · light review + logistics' };
    else if (d >= taperStart) {
      const pri = LECTURE_ORDER.filter((id) => tierOf(id, tiers) === 'P');
      const i = diffDays(taperStart, d);
      const s = i < 4 ? (pri[i] || weakest[i] || null) : null;
      day = { ...day, type: 'taper', phase: 'Taper', subjects: s ? [s] : [], title: s ? `Taper · ${SUBJECT[s].name}` : 'Taper · mixed weak areas' };
    } else if (w === 0) {
      day = { ...day, type: 'light', phase: d <= st.materialEnd ? 'Phase 1' : 'Phase 2', title: 'Light day · recap + rest' };
    } else if (d <= st.materialEnd) {
      // Phase 1 · material
      const isSat = w === 6;
      const fullTimeFirstDay = !partTime && pending.length;
      if ((partTime && isSat) || fullTimeFirstDay) {
        day = { ...day, type: 'practice', phase: 'Phase 1', subjects: pending.slice(), title: pending.length ? `Practice day · ${pending.map((s) => SUBJECT[s].short).join(', ')}` : 'Practice day · catch-up' };
        if (!pending.length) day.subjects = [];
        pending = [];
      } else if (!partTime && isSat && d !== lastSatBeforeCut) {
        day = { ...day, type: 'to', phase: 'Phase 1', title: 'Full TO + review' };
      } else if (lecIdx < LECTURE_PARTS.length) {
        const L = LECTURE_PARTS[lecIdx++];
        day = { ...day, type: 'lecture', phase: 'Phase 1', lecture: L, subjects: [L.id], title: `Lecture · ${SUBJECT[L.id].name}${SUBJECT[L.id].parts.length > 1 ? ` part ${L.part + 1}` : ''}` };
        lectured[L.id] = (lectured[L.id] || 0) + 1;
        // part-time lecture days are practised on Saturday once every part is watched
        if (partTime && lectured[L.id] === SUBJECT[L.id].parts.length) pending.push(L.id);
      } else {
        day = { ...day, type: 'review', phase: 'Phase 1', subjects: [], title: 'Review day' };
        reviewDays.push(day);
      }
    } else {
      // Phase 2 · practice only
      const isTO = ramadan ? (w === 1 || w === 3 || w === 5) : w !== 3;
      day = isTO ? { ...day, type: 'to', phase: 'Phase 2', title: 'Full TO + review' } : { ...day, type: 'drill', phase: 'Phase 2', subjects: [], title: 'Drill day' };
    }
    days.push(day);
  }

  // Fill review-day subjects.
  const slots = pairUp(reviewSlots(tiers, reviewDays.length * 2));
  let flexI = 0;
  const flex = (avoid) => {
    const pool = weakest.length ? weakest : LECTURE_ORDER.filter((id) => tierOf(id, tiers) === 'P');
    for (let k = 0; k < pool.length; k++) { const c = pool[(flexI + k) % pool.length]; if (c !== avoid) { flexI = (flexI + k + 1) % pool.length; return c; } }
    return pool[0] || 'CARD';
  };
  reviewDays.forEach((day, i) => {
    let [a, b] = slots[i] || ['FLEX', 'FLEX'];
    if (a === 'FLEX') a = flex(b);
    if (b === 'FLEX') b = flex(a);
    day.subjects = [a, b];
    day.flex = (slots[i] || []).includes('FLEX');
    day.title = `Review · ${SUBJECT[a].short} + ${SUBJECT[b].short}`;
  });
  // Fill drill-day subjects.
  const dq = drillQueue(tiers);
  const dpairs = pairUp(Array.from({ length: days.filter((x) => x.type === 'drill').length * 2 }, (_, i) => dq[i % dq.length]));
  days.filter((x) => x.type === 'drill').forEach((day, i) => { day.subjects = dpairs[i]; day.title = `Drill · ${SUBJECT[day.subjects[0]].short} + ${SUBJECT[day.subjects[1]].short}`; });

  // Apply per-day overrides (Phase 2 type/subject changes, target factors) and build steps.
  let extraDrill = 0;
  days.forEach((day) => {
    const ov = overrides[day.date] || {};
    if (ov.type && ov.type !== day.type && day.phase === 'Phase 2') {
      day.type = ov.type;
      if (ov.type === 'to') { day.title = 'Full TO + review'; day.subjects = []; }
      if (ov.type === 'light') { day.title = 'Light day · recap + rest'; day.subjects = []; }
      if (ov.type === 'drill') { day.subjects = [dq[extraDrill % dq.length], dq[(extraDrill + 1) % dq.length]]; extraDrill += 2; }
    }
    if ((day.type === 'drill' || day.type === 'review') && (ov.s1 || ov.s2)) day.subjects = [ov.s1 || day.subjects[0], ov.s2 || day.subjects[1]];
    if (day.type === 'drill') day.title = `Drill · ${SUBJECT[day.subjects[0]].short} + ${SUBJECT[day.subjects[1]].short}`;
    if (day.type === 'review') day.title = `Review · ${SUBJECT[day.subjects[0]].short} + ${SUBJECT[day.subjects[1]].short}`;
    day.steps = stepsFor(day, st);
    day.hours = day.steps.filter((s) => !s.optional).reduce((n, s) => n + s.hours, 0);
    day.targets = targetsFor(day, st, ov.qFactor || 1);
  });
  return days;
}

export const TYPE_LABEL = { lecture: 'Lecture day', practice: 'Practice day', review: 'Review day', to: 'TO day', drill: 'Drill day', light: 'Light day', taper: 'Taper', eve: 'Exam eve', exam: 'Exam' };

// Past days keep what was planned when you logged them (tier changes don't rewrite history).
export function snapshotOf(day) { return { type: day.type, subjects: day.subjects || [], lecture: day.lecture || null, title: day.title }; }
export function materialize(planDay, log, settingsIn = {}) {
  const snap = log && log.snap;
  if (!snap || (snap.type === planDay.type && JSON.stringify(snap.subjects || []) === JSON.stringify(planDay.subjects || []))) return planDay;
  const st = { ...DEFAULT_SETTINGS, ...settingsIn };
  const day = { ...planDay, type: snap.type, subjects: snap.subjects || [], lecture: snap.lecture || planDay.lecture, title: snap.title || planDay.title };
  day.steps = stepsFor(day, st);
  day.hours = day.steps.filter((s) => !s.optional).reduce((n, s) => n + s.hours, 0);
  day.targets = targetsFor(day, st, ((st.overrides || {})[day.date] || {}).qFactor || 1);
  return day;
}
