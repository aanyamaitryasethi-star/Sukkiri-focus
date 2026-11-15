// reminders.js: getting nudged to start.
//
// A web page can't wake your phone when it's closed, so there are two kinds:
// - Nudges: while Sukkiri is open (even in another tab), it tells you when
//   it's time to start the next thing, with a soft chime.
// - Calendar alerts: one tap adds a daily check-in, or today's sessions, to
//   Google Calendar, so your phone reminds you even when Sukkiri is closed.

const reminderSettings = Object.assign({ nudge: true, checkin: "18:00" }, load(KEYS.reminders, {}));
function saveReminders() { save(KEYS.reminders, reminderSettings); }

const nudgedAt = {};          // task id -> when we last nudged about it
let checkinNudgedOn = null;   // the day the check-in nudge last went off
let plainTitle = document.title;

// Today's planned sessions that haven't happened yet, in order.
function upcomingSessions() {
  const now = nowMinutes();
  const list = [];
  for (const slot of proposePlan().slots) {
    const task = findTask(slot.taskId);
    if (!task || task.done) continue;
    const chunks = chunksOf(slot);
    chunks.forEach((chunk, i) => {
      if (chunk.end <= now) return;
      list.push({ task: task, start: chunk.start, end: chunk.end, part: chunks.length > 1 ? `Session ${i + 1} of ${chunks.length}` : "" });
    });
  }
  return list.sort((a, b) => a.start - b.start);
}

function checkReminders() {
  if (!reminderSettings.nudge) return;
  const now = nowMinutes();

  // The daily check-in
  if (reminderSettings.checkin && checkinNudgedOn !== todayISO() && Math.abs(now - toMinutes(reminderSettings.checkin)) <= 1) {
    checkinNudgedOn = todayISO();
    const left = tasksLeftToday().length;
    nudge(left ? `Check-in: ${plural(left, "thing")} left today` : "Check-in time", left ? "Here's what's next." : "Got anything on your mind? Do a quick brain dump.", null);
    return;
  }

  // Time to start the next thing? Not while a timer is already going,
  // and not more than once every 40 minutes for the same task.
  if (timerMode()) return;
  const next = upcomingSessions()[0];
  if (!next || next.start > now + 1) return;
  if (Date.now() - (nudgedAt[next.task.id] || 0) < 40 * 60000) return;
  nudgedAt[next.task.id] = Date.now();
  const length = formatMinutes(next.end - next.start);
  nudge(`Time for ${next.task.title}`, next.part ? `${next.part} · ${length}` : length, next.task.id);
}

function nudge(title, detail, taskId) {
  // Someone looking at Today already sees "Do this next", so stay quiet there.
  if (taskId && !document.hidden && state.page === "plan") return;

  playNotes([783.99, 1174.66], 0.16, 0.9, 0.08);
  showNudge(title, detail, taskId);
  if (document.hidden) document.title = "• " + title;
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body: detail || "", tag: "sukkiri" });
  } catch (error) {
    // Notifications aren't allowed here. The in-app nudge still shows.
  }
}

function showNudge(title, detail, taskId) {
  let box = document.getElementById("nudge");
  if (!box) {
    box = document.createElement("div");
    box.id = "nudge";
    box.className = "nudge";
    box.setAttribute("role", "alert");
    document.body.appendChild(box);
  }
  box.innerHTML = `
    <span class="nudge-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg></span>
    <span class="nudge-text"><strong>${escapeHTML(title)}</strong>${detail ? `<span>${escapeHTML(detail)}</span>` : ""}</span>
    ${taskId ? `<button class="btn btn--primary btn--small" type="button" data-nudge="start" data-id="${taskId}">Start</button>` : `<button class="btn btn--primary btn--small" type="button" data-nudge="open">Open</button>`}
    <button class="icon-btn" type="button" data-nudge="close" aria-label="Dismiss">${ICONS.x}</button>`;
  box.hidden = false;
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-nudge]");
  if (!button) return;
  document.getElementById("nudge").hidden = true;
  document.title = plainTitle;
  if (button.dataset.nudge === "start") startFocusOn(button.dataset.id, true);
  else if (button.dataset.nudge === "open") goTo(tasks.some(t => !t.done) ? "plan" : "dump");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) document.title = plainTitle;
});


// ---------------------------------------------------------------
// Calendar alerts through Google Calendar. Each link opens a ready-made
// event in a new tab; Google Calendar's own alert does the reminding.
// ---------------------------------------------------------------
function calendarLink(title, details, startMinutes, endMinutes, recur) {
  const date = todayISO().replace(/-/g, "");
  const time = minutes => String(Math.floor(minutes / 60) % 24).padStart(2, "0") + String(minutes % 60).padStart(2, "0") + "00";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${date}T${time(startMinutes)}/${date}T${time(Math.min(endMinutes, 23 * 60 + 59))}`,
    details: details,
  });
  try { params.set("ctz", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (error) { /* uses the calendar's own time zone */ }
  if (recur) params.set("recur", recur);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

const CAL_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>';

function remindersCardHTML() {
  const checkin = toMinutes(reminderSettings.checkin || "18:00");
  return `
    <section class="remind-card" id="reminders" aria-labelledby="remind-title">
      <h2 class="section-title" id="remind-title">Reminders</h2>

      <label class="remind-toggle" for="remind-nudge">
        <input type="checkbox" id="remind-nudge" data-remind="nudge" ${reminderSettings.nudge ? "checked" : ""}>
        <span><strong>Nudge me when it's time to start</strong><span class="muted">Works while Sukkiri is open, even in another tab.</span></span>
      </label>

      <div class="remind-block">
        <div class="remind-head">
          <strong>Daily check-in</strong>
          <span class="muted">A calendar alert every day, even when Sukkiri is closed.</span>
        </div>
        <div class="remind-row">
          <label class="sr-only" for="remind-checkin">Check-in time</label>
          <input class="input input--time" type="time" id="remind-checkin" data-remind="checkin" value="${reminderSettings.checkin || "18:00"}">
          <a class="btn btn--ghost btn--small cal-link" href="${calendarLink("Sukkiri check-in", "Open Sukkiri and see what's next.", checkin, checkin + 10, "RRULE:FREQ=DAILY")}" target="_blank" rel="noopener noreferrer">${CAL_ICON} Add to Google Calendar</a>
        </div>
      </div>

    </section>`;
}

document.addEventListener("change", event => {
  const input = event.target.closest("[data-remind]");
  if (!input) return;
  if (input.dataset.remind === "nudge") {
    reminderSettings.nudge = input.checked;
    saveReminders();
    // Where the browser allows it, nudges also show as system notifications.
    if (input.checked) {
      try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch (error) { /* not allowed here */ }
    }
    toast(input.checked ? "Nudges on." : "Nudges off.");
  } else if (input.dataset.remind === "checkin" && input.value) {
    reminderSettings.checkin = input.value;
    saveReminders();
    render();
  }
});

setInterval(checkReminders, 30000);
setTimeout(checkReminders, 4000);
