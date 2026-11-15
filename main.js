// main.js: switches between the pages and starts the app.
// It loads last, so every page's code is ready by now.

const PAGES = {
  dump: { section: "dump-page", nav: "nav-dump" },
  review: { section: "review-page", nav: "nav-dump", draw: () => renderReview() },
  plan: { section: "plan-page", nav: "nav-plan", draw: () => renderPlan() },
  focus: { section: "focus-page", nav: "nav-focus", draw: () => renderFocus() },
  tasks: { section: "tasks-page", nav: "nav-plan", draw: () => renderTasks() },
  strings: { section: "strings-page", nav: "nav-strings", draw: () => { renderSky(); renderProgress(); } },
};

function goTo(page) {
  state.page = page;
  render();
  window.scrollTo(0, 0);
  if (page === "dump") el.dumpInput.focus();
}

// Redraws whichever page is showing. Every click ends up here.
function render() {
  const current = PAGES[state.page];
  for (const page of Object.values(PAGES)) {
    document.getElementById(page.section).hidden = page !== current;
    const nav = document.getElementById(page.nav);
    nav.classList.toggle("step--active", page.nav === current.nav);
    if (page.nav === current.nav) nav.setAttribute("aria-current", "page");
    else nav.removeAttribute("aria-current");
  }

  if (current.draw) current.draw();
  updateTimerDisplay();
  saveTimer();
  updateStreakChip();
  updateSkyDot();
  startSky();
}

document.getElementById("nav-plan").addEventListener("click", () => goTo("plan"));
document.getElementById("nav-focus").addEventListener("click", () => goTo("focus"));
document.getElementById("tasks-back").addEventListener("click", () => goTo("plan"));
document.getElementById("nav-strings").addEventListener("click", () => goTo("strings"));
// If a brain dump is still waiting for review, go back to it.
document.getElementById("nav-dump").addEventListener("click", () => goTo(state.items.length > 0 ? "review" : "dump"));

// Browsers only allow sound after a click, so get it ready on every click.
document.addEventListener("pointerdown", unlockSound);

// Escape closes the string.
document.addEventListener("keydown", event => {
  if (event.key === "Escape") hideString();
});

// When the day changes while the app is open (past midnight), redraw.
let lastDay = todayISO();
setInterval(() => {
  if (todayISO() !== lastDay) {
    lastDay = todayISO();
    settleStreak();
    render();
  }
}, 60000);


// Start: bring back an unfinished brain dump. If you already have tasks
// open, start on your plan; otherwise start with a brain dump. A timer
// that was going picks up where it left off.
el.dumpInput.value = load(KEYS.draft, "");
updateDumpPage();
state.page = tasks.some(task => !task.done) && !el.dumpInput.value ? "plan" : "dump";
const timerGoing = restoreTimer();
if (timerGoing) state.page = "focus"; // a timer was going when the page reloaded
settleStreak();
render();
// First time here? A short intro to the sky comes first; the string waits.
if (!timerGoing && !showIntroIfNeeded()) stringOpening();
