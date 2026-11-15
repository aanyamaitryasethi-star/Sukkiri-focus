// review.js: page 1 (brain dump) and page 2 (review and organize).

state.items = [];          // the suggestions from the brain dump
state.editingId = null;    // the item being edited right now, if any
state.justArrived = false; // true right after "Clear my head", so cards slide in
state.questionIndex = 0;   // which task the question panel is asking about
state.customOpen = null;   // "minutes" or "when" while a Custom box is open

// Grab the parts of the page we need to change.
const el = {
  dumpInput: document.getElementById("dump-input"),
  lineCount: document.getElementById("line-count"),
  dumpHint: document.getElementById("dump-hint"),
  sortBtn: document.getElementById("sort-btn"),
  sortNote: document.getElementById("sort-note"),
  sortNoteText: document.getElementById("sort-note-text"),
  sortRetry: document.getElementById("sort-retry"),
  itemList: document.getElementById("item-list"),
  questionPanel: document.getElementById("question-panel"),
  reviewCount: document.getElementById("review-count"),
  reviewBreakdown: document.getElementById("review-breakdown"),
  saveBtn: document.getElementById("save-btn"),
  saveChoice: document.getElementById("save-choice"),
  saveChoiceText: document.getElementById("save-choice-text"),
  backBtn: document.getElementById("back-btn"),
};

const TYPE_NAMES = { task: "Task", reminder: "Reminder", idea: "Idea" };

// The answers for each of the 3 questions.
// Time and deadline also get "Custom…". Urgency is always one of these 3.
const TIME_OPTIONS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];
const DEADLINE_OPTIONS = ["Today", "Tomorrow", "This week", "Next week"];
const URGENCY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];


// ---------------------------------------------------------------
// Sorting the brain dump. Smart sorting uses common sense, so it knows
// "math hw" and "message Ms. Lee" are two different things, and that
// "ugh" isn't a task. Without it, we use the rules in parser.js.
// ---------------------------------------------------------------
function buildPrompt(dump) {
  return `You turn a student's messy "brain dump" into a clean list for a planner app.

Rules:
- Use common sense and read for meaning. Don't rely on punctuation, line breaks or exact wording: students often type one long run-on line with typos.
- Split the text into the separate, real things to do or remember. Different subjects, activities or actions are always separate items: "homework in math, chem and bio" is three items (Math homework, Chem homework, Bio homework), and "finish scince proj piano practise french hw" is three items (Finish science project, Piano practice, French homework).
- Leave out anything that isn't something to do or remember: feelings, complaints and filler like "ugh", "so much to do", "I'm so stressed".
- title: short and clear, like a to-do list (2 to 6 words), starting with a capital letter. Fix obvious typos. Keep names and the student's own names for things.
- type: "task" (something to do), "reminder" (something to remember, like messaging someone or an appointment), or "idea" (a maybe or someday thing).
- category: "School" or "Personal".
- subject: for school work, the subject it belongs to, picked from this list: ${subjects.map(s => s.name).join(", ")}. Use null for personal things or when you can't tell.
- NEVER invent details. Fill these only when the student actually said them, otherwise use null:
  - when: when it is due or happening, in a few words ("Friday", "Tomorrow", "6–8 pm", "Oct 31"). For a time of day, always write it with "at" or am/pm, like "at 9", "at 4:30" or "9 pm", never a bare number.
- Each thing that happens at its own time is its own item: "class at 9 imo practice" is two items, "Class" (when "at 9") and "IMO practice" (when null).
  - minutes: how long it takes, only if they gave a length or a time range ("from 6-8" is 120).
  - urgency: "high", "medium" or "low", only if they said it ("urgent" or "asap" is "high").
- quote: the exact words from the brain dump this item came from.

Reply with only a JSON array, like this:
[{"type":"task","title":"Math homework","category":"School","subject":"Maths","when":null,"minutes":null,"urgency":null,"quote":"homework in math"}]

Brain dump:
"""
${dump}
"""`;
}

// The answer is data from outside our code, so we check every field.
function itemFromClaude(raw) {
  if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return null;
  const minutes = Number(raw.minutes);
  return newItem({
    type: ["task", "reminder", "idea"].includes(raw.type) ? raw.type : "task",
    title: raw.title.trim().slice(0, 120),
    category: raw.category === "School" ? "School" : "Personal",
    subject: subjectNamed(raw.subject) ? raw.subject : guessSubject(raw.title),
    when: typeof raw.when === "string" && raw.when.trim() ? normalizeWhen(raw.when.trim().slice(0, 40)) : null,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
    urgency: ["low", "medium", "high"].includes(raw.urgency) ? raw.urgency : null,
    quote: typeof raw.quote === "string" ? raw.quote.slice(0, 200) : "",
  });
}

// The simple rules from parser.js give a slightly different shape.
function itemFromRules(raw) {
  return newItem({
    type: raw.type,
    title: raw.title,
    category: raw.category,
    subject: guessSubject(raw.title),
    when: raw.deadline || raw.time,
    minutes: raw.minutes,
    urgency: raw.deadline === "Asap" ? "high" : null,
    noDeadline: !!raw.noDeadline,
    quote: raw.original,
  });
}

function newItem(fields) {
  return Object.assign({
    id: makeId(),
    status: "approved",  // saved unless you skip it: "approved" or "skipped"
    noDeadline: false,   // the student said there's no deadline
    whenUnsure: false,   // the student picked "Not sure"
    minutesUnsure: false,
  }, fields);
}

async function sortBrainDump(dump) {
  // The "default" model is a little slower than "quick", but this is the
  // step where good judgment matters most.
  const answer = await askClaudeJSON(buildPrompt(dump), "default");
  const items = Array.isArray(answer) ? answer.map(itemFromClaude).filter(Boolean) : [];
  if (items.length > 0) return { items: items, byClaude: true };
  return { items: parseBrainDump(dump).map(itemFromRules), byClaude: false };
}


// ---------------------------------------------------------------
// Page 1: Brain dump
// ---------------------------------------------------------------
function updateDumpPage() {
  const text = el.dumpInput.value;
  const lines = text.split("\n").filter(line => line.trim() !== "").length;
  el.lineCount.textContent = lines === 1 ? "1 line" : lines + " lines";
  el.sortBtn.disabled = text.trim() === "";
}

async function sortDump() {
  el.dumpHint.hidden = true;
  el.sortBtn.disabled = true;
  el.sortBtn.firstChild.textContent = "Sorting… ";

  const { items, byClaude } = await sortBrainDump(el.dumpInput.value);

  el.sortBtn.firstChild.textContent = "Clear my head ";
  updateDumpPage();

  if (items.length === 0) {
    el.dumpHint.textContent = "Hmm, I couldn't find anything to sort. Try writing down a few things you need to do.";
    el.dumpHint.hidden = false;
    return;
  }

  state.items = items;
  state.editingId = null;
  state.justArrived = true;
  state.questionIndex = 0;
  state.customOpen = null;
  showSortNote(byClaude);
  goTo("review");
}

// If the quick backup sorting was used, a gentle note asks you to check the
// details. Where smart sorting can't run at all, there's nothing to say.
function showSortNote(bySmartSort) {
  const quiet = claudeProblem === "unavailable" || claudeProblem === "not_granted";
  el.sortNote.hidden = bySmartSort || quiet;
  if (el.sortNote.hidden) return;
  el.sortNoteText.textContent = claudeProblem === "rate_limited"
    ? "Sorted the quick way this time. Give everything a quick check."
    : "Sorted the quick way this time, so give the details a quick check.";
  el.sortRetry.hidden = false;
}

el.sortRetry.addEventListener("click", async () => {
  el.sortRetry.disabled = true;
  el.sortRetry.textContent = "Sorting…";
  await sortDump();
  el.sortRetry.disabled = false;
  el.sortRetry.textContent = "Try again";
});

el.dumpInput.addEventListener("input", () => {
  save(KEYS.draft, el.dumpInput.value);
  el.dumpHint.hidden = true;
  updateDumpPage();
});

// Ctrl+Enter (or Cmd+Enter on a Mac) is a shortcut for "Clear my head".
el.dumpInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !el.sortBtn.disabled) {
    sortDump();
  }
});

el.sortBtn.addEventListener("click", sortDump);


// ---------------------------------------------------------------
// Page 2: Review and organize
// ---------------------------------------------------------------

// The items that get questions: everything except ideas and skipped ones.
function questionItems() {
  return state.items.filter(item => item.status !== "skipped" && item.type === "task");
}

// Has the student told us how long / when / how urgent?
function hasMinutes(item) { return item.minutes !== null || item.minutesUnsure; }
function hasWhen(item) { return item.when !== null || item.noDeadline || item.whenUnsure; }
// Only one thing is worth stopping for: a task with no due date. Length and
// urgency get sensible defaults, and you can fix them later if you want.
function needsAnswers(item) {
  return item.type === "task" && (!hasWhen(item) || !hasMinutes(item));
}

// The small grey line under each title.
function describe(item) {
  if (item.type === "idea") return "Saved for later, no pressure";

  const parts = [];
  if (item.when) parts.push(hasSetTime(item) ? item.when : "Due " + item.when);
  else if (item.noDeadline) parts.push("No deadline");
  if (item.minutes) parts.push(formatMinutes(item.minutes));
  return parts.join(" · ");
}

function cardHTML(item, index, activeId) {
  const classes = ["card", "card--" + item.status];
  if (item.id === activeId) classes.push("card--active");

  // The edit form replaces the normal card content.
  if (state.editingId === item.id) {
    const typeOptions = Object.keys(TYPE_NAMES).map(type =>
      `<option value="${type}" ${type === item.type ? "selected" : ""}>${TYPE_NAMES[type]}</option>`
    ).join("");
    return `
      <article class="${classes.join(" ")}" data-id="${item.id}" style="--i: 0">
        <form class="edit-row">
          <input class="input" id="edit-${item.id}" name="title" value="${escapeHTML(item.title)}" aria-label="Item name" required>
          <select class="input" name="type" aria-label="Type">${typeOptions}</select>
          <button class="btn btn--primary btn--small" type="submit">Save</button>
          <button class="btn btn--ghost btn--small" type="button" data-action="cancel-edit">Cancel</button>
          <span class="edit-hint">Two things in one? Put a comma between them to split it.</span>
        </form>
      </article>`;
  }

  const meta = describe(item);
  let metaHTML = meta ? `<span class="card-meta">${escapeHTML(meta)}</span>` : "";
  if (item.type !== "idea" && item.status !== "skipped") {
    metaHTML = (state.subjectFor === item.id
      ? `<div class="card-subject">${subjectPickerHTML(item.subject, 'data-action="subject"', "subj-" + item.id)}</div>`
      : `<button class="card-subject-btn" type="button" data-action="pick-subject">${item.subject && subjectColour(item.subject) ? subjectTagHTML(item.subject) : '<span class="subj subj--none">+ Subject</span>'}</button>`) + metaHTML;
  }
  if (needsAnswers(item) && item.status !== "skipped") {
    // Asked right on the card, one tap each. Only what's missing shows.
    if (!hasWhen(item)) metaHTML += `
      <div class="card-due" role="group" aria-label="When is ${escapeHTML(item.title)} due?">
        <span class="card-due-label">Due?</span>
        ${[["Today", "Today"], ["Tomorrow", "Tomorrow"], ["This week", "This week"], ["none", "No deadline"]]
          .map(([value, label]) => `<button class="choice choice--small" type="button" data-action="due" data-value="${value}">${label}</button>`).join("")}
      </div>`;
    if (!hasMinutes(item)) metaHTML += `
      <div class="card-due" role="group" aria-label="How long will ${escapeHTML(item.title)} take?">
        <span class="card-due-label">How long?</span>
        ${[[15, "15 min"], [30, "30 min"], [60, "1 hr"], [120, "2 hrs"]]
          .map(([value, label]) => `<button class="choice choice--small" type="button" data-action="minutes" data-value="${value}">${label}</button>`).join("")}
        <label class="sr-only" for="mins-${item.id}">Other length in minutes</label>
        <input class="input input--tiny" id="mins-${item.id}" type="number" min="1" max="600" placeholder="min" data-minutes-for="${item.id}">
      </div>`;
  }

  let actions;
  if (item.status === "skipped") {
    actions = `<span class="status status--muted">Skipped</span>
      <button class="btn btn--ghost btn--small btn--quiet" type="button" data-action="undo">Undo</button>`;
  } else {
    actions = `
      <button class="btn btn--ghost btn--small" type="button" data-action="edit">Edit</button>
      <button class="btn btn--ghost btn--small btn--quiet" type="button" data-action="skip">Skip</button>`;
  }

  return `
    <article class="${classes.join(" ")}" data-id="${item.id}" style="--i: ${index}">
      <span class="badge badge--${item.type}">${TYPE_NAMES[item.type]}</span>
      <div class="card-body">
        <span class="card-title">${escapeHTML(item.title)}</span>
        ${metaHTML}
      </div>
      <div class="card-actions">${actions}</div>
    </article>`;
}


// ---------- The question panel: 3 questions for one task ----------
// (choiceHTML and questionBlock are also used by the focus page.)

function choiceHTML(label, selected, attrs) {
  return `<button class="choice${selected ? " choice--on" : ""}" type="button" aria-pressed="${selected}" ${attrs}>${escapeHTML(label)}</button>`;
}

function questionBlock(heading, choices, extra) {
  return `
    <fieldset class="q-block">
      <legend class="q-label">${heading}</legend>
      <div class="choices">${choices}</div>
      ${extra}
    </fieldset>`;
}

function minutesQuestion(item) {
  const isPreset = TIME_OPTIONS.some(o => o.minutes === item.minutes);
  let choices = TIME_OPTIONS.map(o =>
    choiceHTML(o.label, item.minutes === o.minutes, `data-set="minutes" data-value="${o.minutes}"`)).join("");

  // A length that isn't one of the buttons (like "45 min") shows as its own selected button.
  if (item.minutes !== null && !isPreset) {
    choices += choiceHTML(formatMinutes(item.minutes), true, `data-custom="minutes"`);
  }
  choices += choiceHTML("Custom…", state.customOpen === "minutes", `data-custom="minutes"`);
  choices += choiceHTML("Not sure", item.minutesUnsure, `data-set="minutes" data-value="unsure"`);

  const custom = state.customOpen !== "minutes" ? "" : `
    <form class="custom-row" data-form="minutes">
      <label class="sr-only" for="custom-amount">How long</label>
      <input class="input input--narrow" id="custom-amount" name="amount" type="number" min="1" max="999" step="any" placeholder="45" required>
      <label class="sr-only" for="custom-unit">Unit</label>
      <select class="input" id="custom-unit" name="unit">
        <option value="1">min</option>
        <option value="60">hours</option>
      </select>
      <button class="btn btn--primary btn--small" type="submit">Set</button>
    </form>`;

  return questionBlock("How long will it take?", choices, custom);
}

function whenQuestion(item) {
  const isPreset = DEADLINE_OPTIONS.includes(item.when);
  let choices = DEADLINE_OPTIONS.map(label =>
    choiceHTML(label, item.when === label, `data-set="when" data-value="${label}"`)).join("");

  // Something the student wrote, like "Friday" or "6–8 pm", shows as its own selected button.
  if (item.when !== null && !isPreset) {
    choices = choiceHTML(item.when, true, `data-custom="when"`) + choices;
  }
  choices += choiceHTML("No deadline", item.noDeadline, `data-set="when" data-value="none"`);
  choices += choiceHTML("Custom…", state.customOpen === "when", `data-custom="when"`);
  choices += choiceHTML("Not sure", item.whenUnsure, `data-set="when" data-value="unsure"`);

  const custom = state.customOpen !== "when" ? "" : `
    <form class="custom-row" data-form="when">
      <label class="sr-only" for="custom-date">Pick a date</label>
      <input class="input" id="custom-date" name="date" type="date">
      <span class="custom-or">or</span>
      <label class="sr-only" for="custom-text">Type when</label>
      <input class="input" id="custom-text" name="text" type="text" maxlength="40" placeholder="after exams">
      <button class="btn btn--primary btn--small" type="submit">Set</button>
    </form>`;

  const heading = item.type === "reminder" ? "When?" : "When is it due?";
  return questionBlock(heading, choices, custom);
}

function urgencyQuestion(item) {
  const choices = URGENCY_OPTIONS.map(o =>
    choiceHTML(o.label, item.urgency === o.value, `data-set="urgency" data-value="${o.value}"`)).join("");
  return questionBlock("How urgent is it?", choices, "");
}

function questionPanelHTML(list) {
  const item = list[state.questionIndex];
  const total = list.length;
  const segments = list.map((one, i) =>
    `<span class="${!needsAnswers(one) ? "done" : i === state.questionIndex ? "current" : ""}"></span>`).join("");
  const isLast = state.questionIndex === total - 1;

  return `
    <div class="q-top"><span>One quick question</span>${total > 1 ? `<span>${state.questionIndex + 1} of ${total}</span>` : ""}</div>
    <div>
      <h2 class="q-heading">${escapeHTML(item.title)}</h2>
    </div>
    ${whenQuestion(item)}
    ${total > 1 ? `<div class="q-nav">
      <button class="btn btn--ghost btn--small" type="button" data-nav="prev" ${state.questionIndex === 0 ? "disabled" : ""}>Back</button>
      <button class="btn btn--ghost btn--small" type="button" data-nav="next">${isLast ? "Done" : "Skip"}</button>
    </div>` : ""}`;
}

function doneHTML() {
  return `
    <div class="q-done">
      <div class="q-done-icon">${ICONS.check}</div>
      <h2 class="q-heading">All questions done.</h2>
      <span class="q-context">Skip anything you don't want, then save your list.</span>
    </div>`;
}

function renderReview() {
  const list = questionItems();
  state.questionIndex = Math.min(state.questionIndex, list.length);
  const current = list[state.questionIndex];

  el.itemList.innerHTML = state.items
    .map((item, index) => cardHTML(item, index, current ? current.id : null))
    .join("");

  // Cards only slide in the first time, not on every click.
  el.itemList.classList.toggle("is-new", state.justArrived);
  state.justArrived = false;

  // The question panel only slides in when it moves to a new task.
  const panelKey = current ? current.id : "done";
  el.questionPanel.classList.toggle("is-new", el.questionPanel.dataset.key !== panelKey);
  el.questionPanel.dataset.key = panelKey;
  // Start at the first task that still needs a due date; hide the panel when none do.
  if (current && !needsAnswers(current)) {
    const firstOpen = list.findIndex(needsAnswers);
    state.questionIndex = firstOpen === -1 ? list.length : firstOpen;
    return renderReview();
  }
  // Questions live on the cards now, so the side panel stays out of the way.
  el.questionPanel.hidden = true;
  el.questionPanel.innerHTML = "";

  // The bar at the bottom.
  const approved = state.items.filter(item => item.status === "approved").length;
  el.reviewCount.textContent = approved + " of " + state.items.length;
  el.reviewBreakdown.textContent = "will be saved · " + countTypes();
  el.saveBtn.disabled = approved === 0;
  el.saveBtn.textContent = "Plan my day";

  // Put the cursor in the box that just opened.
  const focusMe = el.itemList.querySelector(".edit-row input") || el.questionPanel.querySelector(".custom-row input");
  if (focusMe) focusMe.focus();
}

// "3 tasks, 1 reminder, 1 idea"
function countTypes() {
  const kept = state.items.filter(item => item.status !== "skipped");
  return ["task", "reminder", "idea"]
    .map(type => {
      const n = kept.filter(item => item.type === type).length;
      return n === 0 ? null : plural(n, TYPE_NAMES[type].toLowerCase());
    })
    .filter(Boolean)
    .join(", ");
}

function findItem(id) {
  return state.items.find(item => item.id === id);
}

// One listener for every button on every card ("event delegation").
el.itemList.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = findItem(button.closest(".card").dataset.id);

  switch (button.dataset.action) {
    case "skip": item.status = "skipped"; break;
    case "undo": item.status = "approved"; break;
    case "edit": state.editingId = item.id; break;
    case "cancel-edit": state.editingId = null; break;
    case "due": setAnswer(item, "when", button.dataset.value); break;
    case "pick-subject": state.subjectFor = item.id; break;
    case "subject":
      item.subject = button.dataset.value || null;
      if (item.subject) learnSubject(item.title, item.subject);
      state.subjectFor = null;
      break;
    case "minutes": setAnswer(item, "minutes", button.dataset.value); break;
    case "ask":
      state.questionIndex = questionItems().indexOf(item);
      state.customOpen = null;
      break;
  }
  renderReview();
});

el.itemList.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  const item = findItem(form.closest(".card").dataset.id);
  const newTitle = form.elements.title.value.trim();
  item.type = form.elements.type.value;

  // A comma you just added splits the card into separate items.
  // Commas that were already in the title, like "eggs, milk", stay.
  const commaCount = text => text.split(",").length - 1;
  const parts = newTitle.split(",").map(part => part.trim()).filter(Boolean);
  if (commaCount(newTitle) > commaCount(item.title) && parts.length > 1) {
    item.title = capitalize(parts[0]);
    const extras = parts.slice(1).map(part => newItem({
      type: item.type,
      title: capitalize(part),
      category: item.category,
      subject: guessSubject(part) || item.subject,
      when: item.when,
      minutes: null,
      urgency: item.urgency,
      quote: item.quote,
    }));
    state.items.splice(state.items.indexOf(item) + 1, 0, ...extras);
  } else if (newTitle) {
    item.title = newTitle;
  }
  state.editingId = null;
  renderReview();
});

// Clicking an answer, Custom…, Back or Next in the question panel.
el.questionPanel.addEventListener("click", event => {
  const item = questionItems()[state.questionIndex];
  const button = event.target.closest("[data-set], [data-custom], [data-nav]");
  if (!button) return;

  if (button.dataset.nav) {
    state.questionIndex += button.dataset.nav === "next" ? 1 : -1;
    state.customOpen = null;
  } else if (button.dataset.custom) {
    state.customOpen = state.customOpen === button.dataset.custom ? null : button.dataset.custom;
  } else {
    setAnswer(item, button.dataset.set, button.dataset.value);
    state.customOpen = null;
    nextQuestion();
  }
  renderReview();
});

// The Custom… boxes.
el.questionPanel.addEventListener("submit", event => {
  event.preventDefault();
  const item = questionItems()[state.questionIndex];
  const form = event.target;

  if (form.dataset.form === "minutes") {
    const amount = Number(form.elements.amount.value) * Number(form.elements.unit.value);
    if (amount > 0) setAnswer(item, "minutes", String(Math.round(amount)));
  } else {
    const typed = form.elements.text.value.trim();
    const date = form.elements.date.value;
    if (typed) setAnswer(item, "when", "text:" + typed);
    else if (date) setAnswer(item, "when", "text:" + friendlyDate(date));
  }
  state.customOpen = null;
  nextQuestion();
  renderReview();
});

// After an answer, move to the next task that still has no due date.
function nextQuestion() {
  const list = questionItems();
  const next = list.findIndex((item, i) => i > state.questionIndex && needsAnswers(item));
  state.questionIndex = next === -1 ? list.length : next;
}

function setAnswer(item, question, value) {
  if (question === "minutes") {
    item.minutesUnsure = value === "unsure";
    item.minutes = value === "unsure" ? null : Number(value);
  } else if (question === "when") {
    // "Not sure" and "No deadline" leave the date empty. We never make one up.
    item.whenUnsure = value === "unsure";
    item.noDeadline = value === "none";
    item.when = value === "unsure" || value === "none" ? null
      : value.startsWith("text:") ? value.slice(5) : value;
  } else if (question === "urgency") {
    item.urgency = value;
  }
}

el.backBtn.addEventListener("click", () => goTo("dump"));

// Saving turns approved items into tasks, then goes to the plan.
// If tasks from an earlier dump are still open, we ask first: keep them,
// or start fresh with just this dump?
el.saveBtn.addEventListener("click", () => saveDump(false));

document.getElementById("keep-old-btn").addEventListener("click", () => saveDump(false));
document.getElementById("fresh-btn").addEventListener("click", () => saveDump(true));

function saveDump(startFresh) {
  el.saveChoice.hidden = true;
  el.saveBtn.hidden = false;

  // Starting fresh clears open tasks from before. Finished ones stay,
  // so your progress page still shows what you did.
  let removed = [];
  if (startFresh) {
    removed = tasks.filter(task => !task.done);
    tasks = tasks.filter(task => task.done);
    save(KEYS.plan, null);
  }

  const approved = state.items.filter(item => item.status === "approved");
  tasks.push(...approved.map(makeTask));
  saveTasks();
  save(KEYS.draft, "");
  el.dumpInput.value = "";
  updateDumpPage();
  state.items = []; // so the same list can't be saved twice

  if (startFresh) {
    toast(`Fresh start. Cleared ${plural(removed.length, "old task")}.`, () => {
      tasks.push(...removed);
      saveTasks();
      render();
    });
  } else {
    toast("Saved " + plural(approved.length, "item") + ". Here's your day.");
  }
  goTo("plan");
}


// Typing your own length on a card ("45", then Enter or tapping away).
el.itemList.addEventListener("change", event => {
  const input = event.target.closest("[data-minutes-for]");
  if (!input) return;
  const minutes = Math.round(Number(input.value));
  if (minutes > 0) {
    setAnswer(findItem(input.dataset.minutesFor), "minutes", String(minutes));
    renderReview();
  }
});
el.itemList.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.closest("[data-minutes-for]")) {
    event.preventDefault();
    event.target.blur();
  }
});


// Typing a new subject on a card: it's added to your list and picked.
el.itemList.addEventListener("keydown", event => {
  const box = event.target.closest("[data-new-subject]");
  if (!box || event.key !== "Enter") return;
  event.preventDefault();
  const item = findItem(box.closest(".card").dataset.id);
  const name = addSubject(box.value);
  if (item && name) { item.subject = name; learnSubject(item.title, name); state.subjectFor = null; renderReview(); }
});
