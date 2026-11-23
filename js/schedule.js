// Schedule engine: turns settings + overrides into a day-by-day plan.
// Pure functions only (no DOM, no storage) so it can be tested in Node.

export const SUBJECTS = [
  { id: 'CARD', name: 'Cardiology', tier: 'A' },
  { id: 'HEMA', name: 'Hematology & Immunology', tier: 'A' },
  { id: 'ENDO', name: 'Endocrinology, Metabolism & Nutrition', tier: 'A' },
  { id: 'DERM', name: 'Dermatovenerology', tier: 'A' },
  { id: 'GI', name: 'Gastrointestinal & Hepatobiliary', tier: 'B' },
  { id: 'INF', name: 'Infectious Diseases', tier: 'B' },
  { id: 'NEPH', name: 'Nephrology & Urology', tier: 'B' },
  { id: 'NEURO', name: 'Neurology', tier: 'B' },
  { id: 'OBGYN', name: 'Obstetrics & Gynecology', tier: 'B' },
  { id: 'PED', name: 'Pediatrics', tier: 'B' },
  { id: 'PULM', name: 'Pulmonology', tier: 'B' },
  { id: 'RHEUM', name: 'Rheumatology', tier: 'B' },
  { id: 'SURG', name: 'Surgery', tier: 'B' },
  { id: 'ENT', name: 'ENT', tier: 'M' },
  { id: 'FOR', name: 'Forensic Medicine & Bioethics', tier: 'M' },
  { id: 'OPH', name: 'Ophthalmology', tier: 'M' },
  { id: 'PSY', name: 'Psychiatry', tier: 'M' },
  { id: 'PH', name: 'Public Health & Statistics', tier: 'M' },
];
export const SUBJECT = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const rating = (id) => (SUBJECT[id] && SUBJECT[id].tier === 'M' ? 'Y' : 'R');

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

// Pass 1 (Dec 1–24): every subject once, in the protocol's order.
const PASS1 = ['CARD', 'HEMA', 'ENDO', 'DERM', 'GI', 'INF', 'NEPH', 'NEURO', 'OBGYN', 'PED', 'PULM', 'RHEUM', 'SURG', 'ENT', 'FOR', 'OPH', 'PSY', 'PH'];
// Pass 2 (Dec 25 → material end): Tier A twice, Tier B once, interleaved.
const PASS2 = ['CARD', 'GI', 'HEMA', 'INF', 'ENDO', 'NEPH', 'DERM', 'NEURO', 'CARD', 'OBGYN', 'HEMA', 'PED', 'ENDO', 'PULM', 'DERM', 'RHEUM', 'SURG'];
// Drill rotation (practice phase): red subjects, Tier A interleaved so it gets the most turns.
const DRILL_ROTATION = ['CARD', 'NEURO', 'HEMA', 'OBGYN', 'ENDO', 'PED', 'DERM', 'INF', 'GI', 'PULM', 'CARD', 'NEPH', 'HEMA', 'RHEUM', 'ENDO', 'SURG', 'DERM', 'OBGYN', 'NEURO', 'PED'];
const TAPER_SUBJECTS = ['CARD', 'HEMA', 'ENDO', 'DERM'];

// ---------- date helpers (all dates are 'YYYY-MM-DD' strings, no time zones) ----------
export function parse(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
export function fmt(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(d, n) { const t = parse(d); t.setUTCDate(t.getUTCDate() + n); return fmt(t); }
export function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
export function dow(d) { return parse(d).getUTCDay(); } // 0 Sun … 6 Sat
export function weekStart(d) { const w = dow(d); return addDays(d, w === 0 ? -6 : 1 - w); } // Monday
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function label(d, opts = {}) {
  const t = parse(d);
  const s = `${DOW[t.getUTCDay()]} ${t.getUTCDate()} ${MON[t.getUTCMonth()]}`;
  return opts.year ? `${s} ${t.getUTCFullYear()}` : s;
}
export const inRange = (d, a, b) => d >= a && d <= b;

// ---------- block templates ----------
const B = (time, title, kind = 'study') => ({ time, title, kind });

function blocksFor(type, ctx) {
  const { partTime, ramadan, s1, s2, toMin } = ctx;
  const n1 = s1 ? SUBJECT[s1].name : '';
  const n2 = s2 ? SUBJECT[s2].name : '';
  const toH = Math.max(2, Math.round(toMin / 60));
  if (type === 'focus' && partTime) return [
    B('15:15', 'Timed set · 15–20 Q'),
    B('16:30', 'Review: label wrong, guessed, unsure'),
    B('17:45', 'Medsense: only the gaps from today'),
    B('19:00', 'Second set or closed-book retrieval + Anki'),
    B('20:15', 'Error log, recall summary, set up tomorrow'),
  ];
  if (type === 'focus') return [
    B('06:00', 'Timed set · 40 Q'),
    B('07:15', 'Review: label wrong, guessed, unsure'),
    B('08:30', 'Medsense: only the gaps from today'),
    B('09:45', 'Second timed set · 40 Q'),
    B('11:00', 'Anki: due first, then new'),
    B('13:00', 'Blank-page retrieval / explain cases aloud'),
    B('14:15', 'Mixed or second-bank set'),
    B('15:30', 'Error repair, update log, set up tomorrow'),
  ];
  if (type === 'to') {
    if (partTime) return [
      ...Array.from({ length: toH }, (_, i) => B(['15:00', '16:00', '17:00', '18:00'][i] || '', `TO · part ${i + 1} of ${toH}`, 'to')),
      B('18:30', 'Review misses + guesses'),
      B('19:30', 'Review cont. · pick top 3 repair themes'),
    ];
    if (ramadan) return [
      ...Array.from({ length: toH }, (_, i) => B(['05:00', '06:00', '07:00', '08:00'][i] || '', `TO · part ${i + 1} of ${toH}`, 'to')),
      B('10:00', 'Review misses + guesses'),
      B('11:10', 'Review cont. · log errors'),
      B('13:30', 'Anki due · pick top 3 repair themes'),
    ];
    return [
      ...Array.from({ length: toH }, (_, i) => B(['06:00', '07:00', '08:00', '09:00'][i] || '', `TO · part ${i + 1} of ${toH}`, 'to')),
      B('09:30', 'Review misses + guesses'),
      B('10:45', 'Review cont. · log errors'),
      B('13:00', 'Review cont. · quick Medsense lookups'),
      B('14:15', 'Anki: due reviews'),
      B('15:30', 'Error repair · top 3 repair themes'),
    ].slice(0, 8);
  }
  if (type === 'drill' && ramadan) return [
    B('04:45', `${n1} · timed set`),
    B('06:00', 'Review + quick lookups'),
    B('07:15', `${n2} · timed set`),
    B('10:00', 'Review + quick lookups'),
    B('11:10', 'Anki: due first'),
    B('13:30', 'Error log: retest open items'),
  ];
  if (type === 'drill') return [
    B('06:00', `${n1} · timed set`),
    B('07:15', 'Review + quick lookups'),
    B('08:30', `${n1} · second set`),
    B('09:45', 'Review + quick lookups'),
    B('11:00', 'Anki: due first'),
    B('13:00', `${n2} · timed set`),
    B('14:15', 'Review + quick lookups'),
    B('15:30', 'Error log: retest open items'),
  ];
  if (type === 'light') return [
    B('', 'Anki: due reviews only'),
    B('', 'Error-log retrieval · 20–30 mixed Q'),
    B('', 'Set up next week'),
  ];
  if (type === 'taper') return ramadan ? [
    B('04:45', 'Short timed set'),
    B('06:00', 'Review misses only'),
    B('10:00', 'Retrieval from error log'),
    B('11:10', 'Anki: due only'),
  ] : [
    B('06:00', 'Short timed set'),
    B('07:15', 'Review misses only'),
    B('08:30', 'Retrieval from error log'),
    B('11:00', 'Anki: due only'),
  ];
  if (type === 'eve') return [
    B('', 'Skim error log: top corrections'),
    B('', 'Anki: due only, stop early'),
  ];
  return [];
}

// ---------- main generator ----------
export function buildPlan(settingsIn = {}, overrides = {}) {
  const st = { ...DEFAULT_SETTINGS, ...settingsIn };
  const exam = st.examDate;
  const days = [];
  const taperStart = addDays(exam, -6); // E-6 … E-1
  let p1 = 0, p2 = 0, drill = 0, taperIdx = 0;
  const maintained = new Set(overrides.__maintained || []);
  const drillQueue = DRILL_ROTATION.filter((s) => !maintained.has(s));

  for (let d = st.startDate; d <= exam; d = addDays(d, 1)) {
    const w = dow(d);
    const ramadan = inRange(d, st.ramadanStart, st.ramadanEnd);
    const partTime = d < st.fullTimeStart;
    let day = { date: d, ramadan, partTime };

    if (d === exam) {
      day = { ...day, type: 'exam', phase: 'Exam', title: 'CBT exam day' };
    } else if (d === addDays(exam, -1)) {
      day = { ...day, type: 'eve', phase: 'Taper', title: 'Light review + logistics' };
    } else if (d >= taperStart) {
      const s = taperIdx < 4 ? TAPER_SUBJECTS[taperIdx] : null;
      taperIdx++;
      day = { ...day, type: 'taper', phase: 'Taper', s1: s, title: s ? `Priority repair · ${SUBJECT[s].name}` : 'Mixed retrieval · weak areas' };
    } else if (w === 0) {
      day = { ...day, type: 'light', phase: d <= st.materialEnd ? 'Phase 1' : 'Phase 2', title: 'Light half day' };
    } else if (d <= st.materialEnd) {
      // Phase 1: material + questions. Saturday TO, except the last Saturday before cutoff
      // (that slot becomes a subject day so pass 2 fits; daily TOs start right after).
      const lastSatBeforeCut = addDays(st.materialEnd, -((dow(st.materialEnd) + 1) % 7));
      const isTO = w === 6 && !(d === lastSatBeforeCut && !partTime);
      if (isTO) day = { ...day, type: 'to', phase: 'Phase 1', title: 'Full TO + review' };
      else {
        const list = partTime ? PASS1 : PASS2;
        const s = partTime ? list[p1++ % list.length] : list[p2++ % list.length];
        day = { ...day, type: 'focus', phase: 'Phase 1', s1: s, title: SUBJECT[s].name };
      }
    } else {
      // Phase 2: practice only.
      let isTO;
      if (ramadan) isTO = w === 1 || w === 3 || w === 5;           // Mon, Wed, Fri
      else isTO = w !== 3;                                         // all weekdays + Sat except Wed
      if (isTO) day = { ...day, type: 'to', phase: 'Phase 2', title: 'Full TO + review' };
      else {
        const a = drillQueue[(drill * 2) % drillQueue.length];
        const b = drillQueue[(drill * 2 + 1) % drillQueue.length];
        drill++;
        day = { ...day, type: 'drill', phase: 'Phase 2', s1: a, s2: b, title: `Drill · ${SUBJECT[a].name} + ${SUBJECT[b].name}` };
      }
    }

    // Apply accepted overrides for this date.
    const ov = overrides[d] || {};
    if (ov.type && ov.type !== day.type) {
      day.type = ov.type;
      if (ov.type === 'to') { day.title = 'Full TO + review'; delete day.s1; delete day.s2; }
      if (ov.type === 'light') { day.title = 'Light half day'; delete day.s1; delete day.s2; }
      if (ov.type === 'drill' && !day.s1) {
        day.s1 = drillQueue[(drill * 2) % drillQueue.length];
        day.s2 = drillQueue[(drill * 2 + 1) % drillQueue.length];
        drill++;
        day.title = `Drill · ${SUBJECT[day.s1].name} + ${SUBJECT[day.s2].name}`;
      }
    }
    if (ov.s1) { day.s1 = ov.s1; }
    if (ov.s2) { day.s2 = ov.s2; }
    if (day.type === 'drill' && (ov.s1 || ov.s2)) day.title = `Drill · ${SUBJECT[day.s1].name} + ${SUBJECT[day.s2].name}`;
    if (day.type === 'focus' && ov.s1) day.title = SUBJECT[day.s1].name;
    if (ov.repair) day.repair = ov.repair;

    day.blocks = blocksFor(day.type, { partTime, ramadan, s1: day.s1, s2: day.s2, toMin: st.toMinutes });
    if (day.repair && day.blocks.length >= 6) {
      const r = SUBJECT[day.repair].name;
      const i = day.blocks.length - 3;
      day.blocks = day.blocks.map((b, k) => (k === i ? { ...b, title: `Repair · ${r} timed set` } : k === i + 1 ? { ...b, title: `Repair · ${r} review` } : b));
    }
    day.targets = targetsFor(day, st, ov.qFactor || 1);
    days.push(day);
  }
  return days;
}

function targetsFor(day, st, f) {
  const r = (a, b) => [Math.round(a * f / 5) * 5, Math.round(b * f / 5) * 5];
  let q = [0, 0], anki = st.ankiTarget, ankiNote = 'due first, then new';
  switch (day.type) {
    case 'focus': q = day.partTime ? r(25, 40) : r(80, 100); break;
    case 'drill': q = day.ramadan ? r(75, 90) : r(100, 120); break;
    case 'to': q = [st.toQuestions, st.toQuestions]; ankiNote = 'due reviews, no new'; break;
    case 'light': q = [20, 30]; ankiNote = 'due reviews only'; break;
    case 'taper': q = [40, 60]; ankiNote = 'due reviews only'; break;
    case 'eve': q = [0, 0]; ankiNote = 'due only, stop early'; break;
    case 'exam': q = [0, 0]; anki = 0; ankiNote = ''; break;
  }
  return { q, anki, ankiNote };
}

export const TYPE_LABEL = { focus: 'Material + questions', to: 'TO day', drill: 'Drill day', light: 'Light half day', taper: 'Taper', eve: 'Exam eve', exam: 'Exam' };
