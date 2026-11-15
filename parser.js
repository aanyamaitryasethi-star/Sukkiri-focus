// parser.js: turns a messy brain dump into a list of suggested items.
//
// There's no AI here, just rules. If the app sorts something wrong,
// you can teach it by adding words to the lists below.
//
// The rule we never break: only use what the student actually wrote.
// If a detail (like a deadline) is missing, we leave it empty and
// ask about it on the review page instead of guessing.

// Words that usually start a task ("study for...", "email...").
const ACTION_WORDS = [
  "study", "finish", "start", "email", "text", "call", "write", "read",
  "submit", "return", "buy", "clean", "practice", "review", "do", "make",
  "send", "pay", "book", "print", "pack", "fix", "ask", "work", "prepare",
  "plan", "research", "turn", "sign", "check", "register", "apply", "learn",
  "memorize", "edit", "complete", "go", "get", "pick", "message",
];

// If one of these shows up, the item is probably for school.
const SCHOOL_WORDS = [
  "homework", "math", "bio", "biology", "chem", "chemistry", "physics",
  "history", "english", "essay", "quiz", "test", "exam", "project",
  "assignment", "teacher", "class", "lab", "worksheet", "study", "school",
  "spanish", "french", "geography", "science", "presentation", "ms", "mr",
  "mrs", "algebra", "geometry", "report", "notes", "chapter", "hindi",
  "computer", "cs", "sanskrit", "economics", "sst",
];

// School subjects. "math, chem and bio homework" only gets split into
// separate tasks when every word in the list is one of these.
const SUBJECTS = [
  "math", "maths", "chem", "chemistry", "bio", "biology", "physics",
  "history", "english", "hindi", "spanish", "french", "german", "sanskrit",
  "computer", "cs", "science", "geography", "geo", "economics", "econ",
  "sst", "algebra", "geometry", "calculus", "calc", "stats", "art", "music", "eco", "pe",
];

// Short forms students type, and what they really mean.
const SHORTCUTS = {
  // short forms for school things
  hw: "homework", hmwk: "homework", hwk: "homework", assignmnt: "assignment",
  assmnt: "assignment", proj: "project", pres: "presentation", presentn: "presentation",
  prac: "practice", practise: "practice", rev: "revision", revison: "revision",
  revsion: "revision", sci: "science", comp: "computer", eng: "english",
  geo: "geography", econ: "economics", yt: "youtube", insta: "instagram",
  msg: "message", mins: "minutes", quizz: "quiz", studdy: "study", eco: "economics",
  // day abbreviations (only the unambiguous ones)
  mon: "monday", tue: "tuesday", tues: "tuesday", weds: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", fri: "friday", wed: "wednesday",
  // times and relative dates
  tomo: "tomorrow", tmo: "tomorrow",
  tmr: "tomorrow", tmrw: "tomorrow", tmw: "tomorrow", tmrrw: "tomorrow",
  tdy: "today", tnite: "tonight", tonite: "tonight", nxt: "next",
  wk: "week", wknd: "weekend", eod: "today",
  // tidy-ups and typos
  abt: "about", b4: "before", bc: "because", pls: "please",
  havent: "haven't", dont: "don't", cant: "can't", wont: "won't",
  didnt: "didn't", isnt: "isn't", im: "i'm", ive: "i've",
  frm: "from", fom: "from", frtom: "from", teh: "the", adn: "and",
};

// Words that should always be spelled with certain capital letters.
const PROPER_WORDS = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram",
  google: "Google", english: "English", spanish: "Spanish", french: "French",
  hindi: "Hindi", german: "German", sanskrit: "Sanskrit",
  cs: "CS", pe: "PE", ict: "ICT", sst: "SST",
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const DAY_ABBR = "mon|tues?|weds|thurs?|thur|fri";   // for splitting raw text
const MONTHS_RE = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";

// Words in front of a deadline that we remove along with it
// ("is due friday" -> "friday").
const DUE = "(?:(?:is|are)\\s+)?(?:due\\s+)?(?:by\\s+|on\\s+|before\\s+)?(?:the\\s+)?";

// "thursday morning": the part of the day is dropped along with the day.
const PART_OF_DAY = "(?:\\s+(?:morning|afternoon|evening|night))?";

// Each pattern finds one kind of deadline. The first one that matches wins,
// so the more specific ones come first ("day after tomorrow" before "tomorrow").
const DEADLINE_PATTERNS = [
  new RegExp("\\b" + DUE + "(day after tomorrow)\\b", "i"),
  new RegExp("\\b" + DUE + "(today|tonight|tomorrow|asap)\\b" + PART_OF_DAY, "i"),
  new RegExp("\\b(in\\s+(?:\\d+|an?)\\s+(?:days?|weeks?))\\b", "i"),
  new RegExp("\\b" + DUE + "((?:this|next)\\s+(?:week|weekend|month))\\b", "i"),
  new RegExp("\\b" + DUE + "(end of (?:the\\s+)?(?:week|month))\\b", "i"),
  new RegExp("\\b" + DUE + "((?:" + MONTHS_RE + ")[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?)(?!\\d)", "i"),
  new RegExp("\\b" + DUE + "(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:" + MONTHS_RE + ")[a-z]*)\\b", "i"),
  new RegExp("\\b" + DUE + "(\\d{1,2}(?:st|nd|rd|th))\\b", "i"),
  new RegExp("\\b" + DUE + "((?:this\\s+|next\\s+)?(?:" + DAYS + "))\\b" + PART_OF_DAY, "i"),
  new RegExp("\\b" + DUE + "(\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)(?!\\d)", "i"),
];

// Words that sound like a deadline but don't say when. We never turn
// "soon" into a real date. We ask instead.
const VAGUE_DEADLINE = /\b(?:(?:is|are)\s+)?(?:due\s+)?(soon|sometime|someday|later|eventually|at some point|whenever)\b/i;

// "30 min", "1 hour", "2 hrs"...
const DURATION = /\b(?:for\s+|takes?\s+|about\s+|like\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i;

// Times of day. "from 6-8", "6pm-8pm", "between 4 and 5", "at 5:30".
// We don't read "chapter 5-6" or "pages 10-12" as a time.
const CLOCK = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?";
const NOT_A_TIME = "(?<!\\b(?:chapters?|ch|chp|q|qs|ques|ex|no|nos|sec|slides?|lines?|pages?|pg|pp|units?|lessons?|problems?|questions?|exercises?|grades?|steps?|parts?|sections?)\\.?\\s*)";
const NOT_A_COUNT = "(?!\\s*(?:pages?|problems?|questions?|chapters?|paragraphs?|hours?|hrs?|mins?|minutes?|times?|days?|weeks?|people|sets?)\\b)";
const TIME_RANGE = new RegExp(NOT_A_TIME + "(?:\\b(?:from|between)\\s+)?\\b(" + CLOCK + ")\\s*(?:-|–)\\s*(" + CLOCK + ")(?![\\d/])" + NOT_A_COUNT, "i");
const TIME_RANGE_WORDS = new RegExp("\\b(?:from|between)\\s+(" + CLOCK + ")\\s+(?:to|and|until|till)\\s+(" + CLOCK + ")(?![\\d/])", "i");
// "6 to 7:30", "4 to 5pm": only when it's clearly a time, not "questions 1 to 15".
const TIME_RANGE_TO = new RegExp(NOT_A_TIME + "\\b(" + CLOCK + ")\\s+to\\s+(" + CLOCK + ")(?![\\d/])" + NOT_A_COUNT, "i");
const TIME_AT = new RegExp("\\b(?:at|@)\\s*(" + CLOCK + ")(?![\\d/])|\\b(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\b", "i");

// Little words at the start that aren't part of the task.
const FILLER_START = /^(?:idk|ugh+|uh+|um+|omg|ok(?:ay)?(?:\s+so)?|so|also|and|plus|oh|btw|lol|wait|like|then)\b[\s,!.:-]*/i;

// Filler anywhere in the sentence.
const FILLER_ANYWHERE = /\b(?:ugh+|omg|bruh|ngl|lowkey|highkey|literally|honestly|i think|probably|tho|though|lol|lmao|idk)\b/gi;

// Whole pieces that are feelings, not tasks: "so much to do", "i'm so
// stressed". They get dropped. (Your feelings are valid! They just
// aren't a to-do item.)
const FEELINGS = /^(?:i\s+)?(?:have\s+|got\s+)?(?:(?:so|way too|too|soo+)\s+)?much(?:\s+(?:to do|stuff|work|going on))?$|^(?:i'?m\s+|i am\s+)?(?:so\s+|really\s+)?(?:stressed|tired|overwhelmed|behind|bored|dead|done|confused)(?:\s+out)?$|^(?:help|idk|ok|okay|hmm+|bruh|why|everything)$/i;

const REMINDER_START = /^(?:remember to|remember|don'?t forget to|don'?t forget|remind me to|remind me)\b\s*/i;
const IDEA_START = /^(?:maybe|idea:?|i could|we could|might|it would be cool to)(?=\s|:|$)[\s:]*/i;
const WHAT_IF = /^what if\b/i;
const INTENT_START = /^(?:i\s+)?(?:really\s+|still\s+)?(?:need to|have to|gotta|got to|should|must|want to|wanna|gonna|am going to)\s+/i;
const HAVE_START = /^i\s+(?:have|got|'ve got|also have)\s+(?:a\s+|an\s+)?/i; // "I have math homework" -> "math homework"

// Lists of subjects: "homework in math, chem, bio" or "math and bio homework".
// Each subject becomes its own task.
const LIST_NOUNS = "homework|assignments?|tests?|quiz(?:zes)?|exams?|projects?|worksheets?|essays?|labs?|readings?|notes";
const NOUN_THEN_LIST = new RegExp("^(.*?)\\b(" + LIST_NOUNS + ")\\s+(?:in|for)\\s+(.+)$", "i");
const LIST_THEN_NOUN = new RegExp("^(.*?)\\b((?:[a-z]+\\s*(?:,\\s*and\\s+|,|\\s+and\\s+|&)\\s*)+[a-z]+)\\s+(" + LIST_NOUNS + ")\\b(.*)$", "i");

// Words that tell us something is a big job we'll want to split up later.
const BIG_TASK = /\b(?:huge|big|massive|long|so much|project|essay|presentation|research paper)\b/i;

// Starters that mean "a new item begins here" after "and" / "also".
const STARTERS = ACTION_WORDS.concat([
  "remember", "don't forget", "dont forget", "maybe", "laundry", "dishes", "homework",
  "i need", "i have", "i gotta", "i should", "need to", "have to", "gotta",
]);
const AND_SPLIT = new RegExp(
  "\\s+(?:and also|and then|and|&|also|plus|then)\\s+(?=(?:" + STARTERS.join("|") + ")\\b)",
  "i"
);


// ---------------------------------------------------------------
// The main function: give it the brain dump text, get back items.
// ---------------------------------------------------------------
function parseBrainDump(text) {
  const items = [];
  let carry = "";
  for (const piece of splitIntoPieces(text)) {
    // "tonight at 8 | call dad": a piece that is only a time or a day goes with the next one.
    const whole = carry ? { ...piece, text: carry + " " + piece.text } : piece;
    carry = "";
    const item = makeItem(whole);
    if (item) items.push(item);
    else if (findTime(whole.text).label || findDeadline(expandShortcuts(whole.text)).label) carry = whole.text;
  }
  return items;
}


// Step 1: cut the text into separate pieces.
// Each piece is { text, source, group }:
//   text:   the words for one item
//   source: the sentence it came from (shown as "You wrote: ...")
//   group:  pieces split out of one list share a group, so the review
//           page can ask about all of them with one question
function splitIntoPieces(text) {
  const pieces = [];
  text = text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, " ");

  // New lines, semicolons, bullet dots and the end of a sentence always
  // start a new piece. (But not the dot in "Ms. Lee".)
  const sentences = text
    .split(/\n|;|•/)
    .flatMap(line => line.split(/(?<!\b(?:mr|mrs|ms|dr|st))[.!?]+\s+/i));

  for (const rawSentence of sentences) {
    let sentence = rawSentence;
    // "tomorrow: math quiz, bio hw" -> everything after the colon is for tomorrow.
    let lead = null;
    const leadMatch = sentence.match(new RegExp("^\\s*(?:(?:by|due|before|on)\\s+)?((?:today|tonight|tomorrow|tmrw?|tmr|tmw|2moro|2morrow|tomo|" + DAYS + "|" + DAY_ABBR + ")(?:\\s+(?:morning|afternoon|evening|night))?)\\s*[:\\-]\\s+(.+)$", "i"));
    if (leadMatch) { lead = /^2mo/i.test(leadMatch[1]) ? "tomorrow" : leadMatch[1]; sentence = leadMatch[2]; }
    const firstNew = pieces.length;
    const commaParts = sentence.split(",");
    const lineParts = [];

    for (const part of commaParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // "buy eggs, milk, bread" is ONE task, not three. So a tiny piece
      // that doesn't start with an action word gets glued back on.
      // Same for "math, chem and bio hw": a lone subject before the comma
      // belongs with what comes after it.
      const last = lineParts[lineParts.length - 1];
      const lastIsSubject = last !== undefined && SUBJECTS.includes(last.toLowerCase());
      const startsSubject = SUBJECTS.includes(trimmed.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, ""));
      const continuesNumbers = last !== undefined && /^\d/.test(trimmed) && /(?:\b(?:ch|chapters?|pages?|pg|pp|q|questions?|ex|exercises?)\.?\s*|\d\s*)$/i.test(last);
      const startsThen = /^then\b/i.test(trimmed);
      const startsDuration = last !== undefined && /^(?:about\s+|like\s+)?\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|h)\b/i.test(trimmed);
      // "homework in math, chem, bio": a subject after a "noun in subject" list belongs to it.
      const listGoesOn = last !== undefined && startsSubject && new RegExp("\\b(?:" + LIST_NOUNS + ")\\s+(?:in|for)\\s+[a-z]+(?:\\s*,\\s*[a-z]+)*$", "i").test(expandShortcuts(last));
      if (lineParts.length > 0 && !startsThen && (continuesNumbers || startsDuration || listGoesOn || lastIsSubject || (wordCount(trimmed) <= 2 && !startsWithStarter(trimmed) && !startsSubject))) {
        lineParts[lineParts.length - 1] += ", " + trimmed;
      } else {
        lineParts.push(trimmed);
      }
    }

    // Break run-on lines with no punctuation into separate items:
    // "maths hw bio test thursday text riya" -> three pieces.
    const parts = lineParts
      .flatMap(p => p.split(/\s+(?:then|\+)\s+/i).filter(Boolean)) // "tuition then dinner", "math + bio"
      .flatMap(splitAfterTime)              // "... at 9 <next thing>"
      .flatMap(splitAfterDeadline)          // "... thursday <next thing>"
      .flatMap(splitBeforeSubjectAfterNoun); // "maths hw" | "bio test"
    for (const part of parts) {
      for (const smaller of part.split(AND_SPLIT)) {
        for (const piece of splitOnLongAnd(smaller).flatMap(splitBeforeAction)) {
          const source = piece.trim();
          const expanded = expandList(source);
          const group = expanded.length > 1 ? makeId() : null;
          for (const one of expanded) {
            if (one.trim()) pieces.push({ text: one.trim(), source: source, group: group });
          }
        }
      }
    }
    if (lead) {
      for (const piece of pieces.slice(firstNew)) {
        if (!findDeadline(expandShortcuts(piece.text)).label) piece.text += " " + lead;
      }
    }
  }

  return pieces;
}

// "I have homework in math, chem, bio" -> "I have math homework",
// "I have chem homework", "I have bio homework".
function expandList(text) {
  const clean = expandShortcuts(text).replace(/[.!?]+$/, "");

  let match = clean.match(NOUN_THEN_LIST);
  if (match) {
    const [, before, noun, list] = match;
    const deadline = findDeadline(list); // "...due friday" applies to every subject
    const subjects = splitList(deadline.rest);
    if (subjects.length >= 2 && subjects.every(s => wordCount(s) <= 3)) {
      const after = deadline.matchText ? " " + deadline.matchText : "";
      return subjects.map(subject => before + subject + " " + noun + after);
    }
  }

  match = clean.match(LIST_THEN_NOUN);
  if (match) {
    let [, before, list, noun, after] = match;
    let subjects = splitList(list);
    const beforeWords = before.trim().split(/\s+/).filter(Boolean);
    if (beforeWords.length && beforeWords.every(w => SUBJECTS.includes(w.toLowerCase()))) {
      subjects = beforeWords.concat(subjects);
      before = "";
    }
    if (subjects.length >= 2 && subjects.every(s => SUBJECTS.includes(s.toLowerCase()))) {
      return subjects.map(subject => before + subject + " " + noun + after);
    }
  }

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every(w => SUBJECTS.includes(w.toLowerCase()))) return words; // "math bio chem"
  return [text];
}

function splitList(text) {
  return text
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// Long run-on sentences: "i havent done the bio thing and the essay is
// due soon". If BOTH sides of an "and" are 4+ words, they're probably
// two different thoughts. Short ones like "math and bio" stay together.
function splitOnLongAnd(text) {
  const chunks = text.split(/\s+and\s+/i);
  const result = [chunks[0]];
  for (const chunk of chunks.slice(1)) {
    const last = result[result.length - 1];
    if (wordCount(last) >= 4 && wordCount(chunk) >= 4 && !/^\d/.test(chunk)) {
      result.push(chunk);
    } else {
      result[result.length - 1] = last + " and " + chunk;
    }
  }
  return result;
}

function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

function startsWithStarter(text) {
  const lower = text.toLowerCase();
  return STARTERS.some(word => lower === word || lower.startsWith(word + " "));
}


// Step 2: turn one piece of text into an item.
function makeItem(piece) {
  let text = piece.text;
  if (/[A-Z]/.test(text) && !/[a-z]/.test(text) && wordCount(text) >= 2) text = text.toLowerCase(); // "MATH TEST!!!"
  text = expandShortcuts(text);
  let type = "task";
  let noDeadline = false;
  if (/\bno deadline\b[\s:,-]*/i.test(text)) { noDeadline = true; text = text.replace(/\bno deadline\b[\s:,-]*/i, " "); }

  // Remove list markers like "- ", "* ", "1. ", "2) ".
  text = text.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "");

  text = removeFillerStart(text);
  if (FEELINGS.test(cleanUp(text.replace(FILLER_ANYWHERE, " ")))) return null;

  // Is it a reminder or an idea?
  if (REMINDER_START.test(text)) {
    type = "reminder";
    text = text.replace(REMINDER_START, "");
  } else if (IDEA_START.test(text)) {
    type = "idea";
    text = text.replace(IDEA_START, "");
  } else if (WHAT_IF.test(text)) {
    type = "idea"; // keep the words "what if": they're part of the idea
  }

  text = text.replace(INTENT_START, "");
  text = text.replace(HAVE_START, "");
  text = text.replace(FILLER_ANYWHERE, " ");

  // Find a time of day, a deadline, then a time estimate. Each one gets
  // cut out of the title so "math hw due friday" becomes "Math homework".
  const time = findTime(text);
  text = time.rest;

  const deadline = findDeadline(text);
  text = deadline.rest;

  const duration = findDuration(text);
  text = duration.rest;

  text = cleanUp(text);
  if (text.length < 2) return null; // nothing real left (it was just "ugh")

  const title = prettify(text);
  const lower = title.toLowerCase();

  return {
    id: makeId(),
    type: type,                          // "task", "reminder" or "idea"
    title: title,
    original: piece.source,              // exactly what the student wrote
    group: piece.group,                  // shared by items from one list
    category: SCHOOL_WORDS.some(w => new RegExp("\\b" + w + "\\b").test(lower)) ? "School" : "Personal",
    time: time.label,                    // e.g. "6–8", or null if not given
    deadline: deadline.label,            // e.g. "Friday", or null if not given
    vagueWord: deadline.vagueWord,       // "soon", "sometime"... or null
    noDeadline: noDeadline,              // true if they told us there isn't one
    minutes: duration.minutes ?? time.minutes, // e.g. 30, or null if not given
    isBig: type === "task" && BIG_TASK.test(piece.text),
    status: "pending",                   // "pending", "approved" or "skipped"
    asked: {},                           // which questions we already asked
    askAlone: {},                        // questions to ask this item by itself, not with its group
  };
}


// "from 6-8" -> { label: "6–8", minutes: 120 }
// "at 5pm"   -> { label: "5pm", minutes: null }
function findTime(text) {
  let range = text.match(TIME_RANGE) || text.match(TIME_RANGE_WORDS);
  if (!range) {
    const to = text.match(TIME_RANGE_TO);
    const a = to && clockToHours(to[1]), z = to && clockToHours(to[2]);
    const clear = to && (/[:apm]/i.test(to[1] + to[2]) || (a <= 12 && z <= 12 && z > a && a >= 1));
    if (clear) range = to;
  }
  if (range) {
    const start = clockToHours(range[1]);
    let end = clockToHours(range[2]);
    if (start !== null && end !== null) {
      if (end <= start) end += 12; // "11-1" means 11 to 1, not backwards
      return {
        label: range[1].replace(/\s+/g, "") + "–" + range[2].replace(/\s+/g, ""),
        minutes: Math.round((end - start) * 60),
        rest: text.replace(range[0], " "),
      };
    }
  }

  const at = text.match(TIME_AT);
  if (at && clockToHours(at[1] || at[2]) !== null) {
    return { label: "at " + (at[1] || at[2]).replace(/\s+/g, ""), minutes: null, rest: text.replace(at[0], " ") };
  }

  return { label: null, minutes: null, rest: text };
}

// "6" -> 6, "5:30" -> 5.5, "7pm" -> 19. Returns null if it isn't a real time.
function clockToHours(clock) {
  const match = clock.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours > 24 || minutes > 59) return null;
  if (match[3] === "pm" && hours < 12) hours += 12;
  if (match[3] === "am" && hours === 12) hours = 0;
  return hours + minutes / 60;
}


function findDeadline(text) {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // "next tuesday" -> "Next Tuesday"
      const label = capitalize(match[1].toLowerCase().replace(/[a-z]+/g, word => PROPER_WORDS[word] || word));
      return { label: label, vagueWord: null, matchText: match[0].trim(), rest: text.replace(match[0], " ") };
    }
  }

  const vague = text.match(VAGUE_DEADLINE);
  if (vague) {
    return { label: null, vagueWord: vague[1].toLowerCase(), rest: text.replace(vague[0], " ") };
  }

  return { label: null, vagueWord: null, rest: text };
}


const WORD_DURATION = [
  [/\ban hour and a half\b/i, 90],
  [/\bhalf an? hour\b/i, 30],
  [/\bhalf hour\b/i, 30],
  [/\bquarter (?:of an )?hour\b/i, 15],
  [/\b(?:a )?couple (?:of )?hours\b/i, 120],
  [/\ba few hours\b/i, 180],
  [/\ban hour\b/i, 60],
];

function findDuration(text) {
  for (const [re, mins] of WORD_DURATION) {
    if (re.test(text)) return { minutes: mins, rest: text.replace(re, " ") };
  }
  const match = text.match(DURATION);
  if (!match) return { minutes: null, rest: text };

  const amount = parseFloat(match[1]);
  const isHours = match[2].toLowerCase().startsWith("h");
  return {
    minutes: Math.round(isHours ? amount * 60 : amount),
    rest: text.replace(match[0], " "),
  };
}


// ---------- Small helpers ----------

// Words close to a known subject or school word, for fixing typos like
// "chemestry" or "homwork". Short words are left alone (too risky: "text"
// is one edit from "test"), and only a single-letter slip is accepted.
const CANON_FUZZY = ["biology", "chemistry", "physics", "geography", "economics",
  "geometry", "algebra", "calculus", "sanskrit", "spanish", "english", "science",
  "history", "homework", "assignment", "worksheet", "presentation", "tomorrow",
  "grammar", "commerce", "accounts", "revision", "project", "practical"];

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) { // two neighbouring letters swapped: "pyhsics"
    for (let k = 0; k < a.length - 1; k++) {
      if (a[k] !== b[k]) return a[k] === b[k + 1] && a[k + 1] === b[k] && a.slice(k + 2) === b.slice(k + 2);
    }
  }
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function fuzzyFix(word) {
  if (word.length < 6) return null;
  for (const canon of CANON_FUZZY) {
    if (canon === word) return null;
    if (Math.abs(canon.length - word.length) <= 1 && withinOneEdit(word, canon)) return canon;
  }
  return null;
}

function expandShortcuts(text) {
  text = text.replace(/\b2mo?rr?o?w?\b/gi, "tomorrow");
  // "sat" and "sun" are only days when the sentence makes it clear.
  text = text.replace(/\b(?:(on|by|before|due|this|next|until|till)\s+)?(sat|sun)\b(?=(?:\s*(?:\d|$|morning|afternoon|evening|night|,|;)))/gi,
    (match, lead, abbr, offset) => {
      if (!lead) { // bare "sat": only lowercase, and not "the sat" / "take sat" (the exam) / "the sun"
        const before = text.slice(0, offset).trim().split(/\s+/).pop().toLowerCase();
        if (abbr !== abbr.toLowerCase() || ["the", "for", "my", "a", "take", "taking", "do", "did", "i", "we", "they", "he", "she", "you", "in", "under"].includes(before)) return match;
      }
      return (lead ? lead + " " : "") + (abbr.toLowerCase() === "sat" ? "saturday" : "sunday");
    });
  return text.replace(/[a-z']+/gi, word => {
    const lower = word.toLowerCase();
    if (SHORTCUTS[lower]) return SHORTCUTS[lower];
    return fuzzyFix(lower) || word;
  });
}

function removeFillerStart(text) {
  let before;
  do {
    before = text;
    text = text.replace(FILLER_START, "");
  } while (text !== before);
  return text;
}

function cleanUp(text) {
  return text
    .replace(/\(\s*\)/g, " ")                                 // "( )" left after removing "(2 hrs)"
    .replace(/\s+/g, " ")
    .replace(/^(?:the|a|an)\s+/i, "")                         // "the history project" -> "history project"
    .replace(/\s+:/g, ":")                                     // "test : physics" -> "test: physics"
    .replace(/\s+(?:and|then|also|plus)\s*$/i, "")                // "football practice and" -> "football practice"
    .replace(/\s+(?:is|are|due|by|on|before|from|at|between|for)(?:\s+(?:due|by|on|the))*\s*$/i, "") // leftover "is due" / "for"
    .replace(/^[\s,.!?:;-]+|[\s,!?:;-]+$/g, "")               // stray punctuation at the ends
    .replace(/\.+$/, "")
    .trim();
}

function prettify(text) {
  let out = text.replace(/[a-z]+/gi, word => PROPER_WORDS[word.toLowerCase()] || word);
  out = out.replace(/\bi\b/g, "I").replace(/\bi'(m|ve|ll|d)\b/g, "I'$1");
  // Names after Ms., Mr., Mrs. and Dr. get a capital letter.
  out = out.replace(/\b(ms|mr|mrs|dr)\.?\s+([a-z])/gi,
    (match, title, letter) => capitalize(title.toLowerCase()) + ". " + letter.toUpperCase());
  return capitalize(out);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}


// A set time usually ends a thought: "class at 9 imo practice" is class at 9,
// then IMO practice. We only split when what follows looks like a new thing,
// not more about the same one ("meet at 6 in the library" stays together).
const AFTER_TIME = /^(.*?\b(?:at|@)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|o'?clock)?)\s+(?!(?:in|at|on|with|for|near|by|to|from|before|after|till|until|tomorrow|today|tonight|tmrw|tmr|morning|evening|night|sharp|and|or|pm|am|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b)([a-z][a-z'].{2,})$/i;

function splitAfterTime(text) {
  const match = text.match(AFTER_TIME);
  if (!match) return [text];
  return [match[1].trim()].concat(splitAfterTime(match[2].trim()));
}

// Task-ish nouns that often END one item, so the next word starts a new one.
const TASK_NOUNS = ["hw", "hmwk", "hwk", "homework", "assignment", "assignments",
  "test", "tests", "quiz", "quizzes", "quizz", "essay", "essays", "project",
  "projects", "proj", "worksheet", "worksheets", "lab", "labs", "reading",
  "readings", "notes", "revision", "practice", "practise", "presentation",
  "pres", "exam", "exams", "report", "reports"];

// After a deadline word, a new task often follows:
// "bio test thursday text riya" -> "bio test thursday" + "text riya".
const DEADLINE_SPLIT = new RegExp("^(.*?\\b(?:today|tonight|tomorrow|tmrw?|tmw|2mrw|next week|this week|weekend|" +
  DAYS + "|" + DAY_ABBR + "))\\s+(?!(?:and|or|then|at|in|on|by|before|after|night|morning|evening|afternoon|sharp|&)\\b)(.{3,})$", "i");

function splitAfterDeadline(text) {
  const match = text.match(DEADLINE_SPLIT);
  if (!match) return [text];
  const rest = match[2].trim();
  if (!startsNewItem(rest)) return [text];
  return [match[1].trim()].concat(splitAfterDeadline(rest));
}

// Does this text begin with something that looks like a fresh item?
function startsNewItem(text) {
  const first = text.toLowerCase().replace(/^[^a-z]+/, "").split(/\s+/)[0] || "";
  const base = first.replace(/[^a-z']/g, "");
  return ACTION_WORDS.includes(base) || SUBJECTS.includes(base) ||
    ["remember", "remind", "dont", "don't", "maybe", "need", "have", "gotta",
     "should", "ms", "mr", "mrs"].includes(base);
}

// Verbs that clearly start a new task mid-line (no "and" needed):
// "finish essay email teacher" -> "finish essay" + "email teacher".
const STRONG_ACTIONS = ["email", "text", "call", "message", "buy", "finish",
  "submit", "clean", "pack", "practice", "practise", "review", "read", "write",
  "study", "remember", "print", "return", "pay", "book", "revise", "watch", "start",
  "summarise", "summarize", "solve"];
const SPLIT_BLOCKERS = new Set(["to", "and", "or", "then", "&", "please", "also", "plus",
  "maybe", "idk", "just", "really", "first", "now", "should", "must", "wanna", "gotta", "need",
  "the", "a", "an", "my", "your", "his", "her", "their", "our", "this", "that", "of", "for",
  "about", "with", "in", "at", "on", "library", "case", "english", "text"]);
// "write up" is a noun here ("chem practical write up"), "book report" too.
const NOT_ACTION_AFTER = { write: ["up"], book: ["report", "review"] };

function splitBeforeAction(text) {
  const words = text.split(/\s+/);
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const base = words[i].toLowerCase().replace(/[^a-z']/g, "");
    const prev = i > 0 ? words[i - 1].toLowerCase().replace(/[^a-z']/g, "") : "";
    const next = i + 1 < words.length ? words[i + 1].toLowerCase().replace(/[^a-z']/g, "") : "";
    const noun = (NOT_ACTION_AFTER[base] || []).includes(next);
    if (i > 0 && cur.length >= 2 && STRONG_ACTIONS.includes(base) && !noun &&
        !SPLIT_BLOCKERS.has(prev) && !ACTION_WORDS.includes(prev)) {
      out.push(cur.join(" "));
      cur = [];
    }
    cur.push(words[i]);
  }
  out.push(cur.join(" "));
  return out.filter(piece => piece.trim());
}

// A subject right after a task noun starts a new item:
// "maths hw bio test" -> "maths hw" + "bio test".
function splitBeforeSubjectAfterNoun(text) {
  const words = text.split(/\s+/);
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const norm = w => expandShortcuts(w.toLowerCase().replace(/[^a-z']/g, ""));
    const base = norm(words[i]);
    const prev = i > 0 ? norm(words[i - 1]) : "";
    if (i > 0 && cur.length >= 2 && SUBJECTS.includes(base) && TASK_NOUNS.includes(prev)) {
      out.push(cur.join(" "));
      cur = [];
    } else if (i > 1 && base === "and" && cur.length >= 2 && TASK_NOUNS.includes(prev) &&
               i + 2 < words.length && SUBJECTS.includes(norm(words[i + 1])) && TASK_NOUNS.includes(norm(words[i + 2]))) {
      out.push(cur.join(" ")); // "physics hw and chemistry notes": two tasks
      cur = [];
      continue;
    }
    cur.push(words[i]);
  }
  out.push(cur.join(" "));
  return out.filter(piece => piece.trim());
}
