// progress.js: page 6, what you got done.
//
// The rule here: never punish. No red, no "overdue", no broken streaks.
// Unfinished tasks are just "carried over", and you choose where they go.

const progressEl = document.getElementById("progress-content");

function renderProgress() {
  const doneToday = doneTodayTasks();
  const openToday = openTodayTasks();
  const total = doneToday.length + openToday.length;
  const percent = total === 0 ? 0 : Math.round(doneToday.length / total * 100);
  const focusToday = statsFor(todayISO());

  // This week = the last 7 days, including today.
  const weekStart = addDays(todayISO(), -6);
  const doneWeek = tasks.filter(task => task.done && task.doneAt && isoDate(new Date(task.doneAt)) >= weekStart);
  let focusWeek = 0;
  for (let i = 0; i < 7; i++) focusWeek += statsFor(addDays(todayISO(), -i)).minutes;

  const carried = tasks.filter(isCarriedOver).sort(byPriority);
  const earlier = doneWeek.filter(task => !doneToday.includes(task))
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt));

  // On the Sky page, under your stars: a few numbers, anything carried over,
  // and what you finished tucked away until you want it.
  progressEl.innerHTML = `
    <section class="stats" aria-label="Your stats">
      <h2 class="section-title">Your stats</h2>
      <div class="tiles">
        ${tileHTML(String(streak.current), "day streak")}
        ${tileHTML(total ? `${doneToday.length} of ${total}` : String(doneToday.length), "done today")}
        ${tileHTML(focusToday.minutes ? formatMinutes(focusToday.minutes) : "0 min", "focused today")}
      </div>
      ${streakLineHTML()}
    </section>

    ${subjectWeekHTML(doneWeek)}

    ${carried.length ? `
      <section class="carry" aria-label="Carried over">
        <div class="section-head">
          <h2 class="section-title">Carried over</h2>
          <span class="section-sub">These didn't happen yet. That's okay.</span>
        </div>
        <ul class="task-list">
          ${carried.map(task => `
            <li class="task-row" data-id="${task.id}">
              <div class="task-body">
                <span class="task-title">${escapeHTML(task.title)}</span>
                <span class="task-meta">From ${friendlyDate(carriedFrom(task))}</span>
              </div>
              <div class="task-actions">
                <button class="btn btn--primary btn--small" type="button" data-progress="move" data-where="today">Today</button>
                <button class="btn btn--ghost btn--small" type="button" data-progress="move" data-where="tomorrow">Tomorrow</button>
              </div>
            </li>`).join("")}
        </ul>
      </section>` : ""}

    ${doneToday.length || earlier.length ? `
      <details class="finished">
        <summary>What you finished this week <span class="muted">· ${doneWeek.length}${focusWeek ? " · " + formatMinutes(focusWeek) + " focus" : ""}</span></summary>
        ${doneListHTML("Today", doneToday)}
        ${doneListHTML("Earlier this week", earlier)}
      </details>` : ""}

    ${backupHTML()}
    ${startOverHTML()}`;
}

// Never a guilt trip. If a streak ended, your best is still your best.
function streakLineHTML() {
  if (streak.best === 0) return "";
  const rest = restDaysLeft();
  const text = streak.current === 0
    ? `Your best is still ${plural(streak.best, "day")}. Start again today.`
    : `Best: ${plural(streak.best, "day")} · ${plural(rest, "rest day")} left this week`;
  return `<p class="streak-line">${text}</p>`;
}

// Wipes everything, like opening the app for the first time. It can't be
// undone, so it asks first.
function startOverHTML() {
  if (!state.confirmStartOver) {
    return `
      <section class="start-over">
        <button class="btn btn--ghost btn--small btn--quiet" type="button" data-progress="start-over">Start over</button>
      </section>`;
  }
  return `
    <section class="start-over start-over--ask" role="alert">
      <p><strong>Delete everything and start brand new?</strong> Your tasks, plan, streak, focus time, schedule and settings will all be gone. This can't be undone.</p>
      <div class="row-gap">
        <button class="btn btn--primary" type="button" data-progress="start-over-yes">Yes, delete everything</button>
        <button class="btn btn--ghost" type="button" data-progress="start-over-no">Keep my stuff</button>
      </div>
    </section>`;
}

function startOver() {
  clearInterval(timer.ticker);
  Object.values(KEYS).forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Couldn't reach saved data. The reload below still resets the page.
    }
  });
  // Clear what's in memory too, so nothing old can be saved back.
  tasks = [];
  schedule = [];
  stats = {};
  day = { start: "07:00", end: "22:00" };
  streak = { current: 0, best: 0, lastDate: null, restDays: [], before: null };
  sky = makeSky();
  state.items = [];
  state.confirmStartOver = false;
  Object.assign(focusSettings, { focus: 25, short: 5, long: 15, rounds: 4, onEnd: "ask", autoBreak: true });
  resetForTask(null);
  el.dumpInput.value = "";
  updateDumpPage();
  goTo("dump");
  location.reload();
}

function tileHTML(value, label) {
  return `<div class="tile"><span class="tile-value">${value}</span><span class="tile-label">${label}</span></div>`;
}

function doneListHTML(heading, list) {
  if (list.length === 0) return "";
  return `
    <h3 class="done-heading">${heading}</h3>
    <ul class="task-list">
      ${list.map(task => `
        <li class="task-row task-row--done" data-id="${task.id}">
          <button class="tick tick--on" type="button" data-progress="undo" aria-label="Mark not done: ${escapeHTML(task.title)}">${ICONS.check}</button>
          <div class="task-body">
            <span class="task-title">${escapeHTML(task.title)}</span>
            <span class="task-meta">${subjectColour(task.subject) ? subjectTagHTML(task.subject) : task.category}${task.minutes ? " · " + formatMinutes(task.minutes) : ""}</span>
          </div>
        </li>`).join("")}
    </ul>`;
}

// A kind line for every situation. None of them make you feel bad.
function encouragement(done, open) {
  if (done === 0 && open === 0) return "A clear day. Nice.";
  if (done === 0) return "Every list starts at zero. Pick one small thing.";
  if (open === 0) return "All done. Go enjoy your day.";
  if (done >= open) return "More than halfway there.";
  return "You've started. That's the hardest part.";
}

// ---------------------------------------------------------------
// Backup: everything you have, in one small file you keep.
// ---------------------------------------------------------------
function backupHTML() {
  const last = load(KEYS.backup, null);
  const when = last ? new Date(last).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  if (state.pendingRestore) {
    const info = state.pendingRestore.info;
    return `
      <section class="start-over start-over--ask" role="alert">
        <p><strong>Replace everything here with this backup?</strong> It has ${plural(info.tasks, "task")}${info.date ? ", saved " + info.date : ""}. What's in the app now will be replaced.</p>
        <div class="row-gap">
          <button class="btn btn--primary" type="button" data-progress="restore-yes">Yes, restore it</button>
          <button class="btn btn--ghost" type="button" data-progress="restore-no">Cancel</button>
        </div>
      </section>`;
  }
  return `
    <section class="backup">
      <h3 class="backup-title">Back up your data</h3>
      <p class="muted">Everything is saved in this browser only. A backup file keeps your tasks, stars and streak safe${when ? ` · last saved ${when}` : ""}.</p>
      <div class="row-gap">
        <button class="btn btn--ghost btn--small" type="button" data-progress="backup-save">Save backup</button>
        <label class="btn btn--ghost btn--small backup-pick">Restore from file<input type="file" accept=".json,application/json" data-progress-file="restore"></label>
      </div>
    </section>`;
}

function makeBackup() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("unscatter.")) data[key] = localStorage.getItem(key);
    }
  } catch (error) {
    // Couldn't read saved data.
  }
  return JSON.stringify({ app: "sukkiri", version: 1, savedAt: new Date().toISOString(), data: data });
}

async function saveBackup() {
  const filename = "sukkiri-backup-" + todayISO() + ".json";
  const text = makeBackup();
  try {
    const downloads = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
    if (downloads) {
      await downloads.save({ filename: filename, data: text });
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    }
  } catch (error) {
    if (error && error.code === "declined") return;
    toast("Couldn't save the backup here.");
    return;
  }
  save(KEYS.backup, new Date().toISOString());
  toast("Backup saved.");
  render();
}

// Reads a backup file and checks it before anything is replaced.
function readBackupFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast("That file is too big to be a backup."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (parsed.app !== "sukkiri" || !parsed.data || typeof parsed.data !== "object") throw new Error("not a backup");
      const clean = {};
      Object.keys(parsed.data).forEach(key => {
        if (!key.startsWith("unscatter.") || typeof parsed.data[key] !== "string") return;
        JSON.parse(parsed.data[key]); // each piece must be valid
        clean[key] = parsed.data[key];
      });
      const items = clean[KEYS.tasks] ? JSON.parse(clean[KEYS.tasks]) : [];
      state.pendingRestore = {
        data: clean,
        info: { tasks: Array.isArray(items) ? items.length : 0, date: parsed.savedAt ? new Date(parsed.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "" },
      };
      render();
    } catch (error) {
      toast("That doesn't look like a Sukkiri backup.");
    }
  };
  reader.readAsText(file);
}

function restoreBackup() {
  const data = state.pendingRestore.data;
  clearInterval(timer.ticker);
  try {
    Object.keys(data).forEach(key => localStorage.setItem(key, data[key]));
  } catch (error) {
    toast("Couldn't restore here.");
    return;
  }
  state.pendingRestore = null;
  location.reload(); // same tick, so nothing old gets saved back over it
}

progressEl.addEventListener("change", event => {
  const input = event.target.closest("input[data-progress-file]");
  if (!input) return;
  readBackupFile(input.files[0]);
  input.value = "";
});

progressEl.addEventListener("click", event => {
  const button = event.target.closest("button[data-progress]");
  if (!button) return;
  const row = button.closest(".task-row");
  const task = row ? findTask(row.dataset.id) : null;

  switch (button.dataset.progress) {
    case "celebrate": stringReplay(); return;
    case "backup-save": saveBackup(); return;
    case "restore-no": state.pendingRestore = null; break;
    case "restore-yes": restoreBackup(); return;
    case "start-over": state.confirmStartOver = true; break;
    case "start-over-no": state.confirmStartOver = false; break;
    case "start-over-yes": startOver(); return;
    case "undo": uncompleteTask(task); return;
    case "move": {
      const names = { today: "today", tomorrow: "tomorrow", someday: "Someday" };
      moveTask(task, button.dataset.where);
      toast(`Moved “${task.title}” to ${names[button.dataset.where]}.`);
      break;
    }
    case "move-all":
      tasks.filter(isCarriedOver).forEach(t => moveTask(t, "today"));
      toast("Moved everything to today.");
      break;
  }
  render();
});


// "Most time on Maths this week": focus minutes per subject from the last
// 7 days, plus how many tasks you finished in each.
function subjectWeekHTML(doneWeek) {
  const focus = {};
  for (let i = 0; i < 7; i++) {
    const day = statsFor(addDays(todayISO(), -i));
    for (const [name, minutes] of Object.entries(day.subjects || {})) focus[name] = (focus[name] || 0) + minutes;
  }
  const done = {};
  doneWeek.forEach(task => { if (task.subject) done[task.subject] = (done[task.subject] || 0) + 1; });
  const names = [...new Set([...Object.keys(focus), ...Object.keys(done)])].filter(subjectColour);
  if (names.length === 0) return "";

  // Rank by focus time; with no focus yet, by planned time of finished tasks.
  const planned = {};
  doneWeek.forEach(task => { if (task.subject) planned[task.subject] = (planned[task.subject] || 0) + (task.minutes || 0); });
  const score = name => (focus[name] || 0) * 1000 + (planned[name] || 0);
  names.sort((a, b) => score(b) - score(a));
  const top = names[0];
  const max = Math.max(...names.map(name => focus[name] || planned[name] || 1));
  const anyFocus = names.some(name => focus[name]);

  return `
    <section class="subj-week" aria-label="This week by subject">
      <div class="section-head">
        <h2 class="section-title">This week by subject</h2>
        <span class="section-sub">Most time on <strong style="color: ${subjectColour(top)}">${escapeHTML(top)}</strong></span>
      </div>
      <ul class="subj-bars">
        ${names.map(name => {
          const value = anyFocus ? (focus[name] || 0) : (planned[name] || 0);
          const label = [value ? formatMinutes(value) + (anyFocus ? " focus" : "") : "", done[name] ? done[name] + " done" : ""].filter(Boolean).join(" · ");
          return `
            <li class="subj-bar" style="--subj: ${subjectColour(name)}">
              <span class="subj-bar-name">${escapeHTML(name)}</span>
              <span class="subj-bar-track"><span class="subj-bar-fill" style="width: ${Math.max(4, Math.round((value || 0) / max * 100))}%"></span></span>
              <span class="subj-bar-value">${label}</span>
            </li>`;
        }).join("")}
      </ul>
    </section>`;
}
