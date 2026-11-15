// data.js: everything Sukkiri remembers, plus helpers for dates and times.
//
// Your tasks are saved in this browser (localStorage). They stay when you
// close the tab, but they don't travel to your other devices yet.

const KEYS = {
  draft: "unscatter.draft",            // the unfinished brain dump
  tasks: "unscatter.items",            // every task you approved
  schedule: "unscatter.schedule",      // your fixed schedule (school, practice...)
  plan: "unscatter.plan",              // the plan you said yes to today
  stats: "unscatter.stats",            // focus minutes per day
  focus: "unscatter.focusSettings",    // your Pomodoro settings
  day: "unscatter.day",                // when your day starts and ends
  streak: "unscatter.streak",          // your streak and rest days
  timer: "unscatter.timer",            // the focus timer, so a reload doesn't reset it
  yarn: "unscatter.yarn",              // string colours and sweaters (old, moved into the sky)
  sky: "unscatter.sky",                // your stars and constellations
  setup: "unscatter.setup",            // true once "When are you busy?" is answered
  subjects: "unscatter.subjects",      // your subjects and their colours
  reminders: "unscatter.reminders",    // nudges and the daily check-in time
  intro: "unscatter.intro",            // true once the sky intro has been seen
  estSkip: "unscatter.estSkip",       // tasks whose "how long?" card you closed
  backup: "unscatter.lastBackup",      // when you last saved a backup file
  learned: "unscatter.learned",        // subjects you taught it by correcting
};

// Saving in the browser. try/catch because some browsers block it
// (like private windows). The app still works, it just won't remember.
function load(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved);
  } catch (error) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Couldn't save. Nothing else to do.
  }
}

// What the app is showing right now. Each page adds its own fields.
const state = {
  page: "dump",
};

// (The saved tasks, schedule and stats are loaded at the bottom of this
// file, after the date helpers they need.)

function saveTasks() { save(KEYS.tasks, tasks); }
function saveSchedule() { save(KEYS.schedule, schedule); }
function saveStats() { save(KEYS.stats, stats); }
function saveDay() { save(KEYS.day, day); }

function findTask(id) {
  return tasks.find(task => task.id === id);
}

// Turns an approved item from the review page into a saved task.
function makeTask(item) {
  const today = todayISO();
  item = Object.assign({}, item, { when: normalizeWhen(item.when) });
  const dueDate = item.noDeadline ? null : resolveWhen(item.when, today);
  return upgradeTask({
    id: item.id,
    type: item.type,
    title: item.title,
    category: item.category,
    subject: item.subject !== undefined ? item.subject : guessSubject(item.title),
    notes: item.notes || "",
    when: item.when,
    noDeadline: item.noDeadline,
    minutes: item.minutes,
    urgency: item.urgency,
    dueDate: dueDate,
    // No date at all? You dumped it because it's on your mind, so it goes on
    // today's plan. That's only when to work on it. We never invent a due date.
    planDate: !dueDate && !item.when && item.type !== "idea" ? today : null,
    createdAt: today,
  });
}

// Tasks saved by older versions of the app are missing some fields.
function upgradeTask(task) {
  const rawWhen = task.when !== undefined ? task.when : (task.deadline || task.time || null);
  const when = normalizeWhen(rawWhen);
  // A time we couldn't read before ("9") gets its date worked out again.
  if (when !== rawWhen && !task.dueDate) task = Object.assign({}, task, { dueDate: undefined });
  const createdAt = task.createdAt || (task.savedAt ? task.savedAt.slice(0, 10) : todayISO());
  return Object.assign({
    type: "task",
    category: "Personal",
    noDeadline: false,
    minutes: null,
    urgency: null,
    bucket: null,      // set when you move a task to "Someday" by hand
    planDate: null,    // the day you chose to work on it, if you moved it
    sessions: [],      // parts of a big task spread over days: { date, minutes, done }
    spreadDeclined: false, // you said "keep it on one day"
    steps: [],         // small steps, from "Break into steps"
    subject: undefined, // "Maths", "Biology"... guessed from the title if not set
    notes: "",         // page numbers, teacher's instructions, links
    done: false,
    doneAt: null,
  }, task, {
    when: when,
    createdAt: createdAt,
    dueDate: task.dueDate !== undefined ? task.dueDate : (task.noDeadline ? null : resolveWhen(when, createdAt)),
  });
}


// ---------------------------------------------------------------
// Which list a task belongs in: "today", "upcoming", "someday", "done"
// ---------------------------------------------------------------
function bucketOf(task) {
  if (task.done) return "done";
  if (task.bucket) return task.bucket;
  const workDate = workDateOf(task);
  if (workDate) return workDate <= todayISO() ? "today" : "upcoming";
  // Something like "after exams" that isn't a date still counts as upcoming.
  if (task.when && task.type !== "idea") return "upcoming";
  return "someday";
}

// The day you should work on something. Homework due tomorrow has to be
// done today, so for tasks it's the day before the due date. Reminders
// and things with a set time ("go out 6-8") happen on the day itself.
// If you moved a task by hand ("do it tomorrow"), that day wins.
function workDateOf(task) {
  const nextPart = task.sessions.find(part => !part.done);
  if (nextPart) return nextPart.date;
  if (task.planDate) return task.planDate;
  if (!task.dueDate) return null;
  if (task.type === "task" && !hasSetTime(task)) return addDays(task.dueDate, -1);
  return task.dueDate;
}

// A task from an earlier day that's still open. We call these
// "carried over", never "late" or "overdue". No guilt here.
function isCarriedOver(task) {
  if (task.done || task.bucket) return false;
  const today = todayISO();
  if (task.planDate && task.sessions.length === 0) return task.planDate < today;
  return task.dueDate !== null && task.dueDate < today;
}

// The day a carried-over task was meant for.
function carriedFrom(task) {
  return task.planDate || task.dueDate;
}

// Moving a task changes the day you'll work on it, never its due date.
function moveTask(task, where) {
  const today = todayISO();
  task.bucket = null;
  task.sessions = []; // moving it by hand replaces any spread-out plan
  if (where === "today") task.planDate = today;
  else if (where === "tomorrow") task.planDate = addDays(today, 1);
  else if (where === "upcoming") { if (!workDateOf(task) || workDateOf(task) <= today) task.planDate = addDays(today, 1); }
  else if (where === "someday") { task.bucket = "someday"; task.planDate = null; }
  saveTasks();
}

// Minutes a task still needs: unfinished steps if it has them.
function minutesLeft(task) {
  if (task.sessions.length > 0) return partsDueNow(task).reduce((sum, part) => sum + part.minutes, 0);
  const openSteps = task.steps.filter(step => !step.done && step.minutes);
  if (openSteps.length > 0) return openSteps.reduce((sum, step) => sum + step.minutes, 0);
  return task.minutes;
}

// The parts of a spread-out task for today, plus any from earlier days
// that didn't happen. They just roll forward. No guilt.
function partsDueNow(task) {
  return task.sessions.filter(part => !part.done && part.date <= todayISO());
}

function nextStepOf(task) {
  return task.steps.find(step => !step.done) || null;
}

// How important a task is right now: urgency plus how soon it's due.
// Higher score = do it sooner.
const URGENCY_POINTS = { high: 3, medium: 2, low: 0 };
function priorityScore(task) {
  const today = todayISO();
  let score = task.urgency ? URGENCY_POINTS[task.urgency] : 1; // not set = between medium and low
  if (task.dueDate && task.dueDate <= today) score += 3;             // due today (or carried over)
  else if (task.dueDate === addDays(today, 1)) score += 2;           // due tomorrow
  else if (task.dueDate && task.dueDate <= addDays(today, 3)) score += 1; // due in a few days
  return score;
}

// Most important first, then the earliest due date, then the quickest.
function byPriority(a, b) {
  return priorityScore(b) - priorityScore(a)
    || (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
    || (a.minutes || 30) - (b.minutes || 30);
}


// ---------------------------------------------------------------
// Focus stats: minutes and rounds per day
// ---------------------------------------------------------------
function statsFor(date) {
  return stats[date] || { minutes: 0, rounds: 0 };
}

function addFocusTime(minutes, rounds) {
  const today = todayISO();
  const now = statsFor(today);
  // Focus time also counts toward the subject you were working on.
  const bySubject = Object.assign({}, now.subjects);
  const task = typeof timer !== "undefined" && timer.taskId ? findTask(timer.taskId) : null;
  if (task && task.subject && minutes > 0) bySubject[task.subject] = (bySubject[task.subject] || 0) + minutes;
  stats[today] = { minutes: now.minutes + minutes, rounds: now.rounds + rounds, subjects: bySubject };
  saveStats();
}


// ---------------------------------------------------------------
// The streak. The gentle rules:
// - Finish everything planned for today and you earn a day.
// - Moving a task to tomorrow on purpose doesn't hurt anything.
// - You get 2 free rest days in any 7, so a busy or sick day is fine.
// - If it does end, your best streak stays forever.
// ---------------------------------------------------------------
const REST_DAYS_ALLOWED = 2;

function saveStreak() { save(KEYS.streak, streak); }

function restDaysLeft() {
  const weekAgo = addDays(todayISO(), -6);
  return Math.max(0, REST_DAYS_ALLOWED - streak.restDays.filter(date => date >= weekAgo).length);
}

// Looks at the days since your last streak day and uses rest days for them.
function settleStreak() {
  if (!streak.lastDate || streak.current === 0) return;
  const today = todayISO();
  const missed = [];
  for (let date = addDays(streak.lastDate, 1); date < today; date = addDays(date, 1)) {
    if (!streak.restDays.includes(date)) missed.push(date);
  }
  if (missed.length === 0) return;
  if (missed.length > restDaysLeft()) {
    streak.current = 0;
    streak.restDays = [];
  } else {
    streak.restDays.push(...missed);
  }
  saveStreak();
}

function earnStreakDay() {
  settleStreak();
  const today = todayISO();
  if (streak.lastDate === today) return;
  streak.before = { current: streak.current, lastDate: streak.lastDate, best: streak.best };
  streak.current += 1;
  streak.best = Math.max(streak.best, streak.current);
  streak.lastDate = today;
  saveStreak();
  earnStar();
}

// Pressed Undo on the task that earned today's day? Mistakes are fine:
// it goes back, and finishing again earns it again.
function undoStreakDayIfNeeded() {
  if (streak.lastDate !== todayISO() || !streak.before || allTodayDone()) return;
  Object.assign(streak, streak.before);
  streak.before = null;
  saveStreak();
  undoStar();
}


// ---------------------------------------------------------------
// Dates. We store days as "2026-10-31" because those sort correctly.
// ---------------------------------------------------------------
function isoDate(date) {
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function todayISO() {
  return isoDate(new Date());
}

function fromISO(iso) {
  const [year, month, dayOfMonth] = iso.split("-").map(Number);
  return new Date(year, month - 1, dayOfMonth);
}

// The next time a given day-of-month comes around: this month if it hasn't
// passed, otherwise next month. "the 24th" at mid-month stays this month.
function nextDayOfMonth(fromIso, dom) {
  const from = fromISO(fromIso);
  let month = from.getMonth();
  if (dom < from.getDate()) month += 1;
  let iso = isoDate(new Date(from.getFullYear(), month, dom));
  if (fromISO(iso).getDate() !== dom) iso = isoDate(new Date(from.getFullYear(), month + 1, dom));
  return iso;
}

function addDays(iso, n) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + n);
  return isoDate(date);
}

// "2026-10-31" -> "Today", "Tomorrow", "Fri", or "Fri, Oct 31"
function friendlyDate(iso) {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  const date = fromISO(iso);
  if (iso > today && iso <= addDays(today, 6)) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Turns words like "Friday" or "next week" into a real date, counting
// from `fromIso` (the day the task was saved). Returns null when the
// words don't name a day, like "after exams". We never guess.
function resolveWhen(when, fromIso) {
  if (!when) return null;
  const words = when.toLowerCase().trim();
  const weekday = fromISO(fromIso).getDay();
  let match;

  if (/^(today|tonight|asap|now)\b/.test(words)) return fromIso;
  if (/^day after tomorrow\b/.test(words)) return addDays(fromIso, 2);
  if (/^tomorrow\b/.test(words)) return addDays(fromIso, 1);
  if (/next weekend/.test(words)) return addDays(fromIso, ((6 - weekday + 7) % 7) + 7);
  if (/weekend/.test(words)) return weekday === 0 ? fromIso : addDays(fromIso, (6 - weekday + 7) % 7);
  if (/next week/.test(words)) return addDays(fromIso, ((7 - weekday) % 7) + 7);
  if (/this week|end of (the )?week/.test(words)) return addDays(fromIso, (7 - weekday) % 7);
  if ((match = words.match(/^in\s+(\d+|an?)\s+days?\b/))) return addDays(fromIso, /^\d/.test(match[1]) ? Number(match[1]) : 1);
  if ((match = words.match(/^in\s+(\d+|an?)\s+weeks?\b/))) return addDays(fromIso, (/^\d/.test(match[1]) ? Number(match[1]) : 1) * 7);
  if ((match = words.match(/^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const dom = Number(match[1]);
    if (dom >= 1 && dom <= 31) return nextDayOfMonth(fromIso, dom);
  }

  if ((match = words.match(/\b(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/))) {
    const target = WEEKDAYS.indexOf(match[2]);
    let diff = (target - weekday + 7) % 7;
    if (match[1] && diff === 0) diff = 7;
    return addDays(fromIso, diff);
  }

  // "10/31" or "10/31/26"
  if ((match = words.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    return dateFromParts(fromIso, Number(match[1]), Number(match[2]), match[3]);
  }

  // "Oct 31" or "31 Oct"
  if ((match = words.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})\b/)) && MONTHS.includes(match[1])) {
    return dateFromParts(fromIso, MONTHS.indexOf(match[1]) + 1, Number(match[2]));
  }
  if ((match = words.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\b/)) && MONTHS.includes(match[2])) {
    return dateFromParts(fromIso, MONTHS.indexOf(match[2]) + 1, Number(match[1]));
  }

  // Only a time, like "6–8 pm" or "at 5": that means the same day.
  if (timeRangeOf(when) || singleTimeOf(when)) return fromIso;

  return null;
}

function dateFromParts(fromIso, month, dayOfMonth, yearText) {
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
  const from = fromISO(fromIso);
  let year = yearText ? Number(yearText.length === 2 ? "20" + yearText : yearText) : from.getFullYear();
  let iso = isoDate(new Date(year, month - 1, dayOfMonth));
  // "1/5" written in December means next January.
  if (!yearText && iso < addDays(fromIso, -60)) iso = isoDate(new Date(year + 1, month - 1, dayOfMonth));
  return iso;
}


// ---------------------------------------------------------------
// Times of day, as minutes after midnight: 18:30 -> 1110
// ---------------------------------------------------------------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const pad = n => String(n).padStart(2, "0");
  return pad(Math.floor(minutes / 60) % 24) + ":" + pad(minutes % 60);
}

// 1110 -> "6:30 pm"
function clockLabel(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (m ? ":" + String(m).padStart(2, "0") : "") + " " + suffix;
}

// How long a break should be at a given time. More of the day left means
// a longer break: 30 min with 11 hours left, 5 min at the end of your day.
function breakLengthAt(minutes) {
  const hoursLeft = Math.max(0, toMinutes(day.end) - minutes) / 60;
  const length = Math.round((5 + hoursLeft * 25 / 11) / 5) * 5; // to the nearest 5
  return Math.max(5, Math.min(30, length));
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// "6–8" -> { start: 1080, end: 1200 }. A range with no am/pm that starts
// before 8 is read as afternoon/evening (students mean 6 pm, not 6 am).
function timeRangeOf(text) {
  if (!text) return null;
  const match = text.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:–|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let start = Number(match[1]) % 12 * 60 + Number(match[2] || 0);
  let end = Number(match[4]) % 12 * 60 + Number(match[5] || 0);
  const startPm = match[3] ? match[3] === "pm" : match[6] ? match[6] === "pm" && start <= end : Number(match[1]) < 8;
  const endPm = match[6] ? match[6] === "pm" : startPm;
  if (startPm) start += 12 * 60;
  if (endPm) end += 12 * 60;
  if (end <= start) end += 12 * 60;
  if (end > 24 * 60) return null;
  return { start: start, end: end };
}

// One set time: "at 9", "5:30", "9pm", "@ 7". Returns { hour, minute, suffix }
// or null. A plain number like "chapter 9" doesn't count: it needs "at",
// a colon, or am/pm.
function singleTimeOf(text) {
  if (!text || timeRangeOf(text)) return null;
  for (const m of text.toLowerCase().matchAll(/(\bat\s+|@\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g)) {
    if (!m[1] && !m[3] && !m[4]) continue;
    const hour = Number(m[2]);
    const minute = Number(m[3] || 0);
    if (hour > 23 || minute > 59) continue;
    return { hour: hour, minute: minute, suffix: m[4] || null };
  }
  return null;
}

// When something with a set time happens: { start, end } in minutes after
// midnight, or null for normal tasks you can do any time.
// "At 9" with no am/pm means the next 9 o'clock that's coming up: at
// 5:20 pm, "5:30" is 5:30 pm and "at 9" is 9 pm.
function eventTimeOf(task) {
  const range = timeRangeOf(task.when);
  if (range) return range;
  const time = singleTimeOf(task.when);
  if (!time) return null;

  let start;
  if (time.suffix) {
    start = (time.hour % 12 + (time.suffix === "pm" ? 12 : 0)) * 60 + time.minute;
  } else if (time.hour > 12) {
    start = time.hour * 60 + time.minute; // 24-hour time like "17:30"
  } else {
    const morning = (time.hour % 12) * 60 + time.minute;
    const evening = morning + 12 * 60;
    if (task.dueDate && task.dueDate !== todayISO()) start = time.hour < 8 ? evening : morning;
    else start = morning >= nowMinutes() - 60 ? morning : evening;
  }
  return { start: start, end: Math.min(start + (task.minutes || 60), 24 * 60) };
}

// The "when" field is about dates and times, so a bare number there is a
// time: "9" means 9 o'clock and "9.30" means 9:30. Without this, "class at 9"
// written as just "9" lost its time and other tasks got planned on top of it.
function normalizeWhen(when) {
  if (typeof when !== "string") return when;
  let text = when.trim().replace(/\b(\d{1,2})\.(\d{2})\b/g, "$1:$2");
  if (/^\d{1,2}(?::\d{2})?$/.test(text)) {
    const hour = Number(text.split(":")[0]);
    if (hour >= 0 && hour <= 23) text = "at " + text;
  }
  return text;
}

function hasSetTime(task) {
  return eventTimeOf(task) !== null;
}


// ---------------------------------------------------------------
// Subjects. Each has a colour that shows on Today, the timeline and stats.
// `words` are how we guess a subject from a title ("bio quiz" -> Biology).
// Specific words win over general ones, so "History essay" is History.
// ---------------------------------------------------------------
const DEFAULT_SUBJECTS = [
  { name: "Maths", colour: "#7AA2FF", words: ["math", "maths", "mathematics", "algebra", "geometry", "calculus", "trig", "trigonometry", "statistics"] },
  { name: "Physics", colour: "#B48CFF", words: ["physics", "phys", "phy"] },
  { name: "Chemistry", colour: "#FFB067", words: ["chem", "chemistry"] },
  { name: "Biology", colour: "#4FD1C5", words: ["bio", "biology"] },
  { name: "English", colour: "#FF8AB3", words: ["english", "eng", "literature", "grammar"], loose: ["essay", "poem", "novel", "book report"] },
  { name: "History", colour: "#E9C46A", words: ["history", "hist"] },
  { name: "Geography", colour: "#F28F6B", words: ["geography", "geo"] },
  { name: "Computer", colour: "#8FC8E8", words: ["computer", "coding", "programming", "python", "cs"] },
];
// Subjects it can add for you the first time you mention them.
const EXTRA_SUBJECTS = [
  { name: "Hindi", words: ["hindi"] },
  { name: "French", words: ["french"] },
  { name: "Spanish", words: ["spanish"] },
  { name: "German", words: ["german"] },
  { name: "Sanskrit", words: ["sanskrit"] },
  { name: "Economics", words: ["economics", "econ", "eco"] },
  { name: "Commerce", words: ["commerce", "accounts", "accountancy", "business studies"] },
  { name: "Science", words: ["science", "sci"] },
  { name: "Social studies", words: ["sst", "social studies", "social science", "civics"] },
];
const EXTRA_COLOURS = ["#C9A0DC", "#F4A6A6", "#9FD8FF", "#D8C27A", "#A6B5FF", "#F7B2D9"];

function saveSubjects() { save(KEYS.subjects, subjects); }

function subjectNamed(name) {
  return name ? subjects.find(s => s.name === name) || null : null;
}

function guessSubject(title) {
  const lower = " " + String(title || "").toLowerCase() + " ";
  const has = word => new RegExp("[^a-z]" + word.replace(/\s+/g, "\\s+") + "[^a-z]").test(lower);
  // What you've taught it wins over the built-in guesses.
  for (const word of String(title || "").toLowerCase().split(/[^a-z]+/)) {
    if (learnedSubjects[word] && subjectNamed(learnedSubjects[word])) return learnedSubjects[word];
  }
  for (const s of subjects) {
    const preset = DEFAULT_SUBJECTS.find(d => d.name === s.name) || EXTRA_SUBJECTS.find(d => d.name === s.name);
    const words = preset ? preset.words : [s.name.toLowerCase()];
    if (words.some(has)) return s.name;
  }
  for (const s of DEFAULT_SUBJECTS) {
    if (s.loose && s.loose.some(has) && subjectNamed(s.name)) return s.name;
  }
  // First time you mention French, Hindi, Economics...: add it to your subjects.
  for (const s of EXTRA_SUBJECTS) {
    if (s.words.some(has)) return addSubject(s.name);
  }
  return null;
}

function addSubject(name) {
  const clean = String(name).trim().replace(/\s+/g, " ").slice(0, 20);
  if (!clean) return null;
  const existing = subjects.find(s => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.name;
  const pretty = clean[0].toUpperCase() + clean.slice(1);
  const colour = EXTRA_COLOURS[(subjects.length - DEFAULT_SUBJECTS.length + EXTRA_COLOURS.length * 4) % EXTRA_COLOURS.length];
  subjects.push({ name: pretty, colour: colour });
  saveSubjects();
  return pretty;
}

// ---------------------------------------------------------------
// Load everything saved last time.
// ---------------------------------------------------------------
let subjects = load(KEYS.subjects, null) || DEFAULT_SUBJECTS.map(s => ({ name: s.name, colour: s.colour }));

// What the app has learned from your corrections: a word -> the subject you
// put it in. So once you fix "lit" to English, it remembers next time.
let learnedSubjects = load(KEYS.learned, {});
function saveLearned() { save(KEYS.learned, learnedSubjects); }

// Generic words that don't tell us a subject, so we never learn from them.
const SUBJECT_STOP = new Set(["homework", "hw", "assignment", "test", "quiz",
  "essay", "project", "worksheet", "lab", "revision", "practice", "notes",
  "reading", "presentation", "exam", "report", "chapter", "the", "and", "due",
  "about", "for", "study", "finish", "read", "write", "revise", "my", "page", "pages"]);

function learnSubject(title, subjectName) {
  if (!subjectName || !subjectNamed(subjectName)) return;
  for (const word of String(title).toLowerCase().split(/[^a-z]+/)) {
    if (word.length >= 3 && !SUBJECT_STOP.has(word)) learnedSubjects[word] = subjectName;
  }
  saveLearned();
}
let tasks = load(KEYS.tasks, []).map(upgradeTask);
// Tasks from before subjects existed get a guess once, then keep it.
tasks.forEach(task => { if (task.subject === undefined) task.subject = guessSubject(task.title); });
let schedule = load(KEYS.schedule, []);
let stats = load(KEYS.stats, {});
let estSkip = load(KEYS.estSkip, []);
function saveEstSkip() { save(KEYS.estSkip, estSkip.slice(-200)); }
let streak = Object.assign({ current: 0, best: 0, lastDate: null, restDays: [], before: null }, load(KEYS.streak, {}));
let day = Object.assign({ start: "07:00", end: "22:00" }, load(KEYS.day, {}));
