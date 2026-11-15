// plan.js: page 3, your plan for today.
//
// How it works:
// 1. Your fixed schedule (school, practice...) and anything with a set
//    time ("go out from 6-8") are blocked off. We never move those.
// 2. Today's tasks go in one after another, most urgent first, so the
//    order on screen is always the order of importance.
// 3. Quick reminders ("message Ms. Lee") don't take a time slot. They
//    get their own "Don't forget" list.
// 4. The plan is only a suggestion until you press "Use this plan".
//    After that, we always ask before changing it.

state.planReplan = false;     // showing the "here's what would change" card
state.planKeepToday = [];     // tasks you chose to keep today even though they don't fit
state.planAddStepFor = null;  // task id whose "add a step" box is open
state.planBreaking = null;    // task id being broken into steps right now
state.planScheduleOpen = false;
state.planAdding = false;     // the "add a task" form is open
state.newTaskDraft = {};      // what's typed into the add form so far
state.rowMenu = null;         // the task whose little menu is open on Today
state.justFinished = null;    // task you just finished: shows "take a break or keep going?"

const planEl = document.getElementById("plan-content");
const PX_PER_MINUTE = 0.9;    // how tall the day view is: 54px per hour

function savedPlan() {
  const plan = load(KEYS.plan, null);
  return plan && plan.date === todayISO() ? plan : null;
}

// Your fixed schedule on one day.
function scheduleOn(date) {
  const weekday = fromISO(date).getDay();
  return schedule
    .filter(block => block.repeat === "daily"
      || (block.repeat === "weekdays" && weekday >= 1 && weekday <= 5)
      || (block.repeat === "once" && block.date === date))
    .map(block => ({ kind: "fixed", label: block.label, start: toMinutes(block.start), end: toMinutes(block.end) }));
}

// Blocks you can't move: your schedule, plus tasks with a set time.
function busyToday() {
  const today = todayISO();
  const blocks = scheduleOn(today);

  for (const task of tasks) {
    const range = eventTimeOf(task);
    const isToday = bucketOf(task) === "today" || (task.done && task.dueDate === today);
    if (range && isToday && task.type !== "idea") {
      blocks.push({ kind: "event", label: task.title, start: range.start, end: range.end, taskId: task.id });
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}

// Tasks that get a time slot: real tasks for today without a set time.
function plannableTasks() {
  return openTodayTasks().filter(task => task.type === "task" && !hasSetTime(task)).sort(byPriority);
}

// Quick things to remember today, like messaging someone.
function todayReminders() {
  return tasks.filter(task => task.type === "reminder" && !hasSetTime(task)
    && (bucketOf(task) === "today" || (task.done && task.doneAt && isoDate(new Date(task.doneAt)) === todayISO())));
}

// Places today's tasks one after another, most urgent first.
// Returns a suggestion only. Nothing changes until you say yes.
function proposePlan() {
  const dayEnd = toMinutes(day.end);
  // Try roomy breaks first. If that pushes a task off today, use short ones.
  let placed = placeTasks(breakLengthAt);
  if (placed.unfit.length > 0) {
    const tight = placeTasks(() => 5);
    if (tight.unfit.length < placed.unfit.length) placed = tight;
  }
  const { slots, unfit, cursor } = placed;
  const lastEnd = slots.length ? slots[slots.length - 1].end : cursor;
  return { date: todayISO(), slots: slots, unfit: unfit, freeLeft: Math.max(0, dayEnd - lastEnd) };
}

// Nobody can work 3 hours straight. Big tasks are planned as short
// sessions (as long as your focus timer, 25 min unless you changed it)
// with a break after each one.
function sessionLength() {
  return focusSettings.focus || 25;
}

// 180 min -> [30, 30, 30, 30, 30, 30] with 30-min sessions.
// Something only a little longer than one session stays in one go.
function sessionLengths(total) {
  const count = Math.max(1, Math.round(total / sessionLength()));
  const lengths = [];
  let left = total;
  for (let i = count; i > 0; i--) {
    const one = i === 1 ? left : Math.ceil(left / i / 5) * 5;
    lengths.push(one);
    left -= one;
  }
  return lengths.filter(one => one > 0);
}

// The sessions a task is planned in today. If you split it yourself, your
// sessions are used (one per step). Otherwise it's split evenly.
function sessionsFor(task) {
  const openSteps = task.steps.filter(step => !step.done);
  if (openSteps.length > 0 && openSteps.every(step => step.minutes)) {
    return openSteps.map(step => ({ minutes: step.minutes, stepId: step.id }));
  }
  return sessionLengths(minutesLeft(task) || 30).map(minutes => ({ minutes: minutes }));
}

// Fits the tasks one after another. Every session gets a break after it.
function placeTasks(breakFor) {
  const busy = busyToday();
  const dayEnd = toMinutes(day.end);
  let cursor = Math.max(toMinutes(day.start), Math.ceil(nowMinutes() / 5) * 5);
  const slots = [];
  const unfit = [];

  // The first start time from `from` that doesn't bump into a busy block.
  const freeStart = (from, length) => {
    let start = from;
    for (const block of busy) {
      if (start < block.end && start + length > block.start) start = block.end;
    }
    return start;
  };

  for (const task of plannableTasks()) {
    const chunks = [];
    let at = cursor;
    let fits = true;
    for (const session of sessionsFor(task)) {
      const start = freeStart(at, session.minutes);
      if (start + session.minutes > dayEnd) { fits = false; break; }
      if (chunks.length > 0) {
        const before = chunks[chunks.length - 1];
        before.breakAfter = Math.min(breakFor(before.end), start - before.end);
      }
      chunks.push({ start: start, end: start + session.minutes, stepId: session.stepId || null });
      at = start + session.minutes + breakFor(start + session.minutes);
    }
    if (!fits) {
      unfit.push(task.id);
      continue;
    }
    const first = chunks[0];
    const last = chunks[chunks.length - 1];
    // The previous task's break, now that we know another task follows it.
    if (slots.length > 0) {
      const before = slots[slots.length - 1];
      before.breakAfter = Math.min(breakFor(before.end), first.start - before.end);
    }
    slots.push({ taskId: task.id, start: first.start, end: last.end, chunks: chunks, guessed: !minutesLeft(task) });
    cursor = at;
  }
  return { slots: slots, unfit: unfit, cursor: cursor };
}

// The sessions in a slot. Plans saved before sessions existed have one.
function chunksOf(slot) {
  return slot.chunks && slot.chunks.length ? slot.chunks : [{ start: slot.start, end: slot.end }];
}

function workMinutes(slot) {
  return chunksOf(slot).reduce((sum, chunk) => sum + chunk.end - chunk.start, 0);
}

// How many free minutes a day has, after your schedule and set-time things.
function freeMinutesOn(date) {
  const start = date === todayISO()
    ? Math.max(toMinutes(day.start), nowMinutes())
    : toMinutes(day.start);
  const end = toMinutes(day.end);
  const blocks = scheduleOn(date);
  for (const task of tasks) {
    const time = eventTimeOf(task);
    if (time && !task.done && task.dueDate === date) blocks.push(time);
  }
  // Time for work you already have on that day is taken too.
  const planned = tasks.reduce((sum, task) => {
    if (task.done || task.type !== "task" || hasSetTime(task)) return sum;
    if (task.sessions.length) return sum + task.sessions.filter(part => !part.done && part.date === date).reduce((s, part) => s + part.minutes, 0);
    return workDateOf(task) === date || (date === todayISO() && bucketOf(task) === "today") ? sum + (task.minutes || 30) : sum;
  }, 0);
  let free = -planned;
  let cursor = start;
  for (const block of blocks.sort((a, b) => a.start - b.start)) {
    if (block.start > cursor) free += Math.max(0, Math.min(block.start, end) - cursor);
    cursor = Math.max(cursor, block.end);
  }
  return free + Math.max(0, end - cursor);
}

// A suggestion for splitting a big task over the days before it's due.
// It starts as soon as there's room and finishes before the due date.
// Each part is at least 45 minutes. Returns [] if it can't be split.
function buildParts(task) {
  const openSteps = task.steps.filter(step => !step.done);
  const total = openSteps.length && openSteps.every(step => step.minutes)
    ? openSteps.reduce((sum, step) => sum + step.minutes, 0)
    : task.minutes;

  const days = [];
  for (let date = todayISO(); date < task.dueDate; date = addDays(date, 1)) {
    const free = freeMinutesOn(date);
    if (free >= 45) days.push({ date: date, free: free });
  }

  const count = Math.min(days.length, Math.floor(total / 45), 5);
  if (count < 2) return [];

  const parts = [];
  let left = total;
  days.slice(0, count).forEach((one, i) => {
    const share = Math.ceil(left / (count - i) / 5) * 5; // round to 5 minutes
    const minutes = Math.min(share, one.free, left);
    parts.push({ date: one.date, minutes: minutes, done: false });
    left -= minutes;
  });
  return left > 0 ? [] : parts; // not enough free time before it's due
}

// Big tasks coming up that could start earlier. We only suggest: nothing
// changes until you say yes.
function spreadSuggestions() {
  const today = todayISO();
  return tasks
    .filter(task => task.type === "task" && !task.done && !hasSetTime(task)
      && task.minutes >= 90 && task.dueDate && task.dueDate >= addDays(today, 2)
      && task.sessions.length === 0 && !task.spreadDeclined && !task.planDate && !task.bucket)
    .map(task => ({ task: task, parts: buildParts(task) }))
    .filter(suggestion => suggestion.parts.length > 0)
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate))
    .slice(0, 2);
}

// What would change if you used the new suggestion instead of your plan.
function planChanges(oldPlan, newPlan) {
  const changes = [];
  for (const slot of newPlan.slots) {
    const task = findTask(slot.taskId);
    const before = oldPlan.slots.find(s => s.taskId === slot.taskId);
    if (!before) changes.push(`Add “${task.title}” at ${clockLabel(slot.start)}`);
    else if (Math.abs(before.start - slot.start) >= 15) changes.push(`Move “${task.title}” from ${clockLabel(before.start)} to ${clockLabel(slot.start)}`);
  }
  for (const slot of oldPlan.slots) {
    const task = findTask(slot.taskId);
    if (task && !task.done && !newPlan.slots.some(s => s.taskId === slot.taskId)) {
      changes.push(`Take “${task.title}” out of today's plan (it doesn't fit anymore)`);
    }
  }
  return changes;
}

// The slots in the plan whose tasks still belong to today.
function liveSlots(plan) {
  return plan.slots.filter(slot => {
    const task = findTask(slot.taskId);
    return task && (task.done || bucketOf(task) === "today");
  });
}

// Why a task sits where it does, in plain words.
function reasonFor(task) {
  const today = todayISO();
  const reasons = [];
  if (isCarriedOver(task)) reasons.push("carried over from " + lowerDay(friendlyDate(carriedFrom(task))));
  else if (task.dueDate === today) reasons.push("due today");
  else if (task.dueDate === addDays(today, 1)) reasons.push("due tomorrow, so do it today");
  else if (task.dueDate) reasons.push("due " + lowerDay(friendlyDate(task.dueDate)));
  if (task.sessions.length) {
    const next = task.sessions.find(part => !part.done);
    if (next) reasons.unshift(`part ${task.sessions.indexOf(next) + 1} of ${task.sessions.length}`);
  }
  return capitalize(reasons.join(" · ") || "From your brain dump");
}

function lowerDay(text) {
  return text === "Today" || text === "Yesterday" || text === "Tomorrow" ? text.toLowerCase() : text;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Your morning, sorted.";
  if (hour < 17) return "Your afternoon, sorted.";
  return "Your evening, sorted.";
}


// ---------------------------------------------------------------
// Drawing the page
// ---------------------------------------------------------------
function renderPlan() {
  document.getElementById("plan-heading").textContent = greeting();

  if (needsSetup()) {
    planEl.innerHTML = setupHTML();
    return;
  }

  state.sessionHintShown = false;
  // The plan is always live: it re-fits your day every time you look,
  // so there's nothing to accept or lock in.
  const proposal = proposePlan();
  const slots = allSlots(null, proposal);
  const busy = busyToday();
  const reminders = todayReminders();

  if (slots.length === 0 && busy.length === 0 && reminders.length === 0 && proposal.unfit.length === 0 && !state.planAdding) {
    planEl.innerHTML = emptyPlanHTML() + moreHTML(proposal, busy, slots) + fabHTML();
    return;
  }

  // The big card already shows the next task, so the list shows the rest.
  const nextSlot = slots.find(slot => !findTask(slot.taskId).done);
  const rest = slots.filter(slot => slot !== nextSlot && !findTask(slot.taskId).done);
  // Something happening now already has the big card, so don't list it twice.
  const now = nowMinutes();
  const topCard = breakCardHTML(slots) ? null : busy.find(block => block.end > now && block.start <= now + 45 && !(block.taskId && findTask(block.taskId).done));
  const restBusy = busy.filter(block => block !== topCard && !(block.taskId && findTask(block.taskId).done));

  planEl.innerHTML = `
    <div class="today">
      ${summaryHTML(slots)}
      ${state.planAdding ? addTaskHTML() : ""}
      ${breakCardHTML(slots) || eventSoonHTML(busy, slots) || nextStepHTML(slots)}
      ${estimatesHTML()}
      ${unfitHTML(proposal)}
      <section class="today-rest" aria-labelledby="order-title">
        <div class="section-head">
          <h2 class="section-title" id="order-title">${rest.length || restBusy.length ? "After that" : "That's it for today"}</h2>
        </div>
        ${rest.length || restBusy.length ? orderHTML(rest, restBusy, slots) : ""}
        ${remindersHTML(reminders)}
      </section>
      ${moreHTML(proposal, busy, slots)}
    </div>
    ${fabHTML()}`;
  focusAddForm();
}

// The big + in the corner: add something to today without hunting for it.
function fabHTML() {
  return state.planAdding ? "" : `
    <button class="fab" type="button" data-plan="add-open" aria-label="Add something to today">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
    </button>`;
}

// When the add form opens, bring it into view and put the cursor in it.
function focusAddForm() {
  if (!state.planAdding || state.planAddFocused) return;
  state.planAddFocused = true;
  const input = document.getElementById("new-title");
  if (!input) return;
  input.focus({ preventScroll: true });
  input.closest("form").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

// The three things under your list. Each opens by itself, so a button only ever does one thing.
function moreLinkHTML() {
  const toggle = (action, label, open) =>
    `<button class="link-btn link-btn--quiet${open ? " link-btn--on" : ""}" type="button" data-plan="${action}" aria-expanded="${open ? "true" : "false"}">${label}</button>`;
  return `
    <div class="today-links">
      ${toggle(state.planMore ? "less" : "more", "Day timeline", state.planMore)}
      ${toggle(state.planReminders ? "reminders-hide" : "reminders", "Reminders", state.planReminders)}
      <button class="link-btn link-btn--quiet" type="button" data-plan="all-tasks">All tasks</button>
    </div>`;
}

// Everything that isn't "what do I do now", one tap away.
function moreHTML(proposal, busy, slots) {
  return `
    ${moreLinkHTML()}
    ${state.planMore ? `
    <section class="today-more" aria-label="Day timeline">
      <h2 class="section-title">Your day</h2>
      ${dayViewHTML(busy, slots)}
      ${spreadHTML()}
      ${extraTimeHTML(proposal)}
      ${scheduleHTML()}
    </section>` : ""}
    ${state.planReminders ? `<section class="today-more" aria-label="Reminders">${remindersCardHTML()}</section>` : ""}`;
}

// Every open task for today always shows up, whatever happened to the plan:
// - tasks in the plan keep their times
// - new tasks get a suggested time until you say yes
// - tasks that don't fit today go at the end, with no time
function allSlots(accepted, proposal) {
  const placed = liveSlots(accepted || proposal);
  const has = (list, task) => list.some(slot => slot.taskId === task.id);

  const suggested = accepted
    ? proposal.slots.filter(slot => !has(placed, { id: slot.taskId })).map(slot => Object.assign({ suggested: true }, slot))
    : [];
  const timed = placed.concat(suggested).sort((a, b) => a.start - b.start);

  const noTime = plannableTasks()
    .filter(task => !has(timed, task))
    .map(task => ({ taskId: task.id, start: null, end: null }));
  return timed.concat(noTime);
}

// Right after you finish a task: rest, or keep the momentum going?
function breakCardHTML(slots) {
  const finished = state.justFinished ? findTask(state.justFinished) : null;
  if (!finished || (!finished.done && finished.sessions.length === 0)) return "";
  const nextSlot = slots.find(slot => !findTask(slot.taskId).done);
  const next = nextSlot ? findTask(nextSlot.taskId) : null;
  if (!next) return "";
  return `
    <section class="break-card" role="status">
      <div class="break-text">
        <h2 class="break-title">${ICONS.check} ${finished.done ? "" : "Today's part of "}${escapeHTML(finished.title)} is done.</h2>
        <p class="muted">Take a ${breakMinutes("short")}-minute break, or keep the momentum going?</p>
      </div>
      <div class="row-gap">
        <button class="btn btn--ghost" type="button" data-plan="take-break">Take a ${breakMinutes("short")}-min break</button>
        <button class="btn btn--primary" type="button" data-plan="start-next" data-id="${next.id}">${ICONS.play} Start ${escapeHTML(next.title)}</button>
        <button class="icon-btn" type="button" data-plan="break-close" aria-label="Close">${ICONS.x}</button>
      </div>
    </section>`;
}

function emptyPlanHTML() {
  // Nothing for today, but tasks are waiting? Offer them, soonest first.
  const waiting = tasks
    .filter(task => !task.done && task.type !== "idea" && bucketOf(task) !== "today")
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || byPriority(a, b));

  const dumpButtons = `
    <div class="row-gap">
      <button class="btn ${waiting.length ? "btn--ghost" : "btn--primary"}" type="button" data-plan="go-dump">Start a brain dump</button>
      <button class="btn btn--ghost" type="button" data-plan="add-open">+ Add a task</button>
    </div>`;

  if (waiting.length === 0) {
    return `
      <div class="empty">
        <h2 class="section-title">Nothing on today's list yet.</h2>
        <p class="muted">Dump what's on your mind and we'll build your plan from it.</p>
        ${dumpButtons}
      </div>`;
  }

  return `
    <div class="empty">
      <h2 class="section-title">Nothing has to happen today. Want to get ahead?</h2>
      <p class="muted">Pick what to work on, and we'll build your plan around it.</p>
      <ul class="unfit-list">
        ${waiting.slice(0, 6).map(task => `
          <li>
            <span>${escapeHTML(task.title)}${task.dueDate ? " · due " + lowerDay(friendlyDate(task.dueDate)) : ""}${task.minutes ? " · " + formatMinutes(task.minutes) : ""}</span>
            <button class="btn btn--ghost btn--small" type="button" data-plan="to-today" data-id="${task.id}">Add to today</button>
          </li>`).join("")}
      </ul>
      ${waiting.length > 1 ? `<button class="btn btn--primary" type="button" data-plan="all-to-today">Add ${waiting.length > 6 ? "all " + waiting.length : "them all"} to today</button>` : ""}
      ${dumpButtons}
    </div>`;
}

// "3 tasks · 2 hours 10 min of work · done by about 8:40 pm"
function summaryHTML(slots) {
  const open = slots.filter(slot => !findTask(slot.taskId).done);
  const doneCount = slots.length - open.length;
  if (slots.length === 0) return "";
  if (open.length === 0) {
    return `<p class="plan-summary"><strong>All ${plural(slots.length, "task")} done.</strong> The rest of your day is yours.</p>`;
  }
  const timed = open.filter(slot => slot.start !== null);
  if (timed.length === 0) {
    return `<p class="plan-summary"><strong>${plural(open.length, "task")} left</strong> <span class="dot-sep">·</span> your day ends at ${clockLabel(toMinutes(day.end))}, so these are extra</p>`;
  }
  const work = timed.reduce((sum, slot) => sum + workMinutes(slot), 0);
  const finish = timed[timed.length - 1].end;
  return `
    <p class="plan-summary">
      <strong>${plural(open.length, "task")} left</strong>
      <span class="dot-sep">·</span> ${formatMinutes(work)} of work
      <span class="dot-sep">·</span> done by about <strong>${clockLabel(finish)}</strong>
      ${doneCount ? `<span class="dot-sep">·</span> ${doneCount} already done` : ""}
    </p>`;
}

// Something with a set time starting within 45 minutes (or happening now)
// comes first: you can't start homework if class is in 10 minutes.
function eventSoonHTML(busy, slots) {
  const now = nowMinutes();
  const soon = busy.find(block => block.end > now && block.start <= now + 45
    && !(block.taskId && findTask(block.taskId).done));
  if (!soon) return "";

  const task = soon.taskId ? findTask(soon.taskId) : null;
  const minutesAway = soon.start - now;
  const when = minutesAway <= 0 ? "Happening now" : minutesAway === 1 ? "Starts in 1 min" : `Starts in ${minutesAway} min`;
  const after = slots.find(slot => slot.start >= soon.end && !findTask(slot.taskId).done);

  return `
    <section class="next-card next-card--event" aria-label="Coming up">
      <div class="next-text">
        <span class="eyebrow">${when}</span>
        <h2 class="next-title">${escapeHTML(soon.label)}</h2>
        <span class="next-detail">${clockLabel(soon.start)} – ${clockLabel(soon.end)}</span>
        ${after ? `<span class="why"><strong>After that:</strong> ${escapeHTML(findTask(after.taskId).title)} at ${clockLabel(after.start)}</span>` : ""}
      </div>
      ${task ? `
        <div class="next-actions">
          <button class="btn btn--ghost" type="button" data-plan="task-done" data-id="${task.id}">${ICONS.check} Mark done</button>
        </div>` : ""}
    </section>`;
}

function nextStepHTML(slots) {
  const nextSlot = slots.find(slot => !findTask(slot.taskId).done);
  const task = nextSlot ? findTask(nextSlot.taskId) : null;

  if (!task) {
    if (slots.length === 0) return "";
    return `
      <section class="next-card next-card--done">
        <span class="eyebrow">Your next step</span>
        <h2 class="next-title">Nothing left for today.</h2>
        <p class="muted">Rest counts too. See what you got done on the Progress page.</p>
      </section>`;
  }

  const step = nextStepOf(task);
  const doneSteps = task.steps.filter(s => s.done).length;
  const stepBar = task.steps.length ? `
    <div class="mini-steps" aria-label="${doneSteps} of ${task.steps.length} steps done">
      ${task.steps.map(s => `<span class="${s.done ? "on" : s === step ? "now" : ""}"></span>`).join("")}
    </div>` : "";

  // The next session that hasn't happened yet (sessions you split yourself
  // tick off; planned ones just pass).
  const now = nowMinutes();
  const chunks = nextSlot.start !== null ? chunksOf(nextSlot) : [];
  const chunk = (step && chunks.find(c => c.stepId === step.id)) || chunks.find(c => c.end > now) || chunks[0];
  const chunkNum = chunk ? chunks.indexOf(chunk) + 1 : 0;
  let detail = "";
  if (step && step.session) detail = `${escapeHTML(step.text)}${step.minutes ? " · " + formatMinutes(step.minutes) : ""}, then a break`;
  else if (step) detail = `Step ${task.steps.indexOf(step) + 1} of ${task.steps.length} in ${escapeHTML(task.title)}${step.minutes ? " · about " + formatMinutes(step.minutes) : ""}`;
  else if (chunks.length > 1) detail = `Session ${chunkNum} of ${chunks.length} · ${formatMinutes(chunk.end - chunk.start)}, then a break`;

  return `
    <section class="next-card" aria-label="Your next step" ${subjectColour(task.subject) ? `style="--subj: ${subjectColour(task.subject)}"` : ""}>
      <div class="next-text">
        <span class="eyebrow">Do this next${chunk ? " · " + clockLabel(chunk.start) : ""}</span>
        <div class="next-tags">
          ${subjectTagHTML(task.subject)}
          ${noteButtonHTML(task)}
          ${chunk ? `<a class="cal-pill cal-link" href="${calendarLink(task.title, (detail ? detail.replace(/<[^>]+>/g, "") + ". " : "") + (task.notes || ""), chunk.start, chunk.end)}" target="_blank" rel="noopener noreferrer">${CAL_ICON} Add to calendar</a>` : ""}
        </div>
        <h2 class="next-title">${escapeHTML(step && !step.session ? step.text : task.title)}</h2>
        ${detail ? `<span class="next-detail">${detail}</span>` : ""}
        ${stepBar}
        ${noteBlockHTML(task)}
        <span class="why"><strong>Why first:</strong> ${escapeHTML(reasonFor(task))}</span>
      </div>
      <div class="next-actions">
        <button class="btn btn--primary btn--big" type="button" data-plan="focus" data-id="${task.id}">${ICONS.play} Start in focus mode</button>
        <button class="btn btn--ghost" type="button" data-plan="${step ? "step-done" : "task-done"}" data-id="${task.id}" ${step ? `data-step="${step.id}"` : ""}>${ICONS.check} Mark ${step ? (step.session ? "session" : "step") : task.sessions.length ? "today's part" : "task"} done</button>
      </div>
    </section>`;
}

// "This is big. Want to spread it out?"
function spreadHTML() {
  const suggestions = spreadSuggestions();
  if (suggestions.length === 0) return "";
  return suggestions.map(({ task, parts }) => `
    <section class="ask-card" aria-label="Spread out ${escapeHTML(task.title)}">
      <h2 class="ask-title">Start ${escapeHTML(task.title)} early?</h2>
      <p class="muted">It's about ${formatMinutes(task.minutes)} and due ${lowerDay(friendlyDate(task.dueDate))}. You could spread it out like this:</p>
      <div class="chips spread-parts">
        ${parts.map(part => `<span class="chip">${friendlyDate(part.date)}: ${formatMinutes(part.minutes)}</span>`).join("")}
      </div>
      <div class="row-gap">
        <button class="btn btn--primary" type="button" data-plan="spread-yes" data-id="${task.id}">Yes, spread it out</button>
        <button class="btn btn--ghost" type="button" data-plan="spread-no" data-id="${task.id}">Keep it on one day</button>
      </div>
    </section>`).join("");
}

// Tasks for today with no time estimate. A rough guess makes the plan real.
function estimatesHTML() {
  const missing = plannableTasks().filter(task => !task.minutes && !estSkip.includes(task.id));
  if (missing.length === 0) return "";
  const options = [[15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"], [120, "2 hours"]];
  return `
    <section class="ask-card ask-card--est" aria-labelledby="ask-title">
      <button class="est-close" type="button" data-plan="skip-estimates" aria-label="Close. I'll guess 30 minutes."><span aria-hidden="true">×</span></button>
      <h2 class="ask-title" id="ask-title">Roughly how long will ${missing.length === 1 ? "this" : "these"} take?</h2>
      <p class="muted">A guess is fine. Close this and we'll plan 30 minutes each.</p>
      <ul class="ask-list">
        ${missing.map(task => `
          <li class="ask-row">
            <span class="ask-task">${escapeHTML(task.title)}</span>
            <span class="choices">
              ${options.map(([n, label]) => `<button class="choice choice--small" type="button" data-plan="set-minutes" data-id="${task.id}" data-value="${n}">${label}</button>`).join("")}
              <form class="custom-inline" data-plan-form="custom-minutes" data-id="${task.id}">
                <label class="sr-only" for="est-${task.id}">Minutes for ${escapeHTML(task.title)}</label>
                <input class="input input--tiny" id="est-${task.id}" name="minutes" type="number" min="1" max="600" placeholder="min">
              </form>
            </span>
          </li>`).join("")}
      </ul>
    </section>`;
}

// "+ Add a task": a name and the same 3 questions as the review page.
function addTaskHTML() {
  const radio = (name, value, label, checked) => `
    <label class="chip-radio"><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}><span>${label}</span></label>`;
  return `
    <form class="add-task" data-plan-form="new-task">
      <label class="sr-only" for="new-title">What do you need to do?</label>
      <input class="input input--big" id="new-title" name="title" maxlength="120" placeholder="What do you need to do?" required autocomplete="off" value="${escapeHTML(state.newTaskDraft.title || "")}">
      <div class="subj-guess">
        <span class="q-label">Subject</span>
        <span id="new-subject-guess">${subjectGuessHTML(state.newTaskDraft.subject)}</span>
        <button class="link-btn link-btn--quiet" type="button" data-plan="subject-change" aria-expanded="false" aria-controls="new-subject-picker">Change</button>
      </div>
      <div id="new-subject-picker" hidden>
        ${subjectPickerHTML(state.newTaskDraft.subject, 'data-plan="new-subject"', "new-subject-input")}
      </div>
      <fieldset class="q-block">
        <legend class="q-label">How long will it take?</legend>
        <div class="choices">
          ${radio("minutes", 15, "15 min")}${radio("minutes", 30, "30 min")}${radio("minutes", 60, "1 hour")}${radio("minutes", 120, "2 hours")}
          <label class="sr-only" for="new-minutes">Custom minutes</label>
          <input class="input input--tiny" id="new-minutes" name="customMinutes" type="number" min="1" max="600" placeholder="min">
        </div>
      </fieldset>
      <fieldset class="q-block">
        <legend class="q-label">When is it due?</legend>
        <div class="choices">
          ${radio("due", "today", "Today", true)}${radio("due", "tomorrow", "Tomorrow")}${radio("due", "week", "This week")}${radio("due", "none", "No deadline")}
          <label class="sr-only" for="new-date">Pick a date</label>
          <input class="input input--date" id="new-date" name="date" type="date">
        </div>
      </fieldset>
      <label class="q-label" for="new-notes">Notes <span class="muted">(optional)</span></label>
      <textarea class="input note-text" id="new-notes" name="notes" rows="2" maxlength="1000" placeholder="Page numbers, what the teacher said, a link…"></textarea>
      <div class="row-gap">
        <button class="btn btn--primary" type="submit">Add</button>
        <button class="btn btn--ghost" type="button" data-plan="add-close">Cancel</button>
      </div>
    </form>`;
}

function proposalNoticeHTML() {
  return `
    <div class="notice">
      <p><strong>This is a suggestion.</strong> Nothing is set until you say so.</p>
      <button class="btn btn--primary" type="button" data-plan="accept">Use this plan</button>
    </div>`;
}

function acceptedNoticeHTML(accepted, proposal, missing) {
  if (state.planReplan) {
    const changes = planChanges(accepted, proposal);
    if (changes.length === 0) {
      return `
        <div class="notice">
          <p>Your plan already fits. Nothing needs to change.</p>
          <button class="btn btn--ghost" type="button" data-plan="replan-cancel">OK</button>
        </div>`;
    }
    return `
      <div class="notice notice--ask">
        <div>
          <p><strong>Here's what would change:</strong></p>
          <ul class="change-list">${changes.map(c => `<li>${escapeHTML(c)}</li>`).join("")}</ul>
        </div>
        <div class="row-gap">
          <button class="btn btn--primary" type="button" data-plan="accept">Apply changes</button>
          <button class="btn btn--ghost" type="button" data-plan="replan-cancel">Keep my plan</button>
        </div>
      </div>`;
  }
  if (missing.length > 0) {
    return `
      <div class="notice notice--ask">
        <p><strong>${plural(missing.length, "new task")} ${missing.length === 1 ? "isn't" : "aren't"} in your plan yet.</strong> Want to see where ${missing.length === 1 ? "it" : "they"} could go?</p>
        <button class="btn btn--primary" type="button" data-plan="replan">Show me</button>
      </div>`;
  }
  return `
    <div class="notice notice--quiet">
      <p>${ICONS.check} Plan locked in. We won't change it without asking.</p>
      <button class="btn btn--ghost btn--small" type="button" data-plan="replan">Re-plan my day</button>
    </div>`;
}

function unfitHTML(proposal) {
  const unfit = proposal.unfit.map(findTask).filter(task => task && !state.planKeepToday.includes(task.id));
  if (unfit.length === 0) return "";
  return `
    <ul class="unfit-strip" aria-label="Doesn't fit before ${clockLabel(toMinutes(day.end))}">
      ${unfit.map(task => `
        <li class="unfit-line">
          <span class="unfit-text"><strong>${escapeHTML(task.title)}</strong> doesn't fit before ${clockLabel(toMinutes(day.end))}</span>
          <button class="btn btn--primary btn--small" type="button" data-plan="to-tomorrow" data-id="${task.id}">Tomorrow</button>
          <button class="btn btn--ghost btn--small" type="button" data-plan="keep-today" data-id="${task.id}">Keep</button>
        </li>`).join("")}
    </ul>`;
}

// The numbered list. The numbers match the day view.
// Your evening in order: numbered tasks, with set-time things (class,
// visiting relatives) slotted in at their times.
function orderHTML(slots, busy, allPlanned) {
  const now = nowMinutes();
  const events = busy.filter(block => block.end > now);
  if (slots.length === 0 && events.length === 0) return "";
  const numberOf = slot => (allPlanned || slots).indexOf(slot);

  const rows = slots.map(slot => ({ start: slot.start === null ? 1e9 : slot.start, html: planRowHTML(slot, numberOf(slot)) }))
    .concat(events.map(block => ({ start: block.start, html: planEventRowHTML(block) })))
    .concat(slots.filter(slot => slot.breakAfter && !findTask(slot.taskId).done).map(slot => ({
      start: slot.end,
      html: `<li class="break-row">Break · ${formatMinutes(slot.breakAfter)}</li>`,
    })))
    .sort((a, b) => a.start - b.start);
  return `<ol class="order-list">${rows.map(row => row.html).join("")}</ol>`;
}

function planEventRowHTML(block) {
  const task = block.taskId ? findTask(block.taskId) : null;
  const done = task && task.done;
  return `
    <li class="order-row order-row--event ${done ? "order-row--done" : ""}">
      <span class="order-num order-num--event" aria-hidden="true">${ICONS.lock}</span>
      <div class="order-body">
        <span class="order-title">${escapeHTML(block.label)}</span>
        <span class="order-meta">${clockLabel(block.start)}–${clockLabel(block.end)} · ${block.kind === "fixed" ? "your schedule" : "set time"}</span>
      </div>
      ${task ? `
        <div class="order-actions">
          <button class="tick ${done ? "tick--on" : ""}" type="button" data-plan="${done ? "task-undo" : "task-done"}" data-id="${task.id}" aria-label="${done ? "Mark not done" : "Mark done"}: ${escapeHTML(task.title)}">${ICONS.check}</button>
        </div>` : ""}
    </li>`;
}

function slotTimeText(slot, task) {
  if (slot.start === null) return (minutesLeft(task) ? formatMinutes(minutesLeft(task)) + " · " : "") + "no time left today";
  const count = chunksOf(slot).length;
  const length = slot.guessed ? "30 min (guess)" : formatMinutes(workMinutes(slot));
  if (count > 1) return `${length} · from ${clockLabel(slot.start)}${slot.suggested ? " · suggested time" : ""}`;
  return `${clockLabel(slot.start)}–${clockLabel(slot.end)} · ${length}${slot.suggested ? " · suggested time" : ""}`;
}

function planRowHTML(slot, i) {
    const task = findTask(slot.taskId);
    const urgency = task.urgency && !task.done ? `<span class="pill pill--${task.urgency}">${capitalize(task.urgency)}</span>` : "";
    const colour = subjectColour(task.subject);
    return `
      <li class="order-row ${task.done ? "order-row--done" : ""} ${colour ? "order-row--subj" : ""}" ${colour ? `style="--subj: ${colour}"` : ""}>
        <span class="order-num" aria-hidden="true">${i + 1}</span>
        <div class="order-body">
          <div class="order-top">
            ${task.done ? `<span class="order-title">${escapeHTML(task.title)}</span>` : `
            <button class="order-title order-title-btn" type="button" data-plan="row-menu" data-id="${task.id}" aria-expanded="${state.rowMenu === task.id}">${escapeHTML(task.title)}${task.notes && task.notes.trim() ? `<span class="title-note" aria-label="has a note">${NOTE_ICON}</span>` : ""}</button>`}${urgency}
          </div>
          <span class="order-meta">${task.subject && colour ? `<span class="subj-name">${escapeHTML(task.subject)}</span> · ` : ""}${slotTimeText(slot, task)}</span>
          ${task.done || state.rowMenu !== task.id ? "" : `
            <div class="row-menu" role="group" aria-label="Options for ${escapeHTML(task.title)}">
              <button class="row-menu-btn" type="button" data-plan="focus" data-id="${task.id}">${ICONS.play} Focus</button>
              <button class="row-menu-btn" type="button" data-note="toggle" data-id="${task.id}">${NOTE_ICON} ${task.notes && task.notes.trim() ? "Edit note" : "Add note"}</button>
              <button class="row-menu-btn" type="button" data-plan="to-tomorrow" data-id="${task.id}">Move to tomorrow</button>
            </div>`}
          ${task.done ? "" : noteBlockHTML(task)}
          ${task.done ? "" : stepsHTML(task, slot)}
        </div>
        <div class="order-actions">
          <button class="tick ${task.done ? "tick--on" : ""}" type="button" data-plan="${task.done ? "task-undo" : "task-done"}" data-id="${task.id}" aria-label="${task.done ? "Mark not done" : "Mark done"}: ${escapeHTML(task.title)}">${ICONS.check}</button>
        </div>
      </li>`;
}

// Small steps inside a task in the order list.
function stepsHTML(task, slot) {
  const chunks = slot && slot.start !== null ? chunksOf(slot) : [];
  const chunkFor = step => chunks.find(c => c.stepId === step.id);
  const sessionSteps = task.steps.length > 0 && task.steps.every(step => step.session);

  // Sessions: one small chip per session with its start time. Tap to tick it off.
  let chips = [];
  if (sessionSteps) {
    chips = task.steps.map(step => ({ done: step.done, chunk: step.done ? null : chunkFor(step), step: step }));
  } else if (task.steps.length === 0 && chunks.length > 1) {
    chips = chunks.map((chunk, i) => ({ done: false, chunk: chunk, index: i }));
  }
  if (chips.length > 0) {
    const nextIndex = chips.findIndex(chip => !chip.done);
    const length = chips.find(chip => chip.chunk) ? chips.find(chip => chip.chunk).chunk : null;
    return `
      <div class="session-chips" role="list" aria-label="Sessions">
        ${chips.map((chip, i) => {
          const label = chip.done ? "Done" : chip.chunk ? clockLabel(chip.chunk.start) : "Later";
          const target = chip.step ? `data-step="${chip.step.id}"` : `data-index="${chip.index}"`;
          const classes = ["session-chip"];
          if (chip.done) classes.push("session-chip--done");
          if (i === nextIndex) classes.push("session-chip--next");
          return `<button class="${classes.join(" ")}" role="listitem" type="button" data-plan="${chip.done ? "step-undo" : "session-done"}" data-id="${task.id}" ${target} aria-label="Session ${i + 1}${chip.done ? ", done. Mark not done" : ", " + label + ". Mark done"}">
            <span class="session-dot">${chip.done ? ICONS.check : i + 1}</span>${label}
          </button>`;
        }).join("")}
      </div>
      ${state.sessionHintShown ? "" : (state.sessionHintShown = true, `<span class="session-note">${length ? formatMinutes(length.end - length.start) + " sessions" : "Short sessions"} with a break after each. Tap one when it's done.</span>`)}`;
  }

  const steps = task.steps.map(step => {
    const chunk = step.done ? null : chunkFor(step);
    return `
    <li class="step-row ${step.done ? "step-row--done" : ""}">
      <button class="tick tick--small ${step.done ? "tick--on" : ""}" type="button" data-plan="${step.done ? "step-undo" : "step-done"}" data-id="${task.id}" data-step="${step.id}" aria-label="${step.done ? "Mark not done" : "Mark done"}: ${escapeHTML(step.text)}">${ICONS.check}</button>
      <span class="step-text">${escapeHTML(step.text)}</span>
      ${chunk ? `<span class="step-min">${clockLabel(chunk.start)}</span>` : step.minutes ? `<span class="step-min">${step.minutes} min</span>` : ""}
      <button class="icon-btn" type="button" data-plan="step-remove" data-id="${task.id}" data-step="${step.id}" aria-label="Remove step: ${escapeHTML(step.text)}">${ICONS.x}</button>
    </li>`;
  }).join("");

  const addForm = state.planAddStepFor === task.id ? `
    <form class="add-step" data-plan-form="add-step" data-id="${task.id}">
      <label class="sr-only" for="step-text-${task.id}">New step</label>
      <input class="input" id="step-text-${task.id}" name="text" maxlength="80" placeholder="Next small step" required>
      <label class="sr-only" for="step-min-${task.id}">Minutes</label>
      <input class="input input--narrow" id="step-min-${task.id}" name="minutes" type="number" min="1" max="240" placeholder="min">
      <button class="btn btn--primary btn--small" type="submit">Add</button>
    </form>` : "";

  const actions = "";

  return `
    ${steps ? `<ul class="step-list">${steps}</ul>` : ""}
    ${addForm}
    <div class="row-gap">${actions}</div>`;
}

function remindersHTML(reminders) {
  if (reminders.length === 0) return "";
  return `
    <div class="reminders">
      <h3 class="done-heading">Don't forget</h3>
      <ul class="remind-list">
        ${reminders.map(task => `
          <li class="remind ${task.done ? "remind--done" : ""}">
            <button class="tick tick--small ${task.done ? "tick--on" : ""}" type="button" data-plan="${task.done ? "task-undo" : "task-done"}" data-id="${task.id}" aria-label="${task.done ? "Mark not done" : "Mark done"}: ${escapeHTML(task.title)}">${ICONS.check}</button>
            <span>${escapeHTML(task.title)}</span>
          </li>`).join("")}
      </ul>
    </div>`;
}

function extraTimeHTML(proposal) {
  if (proposal.unfit.length > 0 || proposal.freeLeft < 30) return "";
  const asking = spreadSuggestions().map(suggestion => suggestion.task);
  const soon = tasks.filter(task => bucketOf(task) === "upcoming" && task.type === "task" && !asking.includes(task)).sort(byPriority).slice(0, 3);
  if (soon.length === 0) return "";
  return `
    <div class="extra">
      <p class="muted">You'll have about ${formatMinutes(proposal.freeLeft)} free after this. Want to get ahead?</p>
      <ul class="unfit-list">
        ${soon.map(task => `
          <li>
            <span>${escapeHTML(task.title)}${task.dueDate ? " · due " + lowerDay(friendlyDate(task.dueDate)) : ""}</span>
            <button class="btn btn--ghost btn--small" type="button" data-plan="to-today" data-id="${task.id}">Add to today</button>
          </li>`).join("")}
      </ul>
    </div>`;
}

// A calendar-style picture of the day. Taller block = longer task.
function dayViewHTML(busy, slots) {
  const order = {};
  slots.forEach((slot, i) => { order[slot.taskId] = i + 1; });

  // Each session is its own block, with its break after it.
  const sessionBlocks = [];
  for (const slot of slots.filter(one => one.start !== null)) {
    const chunks = chunksOf(slot);
    const done = findTask(slot.taskId).done;
    chunks.forEach((chunk, i) => {
      sessionBlocks.push({ kind: "task", taskId: slot.taskId, start: chunk.start, end: chunk.end, part: chunks.length > 1 ? `${i + 1}/${chunks.length}` : "" });
      if (chunk.breakAfter && !done) sessionBlocks.push({ kind: "break", label: "Break", start: chunk.end, end: chunk.end + chunk.breakAfter });
    });
  }

  const blocks = busy.map(block => Object.assign({}, block))
    .concat(sessionBlocks)
    .concat(slots.filter(slot => slot.breakAfter && !findTask(slot.taskId).done).map(slot => ({
      kind: "break", label: "Break", start: slot.end, end: slot.end + slot.breakAfter,
    })));
  if (blocks.length === 0) return `<p class="muted">Nothing on the clock yet.</p>`;

  const now = nowMinutes();
  const firstStart = Math.min(...blocks.map(b => b.start));
  const lastEnd = Math.max(...blocks.map(b => b.end));
  const showNow = now >= firstStart - 120 && now <= lastEnd;
  const from = Math.floor(Math.min(firstStart, showNow ? now : firstStart) / 60) * 60;
  const to = Math.ceil(lastEnd / 60) * 60;
  const y = minutes => (minutes - from) * PX_PER_MINUTE;

  let hours = "";
  for (let h = from; h <= to; h += 60) {
    hours += `<div class="dv-hour" style="top: ${y(h)}px"><span>${clockLabel(h).replace(":00", "")}</span></div>`;
  }

  const blockHTML = blocks.map(block => {
    const task = block.taskId ? findTask(block.taskId) : null;
    const height = Math.max(26, (block.end - block.start) * PX_PER_MINUTE - 3);
    const short = height < 44;
    const classes = ["dv-block", "dv-block--" + block.kind];
    if (task && task.done) classes.push("dv-block--done");
    if (short) classes.push("dv-block--short");
    const title = task ? task.title : block.label;
    const colour = block.kind === "task" && task ? subjectColour(task.subject) : null;
    if (colour) classes.push("dv-block--subj");
    return `
      <div class="${classes.join(" ")}" style="top: ${y(block.start)}px; height: ${height}px${colour ? `; --subj: ${colour}` : ""}">
        ${block.kind === "task" ? `<span class="dv-num">${task && task.done ? ICONS.check : order[block.taskId]}</span>` : block.kind === "fixed" ? ICONS.lock : ""}
        <span class="dv-title">${escapeHTML(title)}${block.part ? ` <span class="dv-part">· ${block.part}</span>` : ""}</span>
        ${block.kind === "break" ? "" : `<span class="dv-time">${clockLabel(block.start)}–${clockLabel(block.end)}</span>`}
        ${block.kind === "task" && task && !task.done ? `<a class="dv-cal cal-link" href="${calendarLink(task.title, block.part ? "Session " + block.part + ". " + (task.notes || "") : (task.notes || ""), block.start, block.end)}" target="_blank" rel="noopener noreferrer" aria-label="Add ${escapeHTML(task.title)} to Google Calendar">${CAL_ICON}</a>` : ""}
      </div>`;
  }).join("");

  return `
    <div class="dayview" style="height: ${y(to) + 8}px" role="group" aria-label="Your day from ${clockLabel(from)} to ${clockLabel(to)}">
      ${hours}
      ${blockHTML}
      ${showNow ? `<div class="dv-now" style="top: ${y(now)}px"><span>Now</span></div>` : ""}
    </div>`;
}

function scheduleHTML() {
  const repeatNames = { daily: "Every day", weekdays: "Weekdays", once: "Today only" };
  const blocks = schedule.map(block => `
    <li class="sched-row">
      <span class="sched-time">${clockLabel(toMinutes(block.start))} – ${clockLabel(toMinutes(block.end))}</span>
      <span class="sched-label">${escapeHTML(block.label)}</span>
      <span class="muted small">${repeatNames[block.repeat]}</span>
      <button class="icon-btn" type="button" data-plan="sched-remove" data-id="${block.id}" aria-label="Remove ${escapeHTML(block.label)}">${ICONS.x}</button>
    </li>`).join("");

  return `
    <details class="sched" ${state.planScheduleOpen ? "open" : ""}>
      <summary>
        <span class="section-title">Your busy times</span>
        <span class="section-sub">${schedule.length ? plural(schedule.length, "block") + " · we plan around these" : "Add school, practice, dinner…"}</span>
      </summary>
      <div class="sched-body">
        ${blocks ? `<ul class="sched-list">${blocks}</ul>` : ""}
        <form class="sched-form" data-plan-form="sched-add">
          <label class="field"><span>What</span><input class="input" name="label" maxlength="40" placeholder="School" required></label>
          <label class="field"><span>From</span><input class="input" name="start" type="time" value="08:00" required></label>
          <label class="field"><span>To</span><input class="input" name="end" type="time" value="15:00" required></label>
          <label class="field"><span>Repeats</span>
            <select class="input" name="repeat">
              <option value="weekdays">Weekdays</option>
              <option value="daily">Every day</option>
              <option value="once">Today only</option>
            </select>
          </label>
          <button class="btn btn--primary" type="submit">Add</button>
        </form>
        <form class="sched-form sched-form--day" data-plan-form="day">
          <span class="muted">My day runs from</span>
          <label class="sr-only" for="day-start">Day starts</label>
          <input class="input" id="day-start" name="start" type="time" value="${day.start}">
          <span class="muted">to</span>
          <label class="sr-only" for="day-end">Day ends</label>
          <input class="input" id="day-end" name="end" type="time" value="${day.end}">
          <button class="btn btn--ghost btn--small" type="submit">Save</button>
        </form>
      </div>
    </details>`;
}


// ---------------------------------------------------------------
// Clicks and forms
// ---------------------------------------------------------------
planEl.addEventListener("click", event => {
  const button = event.target.closest("button[data-plan]");
  if (!button) return;
  const task = button.dataset.id ? findTask(button.dataset.id) : null;
  const step = task && button.dataset.step ? task.steps.find(s => s.id === button.dataset.step) : null;

  switch (button.dataset.plan) {
    case "accept":
      save(KEYS.plan, proposePlan());
      state.planReplan = false;
      toast("Plan locked in. You've got this.");
      break;
    case "replan": state.planReplan = true; break;
    case "replan-cancel": state.planReplan = false; break;
    case "focus": startFocusOn(task.id); return;
    case "task-done":
      state.justFinished = task.id;
      finishTodayPart(task, button);
      return;
    case "spread-yes":
      task.sessions = buildParts(task);
      saveTasks();
      toast(`Spread out over ${plural(task.sessions.length, "day")}.`, () => {
        task.sessions = [];
        saveTasks();
        render();
      });
      break;
    case "spread-no":
      task.spreadDeclined = true;
      saveTasks();
      break;
    case "task-undo": uncompleteTask(task); return;
    case "step-done":
      if (task.steps.filter(s => !s.done).length === 1) state.justFinished = task.id;
      completeStep(task, step, button);
      return;
    case "take-break":
      state.justFinished = null;
      startBreak();
      return;
    case "start-next":
      state.justFinished = null;
      startFocusOn(task.id, true);
      return;
    case "break-close": state.justFinished = null; break;
    case "step-undo": step.done = false; saveTasks(); break;
    case "step-remove":
      task.steps = task.steps.filter(s => s !== step);
      saveTasks();
      break;
    case "add-step": state.planAddStepFor = task.id; break;
    case "break": breakIntoSteps(task); return;
    case "session-done": {
      // Planned sessions become real ones the first time you tick one.
      if (!button.dataset.step) {
        if (!makeSessionSteps(task)) break;
        const picked = task.steps[Number(button.dataset.index)] || task.steps[0];
        completeStep(task, picked, button);
        return;
      }
      completeStep(task, step, button);
      return;
    }
    case "to-tomorrow":
      moveTask(task, "tomorrow");
      toast(`Moved “${task.title}” to tomorrow.`, () => { moveTask(task, "today"); render(); });
      break;
    case "keep-today": state.planKeepToday.push(task.id); break;
    case "to-today":
      moveTask(task, "today");
      toast(`Added “${task.title}” to today.`);
      break;
    case "sched-remove":
      schedule = schedule.filter(block => block.id !== button.dataset.id);
      saveSchedule();
      break;
    case "row-menu": state.rowMenu = state.rowMenu === task.id ? null : task.id; break;
    case "add-open": state.planAdding = true; state.planAddFocused = false; state.newTaskDraft = {}; break;
    case "subject-change": {
      const picker = document.getElementById("new-subject-picker");
      picker.hidden = !picker.hidden;
      button.setAttribute("aria-expanded", !picker.hidden);
      button.textContent = picker.hidden ? "Change" : "Done";
      return;
    }
    case "new-subject":
      // Switch the chips in place, so nothing else in the form is lost.
      state.newTaskDraft.subject = button.dataset.value || null;
      document.getElementById("new-subject-guess").innerHTML = subjectGuessHTML(state.newTaskDraft.subject);
      button.closest(".subj-picker").querySelectorAll("[data-plan=new-subject]").forEach(chip => {
        const on = chip === button;
        chip.classList.toggle("choice--on", on);
        chip.setAttribute("aria-pressed", on);
      });
      return;
    case "add-close": state.planAdding = false; break;
    case "skip-estimates":
      plannableTasks().filter(one => !one.minutes).forEach(one => { if (!estSkip.includes(one.id)) estSkip.push(one.id); });
      saveEstSkip();
      break;
    case "set-minutes":
      task.minutes = Number(button.dataset.value);
      saveTasks();
      break;
    case "all-to-today":
      tasks.filter(one => !one.done && one.type !== "idea" && bucketOf(one) !== "today").forEach(one => moveTask(one, "today"));
      toast("Added to today.");
      break;
    case "go-dump": goTo("dump"); return;
    case "more": state.planMore = true; break;
    case "less": state.planMore = false; break;
    case "reminders": state.planReminders = true; break;
    case "reminders-hide": state.planReminders = false; break;
    case "all-tasks": goTo("tasks"); return;
    case "setup-add": {
      const n = document.querySelectorAll(".setup-row--custom").length;
      const id = "setup-custom-" + n + "-" + Date.now();
      const row = document.createElement("li");
      row.className = "setup-row setup-row--custom";
      row.dataset.label = "";
      row.innerHTML = `
        <input type="checkbox" checked hidden aria-hidden="true">
        <label class="sr-only" for="${id}">What is it?</label>
        <input class="input setup-name" id="${id}" name="label" maxlength="40" placeholder="What? e.g. Piano class" autocomplete="off">
        <span class="setup-times">
          <label class="sr-only" for="${id}-start">Starts</label>
          <input class="input input--time" id="${id}-start" name="start" type="time" value="16:00">
          <span class="muted">to</span>
          <label class="sr-only" for="${id}-end">Ends</label>
          <input class="input input--time" id="${id}-end" name="end" type="time" value="17:00">
        </span>
        <span class="setup-repeat">
          <label class="sr-only" for="${id}-repeat">Repeats</label>
          <select class="input" id="${id}-repeat" name="repeat">
            <option value="weekdays">Weekdays</option>
            <option value="daily">Every day</option>
            <option value="once">Today only</option>
          </select>
          <button class="icon-btn" type="button" data-plan="setup-remove" aria-label="Remove this">${ICONS.x}</button>
        </span>`;
      button.closest(".setup-add-row").before(row);
      row.querySelector(".setup-name").focus();
      return;
    }
    case "setup-remove":
      button.closest(".setup-row").remove();
      return;
    case "setup-skip": finishSetup(); toast("No problem. You can add these later under Day timeline."); break;
  }
  render();
});

// Remember whether "Your fixed schedule" is open between redraws.
planEl.addEventListener("toggle", event => {
  if (event.target.matches(".sched")) state.planScheduleOpen = event.target.open;
}, true);

planEl.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;

  switch (form.dataset.planForm) {
    case "new-task": {
      const today = todayISO();
      const notes = form.elements.notes ? form.elements.notes.value.trim() : "";
      const typedSubject = form.querySelector("[data-new-subject]").value.trim();
      const custom = Math.round(Number(form.elements.customMinutes.value));
      const picked = form.querySelector("input[name=minutes]:checked");
      const due = form.querySelector("input[name=due]:checked").value;
      const urgency = form.querySelector("input[name=urgency]:checked");
      const date = form.elements.date.value;

      const dueDates = { today: today, tomorrow: addDays(today, 1), week: resolveWhen("this week", today), none: null };
      const dueDate = date || dueDates[due];
      const task = upgradeTask({
        id: makeId(),
        type: "task",
        title: form.elements.title.value.trim(),
        category: "Personal",
        when: dueDate ? friendlyDate(dueDate) : null,
        noDeadline: !dueDate,
        minutes: custom > 0 ? custom : picked ? Number(picked.value) : null,
        urgency: urgency ? urgency.value : null,
        dueDate: dueDate,
        planDate: dueDate ? null : today, // no deadline: you added it here, so it's for today
        createdAt: today,
        subject: typedSubject ? addSubject(typedSubject)
          : state.newTaskDraft.subject !== undefined ? state.newTaskDraft.subject : guessSubject(form.elements.title.value),
        notes: notes,
      });
      state.newTaskDraft = {};
      if (task.subject) learnSubject(task.title, task.subject);
      tasks.push(task);
      saveTasks();
      state.planAdding = false;
      toast(bucketOf(task) === "today"
        ? `Added “${task.title}” to today.`
        : `Added “${task.title}”. It's due ${lowerDay(friendlyDate(task.dueDate))}, so it's in Upcoming for now.`);
      break;
    }
    case "custom-minutes": {
      const minutes = Math.round(Number(form.elements.minutes.value));
      if (minutes > 0) {
        findTask(form.dataset.id).minutes = minutes;
        saveTasks();
      }
      break;
    }
    case "add-step": {
      const task = findTask(form.dataset.id);
      const minutes = Number(form.elements.minutes.value);
      task.steps.push({ id: makeId(), text: form.elements.text.value.trim(), minutes: minutes > 0 ? minutes : null, done: false });
      saveTasks();
      break;
    }
    case "sched-add": {
      const start = form.elements.start.value;
      const end = form.elements.end.value;
      if (toMinutes(end) <= toMinutes(start)) {
        toast("The end time needs to be after the start time.");
        return;
      }
      schedule.push({
        id: makeId(),
        label: form.elements.label.value.trim(),
        start: start,
        end: end,
        repeat: form.elements.repeat.value,
        date: todayISO(),
      });
      saveSchedule();
      toast("Added to your schedule.");
      break;
    }
    case "setup": {
      const picked = [...form.querySelectorAll(".setup-row[data-label]")].filter(row => row.querySelector("input[type=checkbox]").checked);
      for (const row of picked) {
        const start = row.querySelector("[name=start]").value, end = row.querySelector("[name=end]").value;
        const typed = row.querySelector("[name=label]");
        const label = typed ? typed.value.trim() : row.dataset.label;
        const repeat = row.querySelector("[name=repeat]") ? row.querySelector("[name=repeat]").value : row.dataset.repeat;
        if (!label || !start || !end || toMinutes(end) <= toMinutes(start)) continue;
        schedule.push({ id: makeId(), label: label.slice(0, 40), start: start, end: end, repeat: repeat, date: todayISO() });
      }
      saveSchedule();
      const dayEnd = form.elements.dayEnd.value;
      if (dayEnd && toMinutes(dayEnd) > toMinutes(day.start)) { day.end = dayEnd; saveDay(); }
      finishSetup();
      toast(picked.length ? "Got it. Your plan works around these now." : "Saved.");
      break;
    }
    case "day": {
      if (toMinutes(form.elements.end.value) <= toMinutes(form.elements.start.value)) {
        toast("Your day needs to end after it starts.");
        return;
      }
      day = { start: form.elements.start.value, end: form.elements.end.value };
      saveDay();
      toast("Saved.");
      break;
    }
  }
  render();
});

// Splits a big task into equal focus sessions. We don't decide what you do
// in each one (read, skim, write...). That's yours to choose.
function makeSessionSteps(task) {
  const lengths = sessionLengths(minutesLeft(task) || 30);
  if (lengths.length < 2) return false;
  task.steps = lengths.map((minutes, i) => ({
    id: makeId(), text: `Session ${i + 1} of ${lengths.length}`, minutes: minutes, done: false, session: true,
  }));
  saveTasks();
  return true;
}

function breakIntoSteps(task) {
  const lengths = sessionLengths(minutesLeft(task) || 0);
  if (lengths.length < 2) {
    toast("That's short enough to do in one go.");
    render();
    return;
  }
  task.steps = lengths.map((minutes, i) => ({
    id: makeId(),
    text: `Session ${i + 1} of ${lengths.length}`,
    minutes: minutes,
    done: false,
    session: true,
  }));
  saveTasks();
  toast(`Split into ${lengths.length} sessions, with a break after each.`, () => {
    task.steps = [];
    saveTasks();
    render();
  });
  render();
}


// ---------------------------------------------------------------
// One-time setup: "When are you usually busy?" Asked once, then the plan
// works around it. It can be changed later under "Day timeline".
// ---------------------------------------------------------------
const SETUP_ROWS = [
  { label: "School", start: "08:00", end: "15:00", repeat: "weekdays", on: true },
  { label: "Tuition", start: "17:00", end: "18:30", repeat: "weekdays", on: false },
  { label: "Sport practice", start: "16:00", end: "17:30", repeat: "weekdays", on: false },
  { label: "Dinner", start: "20:00", end: "20:45", repeat: "daily", on: true },
];

function needsSetup() {
  return !load(KEYS.setup, false) && schedule.length === 0;
}

function finishSetup() {
  save(KEYS.setup, true);
}

function setupHTML() {
  return `
    <form class="setup" data-plan-form="setup">
      <div>
        <h2 class="section-title">When are you usually busy?</h2>
        <p class="muted">Tick what fits and fix the times. Your plan will work around them. You only do this once.</p>
      </div>
      <ul class="setup-list">
        ${SETUP_ROWS.map((row, i) => `
          <li class="setup-row" data-label="${row.label}" data-repeat="${row.repeat}">
            <label class="setup-check"><input type="checkbox" id="setup-${i}" ${row.on ? "checked" : ""}><span>${row.label}</span></label>
            <span class="setup-times">
              <label class="sr-only" for="setup-${i}-start">${row.label} starts</label>
              <input class="input input--time" id="setup-${i}-start" name="start" type="time" value="${row.start}">
              <span class="muted">to</span>
              <label class="sr-only" for="setup-${i}-end">${row.label} ends</label>
              <input class="input input--time" id="setup-${i}-end" name="end" type="time" value="${row.end}">
            </span>
          </li>`).join("")}
        <li class="setup-add-row">
          <button class="btn btn--ghost btn--small setup-add" type="button" data-plan="setup-add">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
            Add something else
          </button>
        </li>
        <li class="setup-row setup-row--end">
          <label class="setup-check" for="setup-day-end"><span>I stop for the day at</span></label>
          <input class="input input--time" id="setup-day-end" name="dayEnd" type="time" value="${day.end}">
        </li>
      </ul>
      <div class="row-gap">
        <button class="btn btn--primary" type="submit">Done</button>
        <button class="btn btn--ghost" type="button" data-plan="setup-skip">Skip for now</button>
      </div>
    </form>`;
}


// The add form shows the subject it guessed from the name as you type.
function subjectGuessHTML(subject) {
  return subjectColour(subject) ? subjectTagHTML(subject) : '<span class="subj subj--none">None</span>';
}

planEl.addEventListener("input", event => {
  if (event.target.id !== "new-title") return;
  state.newTaskDraft.title = event.target.value;
  if (state.newTaskDraft.subject !== undefined) return; // you picked one yourself
  const guess = guessSubject(event.target.value);
  document.getElementById("new-subject-guess").innerHTML = subjectGuessHTML(guess);
});
