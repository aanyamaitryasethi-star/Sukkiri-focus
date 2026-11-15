// focus.js: page 4, a Pomodoro timer for one task at a time.
//
// A "round" is one focus block (25 min by default) followed by a short
// break. After a few rounds you get a long break. Every length is yours
// to change, and so is what happens when the time runs out.

const focusSettings = Object.assign(
  { focus: 25, short: 5, long: 15, rounds: 4, onEnd: "ask", autoBreak: true },
  load(KEYS.focus, {})
);

const timer = {
  mode: "focus",      // "focus", "short" (break) or "long" (break)
  round: 1,
  running: false,
  endsAt: 0,          // when the countdown hits zero (a clock time in ms)
  left: focusSettings.focus * 60000, // ms left while paused
  phaseMinutes: focusSettings.focus, // how long this countdown was, for your stats
  overtime: false,    // "Keep going" mode: counting up after zero
  overtimeSince: 0,
  waiting: false,     // time ran out and we're asking what's next
  taskId: null,
  ticker: null,
};

state.focusCustom = null;        // which setting's "Custom" box is open
state.focusSettingsOpen = false; // is "Timer settings" expanded

const focusEl = document.getElementById("focus-content");
const MODE_NAMES = { focus: "Focus", short: "Short break", long: "Long break" };
const RING = 2 * Math.PI * 130; // the circle's length, for the progress ring

// The timer is saved on every redraw, so a reload picks up where it left off.
function saveTimer() {
  const { ticker, ...saved } = timer;
  saved.date = todayISO();
  save(KEYS.timer, saved);
}

// Brings back a saved timer. Returns true if it's still going or waiting
// for you. If the time ran out while the page was closed, the round still
// counts, and we ask what's next instead of starting something by surprise.
function restoreTimer() {
  const saved = load(KEYS.timer, null);
  if (!saved || saved.date !== todayISO()) return false;
  const { date, ...fields } = saved;
  Object.assign(timer, fields);
  if (timer.running) {
    if (timer.overtime || timer.endsAt > Date.now()) {
      timer.ticker = setInterval(tick, 250);
    } else {
      timer.running = false;
      timer.left = 0;
      timer.waiting = true;
      if (timer.mode === "focus") addFocusTime(timer.phaseMinutes, 1);
    }
  }
  return timer.running || timer.overtime || timer.waiting;
}

// How long a timer is, in milliseconds. With "Auto" on, breaks depend on how
// much of your day is left. A long break is never shorter than a short one.
function breakMinutes(mode) {
  const short = focusSettings.autoBreak ? breakLengthAt(nowMinutes()) : focusSettings.short;
  return mode === "long" ? Math.max(focusSettings.long, short) : short;
}

function lengthOf(mode) {
  return (mode === "focus" ? focusSettings.focus : breakMinutes(mode)) * 60000;
}

// How long the timer that's on screen was when it started.
function phaseLength() {
  return timer.phaseMinutes * 60000;
}

function saveFocusSettings() {
  save(KEYS.focus, focusSettings);
}


// ---------------------------------------------------------------
// The timer itself
// ---------------------------------------------------------------
function startTimer() {

  timer.running = true;
  timer.waiting = false;
  if (!timer.overtime) timer.endsAt = Date.now() + timer.left;
  clearInterval(timer.ticker);
  timer.ticker = setInterval(tick, 250);
  render();
}

function pauseTimer() {
  if (!timer.overtime) timer.left = Math.max(0, timer.endsAt - Date.now());
  timer.running = false;
  clearInterval(timer.ticker);
  render();
}

function tick() {
  if (!timer.overtime) {
    timer.left = timer.endsAt - Date.now();
    if (timer.left <= 0) {
      timer.left = 0;
      timeIsUp();
      return;
    }
  }
  updateTimerDisplay();
}

function timeIsUp() {
  playChime();
  if (timer.mode === "focus") addFocusTime(timer.phaseMinutes, 1);

  if (focusSettings.onEnd === "auto") {
    nextPhase();
    startTimer();
    toast(timer.mode === "focus" ? "Break's over. Next round started." : "Round done. Break started.");
  } else if (focusSettings.onEnd === "keep") {
    timer.overtime = true;
    timer.overtimeSince = Date.now();
    render();
  } else {
    clearInterval(timer.ticker);
    timer.running = false;
    timer.waiting = true;
    render();
  }
}

// Focus -> break -> focus... with a long break after the last round.
function nextPhase() {
  finishOvertime();
  if (timer.mode === "focus") {
    timer.mode = timer.round >= focusSettings.rounds ? "long" : "short";
  } else {
    timer.round = timer.mode === "long" ? 1 : timer.round + 1;
    timer.mode = "focus";
  }
  timer.left = lengthOf(timer.mode);
  timer.phaseMinutes = timer.left / 60000;
  timer.waiting = false;
}

// Extra minutes from "Keep going" count as focus time too.
function finishOvertime() {
  if (timer.overtime && timer.mode === "focus") {
    addFocusTime(Math.round((Date.now() - timer.overtimeSince) / 60000), 0);
  }
  timer.overtime = false;
}

function setMode(mode) {
  clearInterval(timer.ticker);
  finishOvertime();
  timer.running = false;
  timer.waiting = false;
  timer.mode = mode;
  timer.left = lengthOf(mode);
  timer.phaseMinutes = timer.left / 60000;
}

// Called from other pages: "Start in focus mode" on a task.
// Every task gets a fresh Pomodoro: round 1, full focus time.
function startFocusOn(taskId, autoStart) {
  if (taskId !== timer.taskId) resetForTask(taskId);
  goTo("focus");
  if (autoStart && !timer.running) startTimer();
}

function resetForTask(taskId) {
  setMode("focus");
  timer.round = 1;
  timer.taskId = taskId;
}

// "Take a break" from the plan page.
function startBreak() {
  setMode("short");
  goTo("focus");
  startTimer();
}

// Finishing a task from the focus page: stop the timer and go back
// to the plan, which asks "take a break, or start the next one?"
function finishFromFocus(task, step, fromElement) {
  const finishesTask = !step || task.steps.filter(s => !s.done).length === 1;
  if (finishesTask) {
    resetForTask(null);
    state.justFinished = task.id;
  }
  if (step) completeStep(task, step, fromElement);
  else finishTodayPart(task, fromElement);
  if (finishesTask) goTo("plan");
}

function timeText() {
  if (timer.overtime) {
    const over = Math.floor((Date.now() - timer.overtimeSince) / 1000);
    return "+" + Math.floor(over / 60) + ":" + String(over % 60).padStart(2, "0");
  }
  const secs = Math.ceil(timer.left / 1000);
  return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
}

// Updates just the numbers and ring every tick, without redrawing the page.
function updateTimerDisplay() {
  const text = timeText();
  const label = document.getElementById("timer-text");
  const ring = document.getElementById("timer-ring");
  if (label) label.textContent = text;
  if (ring) {
    const done = timer.overtime ? 1 : 1 - timer.left / phaseLength();
    ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, done))));
  }
  const active = timer.running || timer.overtime;
  document.title = active ? text + " · " + MODE_NAMES[timer.mode] + " · Sukkiri" : "Sukkiri";
  const nav = document.getElementById("nav-focus");
  nav.querySelector(".dock-label").textContent = active ? text : "Focus";
}


// A soft chime when time runs out. (playNotes lives in ui.js.)
function playChime() {
  playNotes([523.25, 659.25, 783.99], 0.18, 0.9, 0.2);
}


// ---------------------------------------------------------------
// Drawing the page
// ---------------------------------------------------------------
function renderFocus() {
  const task = timer.taskId ? findTask(timer.taskId) : null;
  if (task && task.done && !timer.running) timer.taskId = null;

  const done = timer.overtime ? 1 : 1 - timer.left / phaseLength();
  const isBreak = timer.mode !== "focus";

  focusEl.innerHTML = `
    <div class="focus-wrap ${isBreak ? "focus-wrap--break" : ""}">
      <div class="focus-main">
      <div class="mode-tabs" role="group" aria-label="Timer mode">
        ${["focus", "short", "long"].map(mode => `
          <button class="mode-tab ${timer.mode === mode ? "mode-tab--on" : ""}" type="button" aria-pressed="${timer.mode === mode}" data-focus="mode" data-value="${mode}">${MODE_NAMES[mode]}</button>`).join("")}
      </div>

      <div class="timer">
        <canvas class="sky-canvas sky-canvas--timer" data-scene="timer" aria-hidden="true"></canvas>
        <svg class="timer-svg" viewBox="0 0 300 300" role="img" aria-label="${MODE_NAMES[timer.mode]} timer">
          <circle cx="150" cy="150" r="130" fill="none" stroke="var(--surface-2)" stroke-width="14"></circle>
          <circle id="timer-ring" cx="150" cy="150" r="130" fill="none" stroke="${timer.overtime ? "var(--soft)" : isBreak ? "var(--soft)" : "var(--accent)"}" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - Math.min(1, Math.max(0, done)))}" transform="rotate(-90 150 150)"></circle>
        </svg>
        <div class="timer-center">
          <span class="timer-mode">${timer.overtime ? "Extra time" : MODE_NAMES[timer.mode]}</span>
          <span id="timer-text" class="timer-text">${timeText()}</span>
          <span class="timer-round">Round ${timer.round} of ${focusSettings.rounds}</span>
        </div>
      </div>

      ${timer.waiting ? waitingHTML() : controlsHTML()}
      </div>

      <div class="focus-side">
        ${taskPickerHTML(task)}
        ${focusSettingsHTML()}
      </div>
    </div>`;

  updateTimerDisplay();
}

function taskPickerHTML(task) {
  const open = tasks.filter(t => !t.done && t.type !== "idea");
  const today = open.filter(t => bucketOf(t) === "today").sort(byPriority);
  const later = open.filter(t => bucketOf(t) !== "today").sort(byPriority);
  const option = t => `<option value="${t.id}" ${task && task.id === t.id ? "selected" : ""}>${escapeHTML(t.title)}</option>`;
  const step = task ? nextStepOf(task) : null;

  return `
    <div class="focus-task">
      <label class="focus-label" for="focus-task">Working on</label>
      <select class="input focus-select" id="focus-task" data-focus="task">
        <option value="">Just focus (no task)</option>
        ${today.length ? `<optgroup label="Today">${today.map(option).join("")}</optgroup>` : ""}
        ${later.length ? `<optgroup label="Later">${later.map(option).join("")}</optgroup>` : ""}
      </select>
      ${task ? `
        <div class="focus-now">
          ${subjectTagHTML(task.subject)}
          ${task.notes && task.notes.trim() ? `<p class="note-preview note-preview--focus">${linkify(task.notes.trim())}</p>` : ""}
          ${step ? (step.session
            ? `<span class="focus-step">${escapeHTML(step.text)}${step.minutes ? ` <span class="muted">· ${formatMinutes(step.minutes)}</span>` : ""}</span>`
            : `<span class="focus-step"><span class="muted">Step ${task.steps.indexOf(step) + 1} of ${task.steps.length}:</span> ${escapeHTML(step.text)}</span>`) : ""}
          <div class="row-gap row-gap--center">
            ${step ? `<button class="btn btn--ghost btn--small" type="button" data-focus="step-done">${ICONS.check} ${step.session ? "Session" : "Step"} done</button>` : ""}
            <button class="btn btn--ghost btn--small" type="button" data-focus="task-done">${ICONS.check} ${task.sessions.length ? "Today's part done" : "Task done"}</button>
          </div>
        </div>` : ""}
    </div>`;
}

function controlsHTML() {
  const active = timer.running || timer.overtime;
  const fresh = timer.left === phaseLength() && !timer.overtime;
  let main;
  if (timer.overtime) main = `<button class="btn btn--primary btn--big" type="button" data-focus="next">${timer.mode === "focus" ? "Take a break" : "Start focusing"}</button>`;
  else if (active) main = `<button class="btn btn--primary btn--big" type="button" data-focus="pause">Pause</button>`;
  else main = `<button class="btn btn--primary btn--big" type="button" data-focus="start">${ICONS.play} ${fresh ? "Start" : "Resume"}</button>`;

  return `
    <div class="timer-controls">
      <button class="round-btn" type="button" data-focus="reset" aria-label="Restart this timer">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg>
      </button>
      ${main}
      <button class="round-btn" type="button" data-focus="skip" aria-label="Skip to ${timer.mode === "focus" ? "break" : "next round"}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l10 7-10 7z"></path><path d="M19 5v14"></path></svg>
      </button>
    </div>`;
}

function waitingHTML() {
  const fromFocus = timer.mode === "focus";
  const nextBreak = timer.round >= focusSettings.rounds ? "long" : "short";
  return `
    <div class="time-up" role="status">
      <h2 class="section-title">${fromFocus ? "Round done. Nice work." : "Break's over."}</h2>
      <p class="muted">${fromFocus
        ? `Time for a ${breakMinutes(nextBreak)}-minute ${nextBreak === "long" ? "long " : ""}break?`
        : `Ready for round ${timer.mode === "long" ? 1 : timer.round + 1}?`}</p>
      <div class="row-gap row-gap--center">
        <button class="btn btn--primary" type="button" data-focus="next-start">${fromFocus ? "Start break" : "Start focusing"}</button>
        <button class="btn btn--ghost" type="button" data-focus="more">${fromFocus ? "5 more minutes" : "5 more minutes of break"}</button>
      </div>
    </div>`;
}

function focusSettingsHTML() {
  const row = (key, label, options) => {
    const auto = key === "short" && focusSettings.autoBreak;
    const isPreset = auto || options.includes(focusSettings[key]);
    const autoChip = key === "short" ? choiceHTML(`Auto (${breakLengthAt(nowMinutes())} min now)`, auto, 'data-focus="set" data-key="autoBreak" data-value="on"') : "";
    const chips = autoChip + options.map(n => choiceHTML(n + " min", !auto && focusSettings[key] === n, `data-focus="set" data-key="${key}" data-value="${n}"`)).join("")
      + (isPreset ? "" : choiceHTML(focusSettings[key] + " min", true, `data-focus="custom" data-key="${key}"`))
      + choiceHTML("Custom…", state.focusCustom === key, `data-focus="custom" data-key="${key}"`);
    const custom = state.focusCustom !== key ? "" : `
      <form class="custom-row" data-focus-form="${key}">
        <label class="sr-only" for="custom-${key}">${label} in minutes</label>
        <input class="input input--narrow" id="custom-${key}" name="minutes" type="number" min="1" max="180" placeholder="min" required>
        <button class="btn btn--primary btn--small" type="submit">Set</button>
      </form>`;
    return questionBlock(label, chips, custom);
  };

  const rounds = [2, 3, 4, 6].map(n => choiceHTML(String(n), focusSettings.rounds === n, `data-focus="set" data-key="rounds" data-value="${n}"`)).join("");
  const ends = [["ask", "Ask me"], ["auto", "Start the next one"], ["keep", "Keep going"]]
    .map(([value, label]) => choiceHTML(label, focusSettings.onEnd === value, `data-focus="set" data-key="onEnd" data-value="${value}"`)).join("");

  return `
    <details class="focus-settings" ${state.focusSettingsOpen ? "open" : ""}>
      <summary>Timer settings</summary>
      <div class="focus-settings-body">
        ${row("focus", "Focus length", [15, 25, 45, 50])}
        ${row("short", "Short break", [5, 10])}
        ${row("long", "Long break", [15, 20, 30])}
        ${questionBlock("Rounds before a long break", rounds, "")}
        ${questionBlock("When time runs out", ends, "")}
      </div>
    </details>`;
}


// ---------------------------------------------------------------
// Clicks
// ---------------------------------------------------------------
focusEl.addEventListener("click", event => {
  const button = event.target.closest("button[data-focus]");
  if (!button) return;
  const task = timer.taskId ? findTask(timer.taskId) : null;

  switch (button.dataset.focus) {
    case "start": startTimer(); return;
    case "pause": pauseTimer(); return;
    case "reset": setMode(timer.mode); break;
    case "skip": {
      const wasRunning = timer.running;
      clearInterval(timer.ticker);
      timer.running = false;
      nextPhase();
      if (wasRunning) { startTimer(); return; }
      break;
    }
    case "next":
    case "next-start":
      clearInterval(timer.ticker);
      timer.running = false;
      nextPhase();
      startTimer();
      return;
    case "more":
      timer.left = 5 * 60000;
      timer.phaseMinutes = 5;
      startTimer();
      return;
    case "mode": setMode(button.dataset.value); break;
    case "step-done": finishFromFocus(task, nextStepOf(task), button); return;
    case "task-done": finishFromFocus(task, null, button); return;
    case "custom": state.focusCustom = state.focusCustom === button.dataset.key ? null : button.dataset.key; break;
    case "set": changeSetting(button.dataset.key, button.dataset.value); break;
  }
  render();
});

// Remember whether "Timer settings" is open, so it stays open after a click.
focusEl.addEventListener("toggle", event => {
  if (event.target.matches(".focus-settings")) state.focusSettingsOpen = event.target.open;
}, true);

focusEl.addEventListener("change", event => {
  if (event.target.dataset.focus === "task") {
    resetForTask(event.target.value || null); // a new task gets a fresh timer
    render();
  }
});

focusEl.addEventListener("submit", event => {
  event.preventDefault();
  const minutes = Math.round(Number(event.target.elements.minutes.value));
  if (minutes > 0) changeSetting(event.target.dataset.focusForm, minutes);
  render();
});

function changeSetting(key, value) {
  const wasFull = !timer.running && !timer.overtime && timer.left === phaseLength();
  if (key === "autoBreak") {
    focusSettings.autoBreak = true;
  } else {
    focusSettings[key] = key === "onEnd" ? value : Number(value);
    if (key === "short") focusSettings.autoBreak = false; // you picked a length yourself
  }
  saveFocusSettings();
  state.focusCustom = null;
  // A timer that hasn't started yet picks up the new length right away.
  if (wasFull && timer.left !== lengthOf(timer.mode)) {
    timer.left = lengthOf(timer.mode);
    timer.phaseMinutes = timer.left / 60000;
  }
}
