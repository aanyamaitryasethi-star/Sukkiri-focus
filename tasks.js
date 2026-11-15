// tasks.js: page 5, a home for all your saved tasks.
// Four lists: Today, Upcoming, Someday and Done.

state.tasksTab = "today";

const tasksEl = document.getElementById("tasks-content");
const TABS = [
  { id: "today", name: "Today", empty: "Nothing for today. Enjoy it, or pull something in from Upcoming." },
  { id: "upcoming", name: "Upcoming", empty: "Nothing coming up yet." },
  { id: "someday", name: "Someday", empty: "Ideas and no-deadline tasks will wait here, no pressure." },
  { id: "done", name: "Done", empty: "Finished tasks show up here." },
];

function tasksIn(tab) {
  const list = tasks.filter(task => bucketOf(task) === tab);
  if (tab === "done") return list.sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  if (tab === "upcoming") return list.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || byPriority(a, b));
  return list.sort(byPriority);
}

function renderTasks() {
  const current = TABS.find(tab => tab.id === state.tasksTab);
  const list = tasksIn(current.id);

  tasksEl.innerHTML = `
    <div class="tabs" role="tablist" aria-label="Task lists">
      ${TABS.map(tab => `
        <button class="tab ${tab.id === current.id ? "tab--on" : ""}" type="button" role="tab" aria-selected="${tab.id === current.id}" data-tasks="tab" data-value="${tab.id}">
          ${tab.name}<span class="tab-count">${tasksIn(tab.id).length}</span>
        </button>`).join("")}
    </div>

    ${current.id === "done" ? "" : `
      <form class="quick-add" data-tasks-form="add">
        <label class="sr-only" for="quick-add">Add a task to ${current.name}</label>
        <input class="input" id="quick-add" name="text" maxlength="120" placeholder="Add a task to ${current.name}…" autocomplete="off">
        <button class="btn btn--primary" type="submit">Add</button>
      </form>`}

    ${list.length === 0
      ? `<p class="empty-line">${current.empty}</p>`
      : `<ul class="task-list">${list.map(taskRowHTML).join("")}</ul>`}`;
}

function taskRowHTML(task) {
  const meta = [];
  if (task.done && task.doneAt) meta.push("Done " + friendlyDate(isoDate(new Date(task.doneAt))).replace(/^(Today|Yesterday)$/, word => word.toLowerCase()));
  else if (isCarriedOver(task)) meta.push(`<span class="carried">From ${friendlyDate(carriedFrom(task))}</span>`);
  else if (task.dueDate) meta.push((task.type === "task" ? "Due " : "") + friendlyDate(task.dueDate));
  else if (task.when) meta.push(escapeHTML(task.when));
  if (hasSetTime(task) && task.dueDate) meta.push(escapeHTML(task.when));
  if (task.minutes) meta.push(formatMinutes(task.minutes));
  if (task.steps.length) meta.push(`${task.steps.filter(s => s.done).length}/${task.steps.length} steps`);
  if (task.sessions.length && !task.done) {
    const next = task.sessions.find(part => !part.done);
    if (next) meta.push(`Part ${task.sessions.indexOf(next) + 1} of ${task.sessions.length}: ${lowerDay(friendlyDate(next.date))}`);
  }
  if (!subjectColour(task.subject)) meta.push(task.category);

  const urgency = task.urgency && !task.done ? `<span class="pill pill--${task.urgency}">${capitalize(task.urgency)}</span>` : "";
  const bucket = bucketOf(task);
  const moveOptions = [["today", "Today"], ["upcoming", "Upcoming"], ["someday", "Someday"]]
    .map(([value, name]) => `<option value="${value}" ${bucket === value ? "selected" : ""}>${name}</option>`).join("");

  return `
    <li class="task-row ${task.done ? "task-row--done" : ""}" data-id="${task.id}">
      <button class="tick ${task.done ? "tick--on" : ""}" type="button" data-tasks="${task.done ? "undo" : "done"}" aria-label="${task.done ? "Mark not done" : "Mark done"}: ${escapeHTML(task.title)}">${ICONS.check}</button>
      <div class="task-body">
        <span class="task-title">${escapeHTML(task.title)} ${urgency}</span>
        <span class="task-meta">${subjectTagHTML(task.subject)}${meta.join(" · ")}</span>
        ${task.done ? "" : noteBlockHTML(task)}
      </div>
      <div class="task-actions">
        ${task.done ? "" : `
          ${noteButtonHTML(task)}
          ${task.type !== "idea" ? `<button class="btn btn--ghost btn--small" type="button" data-tasks="focus">Focus</button>` : ""}
          <label class="sr-only" for="move-${task.id}">Move ${escapeHTML(task.title)}</label>
          <select class="input input--small" id="move-${task.id}" data-tasks="move">${moveOptions}</select>`}
        <button class="icon-btn" type="button" data-tasks="delete" aria-label="Delete ${escapeHTML(task.title)}">${ICONS.trash}</button>
      </div>
    </li>`;
}

tasksEl.addEventListener("click", event => {
  const button = event.target.closest("button[data-tasks]");
  if (!button) return;
  const row = button.closest(".task-row");
  const task = row ? findTask(row.dataset.id) : null;

  switch (button.dataset.tasks) {
    case "tab": state.tasksTab = button.dataset.value; break;
    case "done": completeTask(task, button); return;
    case "undo": uncompleteTask(task); return;
    case "focus": startFocusOn(task.id); return;
    case "delete": {
      const index = tasks.indexOf(task);
      tasks.splice(index, 1);
      saveTasks();
      toast(`Deleted “${task.title}”.`, () => {
        tasks.splice(index, 0, task);
        saveTasks();
        render();
      });
      break;
    }
  }
  render();
});

tasksEl.addEventListener("change", event => {
  if (event.target.dataset.tasks !== "move") return;
  const task = findTask(event.target.closest(".task-row").dataset.id);
  const before = { planDate: task.planDate, bucket: task.bucket, sessions: task.sessions };
  const names = { today: "Today", upcoming: "Upcoming", someday: "Someday" };
  moveTask(task, event.target.value);
  toast(`Moved “${task.title}” to ${names[event.target.value]}.`, () => {
    Object.assign(task, before);
    saveTasks();
    render();
  });
  render();
});

// Quick add: uses the same rules as the brain dump, so
// "bio quiz friday" gets a date.
tasksEl.addEventListener("submit", event => {
  event.preventDefault();
  const text = event.target.elements.text.value.trim();
  if (!text) return;

  const parsed = parseBrainDump(text)[0];
  const task = makeTask({
    id: makeId(),
    type: parsed ? parsed.type : "task",
    title: parsed ? parsed.title : text,
    category: parsed ? parsed.category : "Personal",
    subject: guessSubject(parsed ? parsed.title : text),
    when: parsed ? (parsed.deadline || parsed.time) : null,
    noDeadline: false,
    minutes: parsed ? parsed.minutes : null,
    urgency: null,
  });

  // No date written? Put it in the list you're looking at.
  if (!task.dueDate) {
    if (state.tasksTab === "today") task.planDate = todayISO();
    if (state.tasksTab === "upcoming") task.planDate = addDays(todayISO(), 1);
    if (state.tasksTab === "someday") task.bucket = "someday";
  }
  tasks.push(task);
  saveTasks();
  render();
  document.getElementById("quick-add").focus();
});
