// ui.js: small pieces every page uses: smart sorting, toasts,
// rewards and confetti, and finishing a task.

// ---------------------------------------------------------------
// Smart sorting.
//
// Where it's available, Sukkiri can use smart sorting for the brain
// dump. When it isn't
// available, like when you open index.html from your computer, the
// app still works without it.
// ---------------------------------------------------------------
const claudePromise = window.claude && window.claude.use
  ? window.claude.use("sample").catch(() => null)
  : Promise.resolve(null);

// Why smart sorting couldn't help last time.
let claudeProblem = null;

// Returns the answer as data, or null if it can't help right now.
async function askClaudeJSON(prompt, modelTier = "quick") {
  claudeProblem = null;
  const sample = await claudePromise;
  if (!sample) {
    claudeProblem = "unavailable";
    return null;
  }
  try {
    return await sample.json(prompt, { modelTier: modelTier });
  } catch (error) {
    claudeProblem = error.code || "upstream_error";
    return null;
  }
}


// ---------------------------------------------------------------
// Little helpers
// ---------------------------------------------------------------

// Stops typed text from being treated as HTML (so "<b>" shows as text).
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMinutes(minutes) {
  if (minutes < 60) return Math.round(minutes) + " min";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours + (hours === 1 ? " hour" : " hours") + (rest ? " " + rest + " min" : "");
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

const ICONS = {
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>',
  lock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>',
  trash: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"></path><path d="M10 11v6M14 11v6"></path><path d="M6 7l1 13h10l1-13"></path><path d="M9 7V4h6v3"></path></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  sparkle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"></path></svg>',
};


// ---------------------------------------------------------------
// Toasts: the little message at the bottom ("Math homework done. Undo")
// ---------------------------------------------------------------
let toastTimer = null;

function toast(message, undo) {
  const box = document.getElementById("toast");
  box.innerHTML = `<span>${escapeHTML(message)}</span>` +
    (undo ? `<button class="toast-undo" type="button">Undo</button>` : "");
  box.hidden = false;
  box.classList.remove("toast--show");
  void box.offsetWidth; // restart the slide-in animation
  box.classList.add("toast--show");

  if (undo) {
    box.querySelector(".toast-undo").onclick = () => {
      undo();
      box.hidden = true;
    };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, undo ? 6000 : 3500);
}


// ---------------------------------------------------------------
// Rewards. A small burst for one task, a full celebration when the day is done.
// ---------------------------------------------------------------
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CONFETTI_COLORS = ["#FFFFFF", "#DCE6FF", "#A9C8FF", "#7FA6FF", "#F5D892", "#EEF7EF"];  // starlight
let confettiPieces = [];
let confettiRunning = false;

// Adds confetti pieces. `angle` is the direction they fly (in degrees,
// -90 is straight up) and `spread` is how wide the spray is.
function confetti(x, y, count, speed, angle = -90, spread = 360) {
  if (reduceMotion) return;
  for (let i = 0; i < count; i++) {
    const direction = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
    const power = speed * (0.45 + Math.random() * 0.75);
    confettiPieces.push({
      x: x, y: y,
      vx: Math.cos(direction) * power,
      vy: Math.sin(direction) * power,
      size: 5 + Math.random() * 7,
      spin: Math.random() * 6,
      turn: (Math.random() - 0.5) * 0.35,
      shape: ["star", "circle", "star", "circle", "strip"][i % 5], // little stars and specks of light
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      life: 0,
      maxLife: 160 + Math.random() * 90,
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    requestAnimationFrame(drawConfetti);
  }
}

// Confetti falling from the top of the screen, like rain.
function confettiRain(count) {
  if (reduceMotion) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => confetti(Math.random() * window.innerWidth, -20, 1, 3, 90, 40), i * 18);
  }
}

function drawConfetti() {
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const p of confettiPieces) {
    p.vy += 0.22;   // gravity
    p.vx *= 0.985;  // air
    p.vy *= 0.985;
    p.x += p.vx + Math.sin(p.life / 9) * 0.6; // a little flutter
    p.y += p.vy;
    p.spin += p.turn;
    p.life++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.globalAlpha = Math.max(0, Math.min(1, (p.maxLife - p.life) / 40));
    ctx.fillStyle = p.color;
    if (p.shape === "cap") {
      // A graduation cap: a flat diamond on a small base, with a tassel.
      const s = p.size * 1.3;
      ctx.fillStyle = "#EEF7EF";
      ctx.fillRect(-s * 0.45, 0, s * 0.9, s * 0.45);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(0, -s * 0.5);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s * 0.5);
      ctx.fill();
      ctx.fillStyle = "#FFD66B";
      ctx.fillRect(s * 0.7, 0, s * 0.12, s * 0.7);
    } else if (p.shape === "pencil") {
      const s = p.size;
      ctx.fillStyle = "#FFD66B";
      ctx.fillRect(-s * 1.3, -s * 0.25, s * 2, s * 0.5);
      ctx.fillStyle = "#EEF7EF";
      ctx.beginPath();
      ctx.moveTo(s * 0.7, -s * 0.25);
      ctx.lineTo(s * 1.2, 0);
      ctx.lineTo(s * 0.7, s * 0.25);
      ctx.fill();
    } else if (p.shape === "star") {
      // A four-point sparkle
      const s2 = p.size * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -s2); ctx.quadraticCurveTo(0, 0, s2, 0); ctx.quadraticCurveTo(0, 0, 0, s2);
      ctx.quadraticCurveTo(0, 0, -s2, 0); ctx.quadraticCurveTo(0, 0, 0, -s2);
      ctx.fill();
    } else if (p.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "strip") {
      ctx.fillRect(-p.size / 8, -p.size, p.size / 4, p.size * 2);
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.spin * 2)) + 1);
    }
    ctx.restore();
  }

  confettiPieces = confettiPieces.filter(p => p.life < p.maxLife && p.y < canvas.height + 60);
  if (confettiPieces.length > 0) {
    requestAnimationFrame(drawConfetti);
  } else {
    confettiRunning = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}


// Sounds. Browsers only allow sound after you've clicked something,
// so main.js calls unlockSound() on your first click.
let audio = null;
function unlockSound() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch (error) {
    audio = null;
  }
}

// Plays notes one after another. Frequencies in Hz: 523 is a C.
function playNotes(notes, gap, length, volume = 0.18) {
  if (!audio) return;
  try {
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const at = audio.currentTime + i * gap;
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + length + 0.05);
    });
  } catch (error) {
    // No sound. That's fine.
  }
}


// Finishing a task: its name breaks into stardust that drifts up and fades,
// with one soft twinkle. Steps and sessions do the same.
function smallReward(fromElement) {
  playNotes([1318.5, 1760], 0.09, 0.6, 0.06);
  if (!fromElement || reduceMotion) return;
  const title = titleFor(fromElement);
  if (title) stardust(title);
}

// The words that belong to the tick you pressed.
function titleFor(button) {
  if (button.classList.contains("session-chip")) return button;
  const holder = button.closest(".order-row, .task-row, .next-card, .step-row, .remind, .card");
  if (!holder) return null;
  return holder.querySelector(".step-text, .order-title, .task-title, .next-title, .remind span, .card-title");
}

const dust = { canvas: null, pen: null, pieces: [], running: false };
const DUST_COLOURS = ["243, 251, 242", "243, 251, 242", "169, 200, 255", "220, 232, 255", "245, 216, 146"];

function stardust(el) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const style = getComputedStyle(el);
  const first = el.firstChild;
  let text = (first && first.nodeType === 3 ? first.textContent : el.textContent).trim();
  if (!text) return;
  if (style.textTransform === "uppercase") text = text.toUpperCase();

  // Draw the words off-screen exactly where they sit, then turn every lit
  // pixel into a speck of light.
  const w = Math.ceil(rect.width) + 4, h = Math.ceil(rect.height) + 4;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const c = off.getContext("2d");
  c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  c.textBaseline = "middle";
  c.fillStyle = "#FFFFFF";
  const measured = c.measureText(text).width;
  const squeeze = measured > rect.width ? rect.width / measured : 1;
  c.save();
  c.translate(0, Math.min(h / 2, parseFloat(style.fontSize) * 0.7 + 2));
  c.scale(squeeze, 1);
  c.fillText(text, 0, 0);
  c.restore();
  const data = c.getImageData(0, 0, w, h).data;

  let lit = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 110) lit++;
  const step = Math.max(1, Math.round(Math.sqrt(lit / 1300)));
  const now = performance.now();
  const textWidth = Math.min(rect.width, measured * squeeze) || rect.width;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] <= 110) continue;
      dust.pieces.push({
        x: rect.left + x, y: rect.top + y,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(0.25 + Math.random() * 0.75),
        wobble: Math.random() * 6,
        start: now + (x / textWidth) * 380 + Math.random() * 140,   // dissolves left to right
        life: 900 + Math.random() * 800,
        size: 0.6 + Math.random() * 1.1,
        colour: DUST_COLOURS[Math.floor(Math.random() * DUST_COLOURS.length)],
      });
    }
  }
  // A few bigger sparkles rise out of it
  for (let i = 0; i < 7; i++) {
    dust.pieces.push({
      x: rect.left + Math.random() * textWidth, y: rect.top + rect.height / 2,
      vx: (Math.random() - 0.5) * 0.3, vy: -(0.9 + Math.random() * 0.8), wobble: Math.random() * 6,
      start: now + 150 + Math.random() * 400, life: 1300 + Math.random() * 500, size: 2.2, colour: "255, 255, 255", sparkle: true,
    });
  }
  el.style.transition = "opacity 0.25s";
  el.style.opacity = "0";
  if (!dust.running) { dust.running = true; requestAnimationFrame(drawDust); }
}

function drawDust(now) {
  if (!dust.canvas) {
    dust.canvas = document.createElement("canvas");
    dust.canvas.className = "stardust";
    dust.canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(dust.canvas);
    dust.pen = dust.canvas.getContext("2d");
  }
  const ratio = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  if (dust.canvas.width !== Math.round(W * ratio) || dust.canvas.height !== Math.round(H * ratio)) {
    dust.canvas.width = Math.round(W * ratio);
    dust.canvas.height = Math.round(H * ratio);
  }
  const pen = dust.pen;
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, W, H);
  pen.globalCompositeOperation = "lighter";

  dust.pieces = dust.pieces.filter(p => now < p.start + p.life);
  for (const p of dust.pieces) {
    const age = now - p.start;
    let x = p.x, y = p.y, alpha = 1;
    if (age > 0) {
      const f = age / 16;
      x += p.vx * f + Math.sin(age / 260 + p.wobble) * 2.2 * (age / p.life);
      y += p.vy * f - (age / p.life) * (age / p.life) * 18;
      alpha = 1 - age / p.life;
      alpha *= 0.75 + 0.25 * Math.sin(age / 70 + p.wobble);   // twinkle
    }
    if (p.sparkle) {
      if (age < 0) continue;
      const L = 7 * alpha + 2;
      pen.strokeStyle = `rgba(${p.colour}, ${alpha})`;
      pen.lineWidth = 1;
      pen.beginPath(); pen.moveTo(x - L, y); pen.lineTo(x + L, y); pen.moveTo(x, y - L); pen.lineTo(x, y + L); pen.stroke();
    }
    pen.fillStyle = `rgba(${p.colour}, ${0.18 * alpha})`;
    pen.beginPath(); pen.arc(x, y, p.size * 3, 0, Math.PI * 2); pen.fill();
    pen.fillStyle = `rgba(${p.colour}, ${alpha})`;
    pen.beginPath(); pen.arc(x, y, p.size, 0, Math.PI * 2); pen.fill();
  }
  pen.globalCompositeOperation = "source-over";
  if (dust.pieces.length) requestAnimationFrame(drawDust);
  else { dust.running = false; pen.clearRect(0, 0, W, H); }
}

// The big one: a flash, fireworks, confetti cannons, rain and a fanfare.
// It goes off when your string turns into your flame.
function fireworks() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const flash = document.getElementById("flash");
  flash.hidden = false;
  flash.classList.remove("flash--go");
  void flash.offsetWidth;
  flash.classList.add("flash--go");
  setTimeout(() => { flash.hidden = true; }, 900);

  // Two rounds of cannons from the bottom corners.
  for (const delay of [0, 900]) {
    setTimeout(() => {
      confetti(0, h, 150, 26, -58, 36);
      confetti(w, h, 150, 26, -122, 36);
    }, delay);
  }
  // Fireworks popping all over the top half of the screen.
  for (let i = 0; i < 7; i++) {
    setTimeout(() => confetti(w * (0.15 + Math.random() * 0.7), h * (0.12 + Math.random() * 0.35), 70, 11), 250 + i * 320);
  }
  setTimeout(() => confettiRain(260), 500);

  // A fanfare, then the end-of-school bell.
  playNotes([523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5], 0.12, 0.55, 0.17);
  setTimeout(() => playNotes([1318.5, 1046.5, 1318.5, 1046.5, 1318.5, 1046.5], 0.11, 0.35, 0.11), 1000);
}


// ---------------------------------------------------------------
// Finishing things. Every page uses these, so they live here.
// Mistakes are fine: every "done" can be undone.
// ---------------------------------------------------------------
// Tasks still open for today.
function openTodayTasks() {
  return tasks.filter(task => task.type !== "idea" && bucketOf(task) === "today");
}

// Tasks you finished today (any list).
function doneTodayTasks() {
  return tasks.filter(task => task.done && task.doneAt && isoDate(new Date(task.doneAt)) === todayISO());
}

// Parts of big tasks you finished today.
function partsDoneToday() {
  return tasks.reduce((sum, task) => sum + task.sessions.filter(part => part.doneOn === todayISO()).length, 0);
}

// The tasks that have to be finished before today counts as all done.
// Reminders and set-time things like "class at 9" don't hold it back.
function tasksLeftToday() {
  return openTodayTasks().filter(task => task.type === "task" && !hasSetTime(task));
}

function allTodayDone() {
  return tasksLeftToday().length === 0 && (doneTodayTasks().length > 0 || partsDoneToday() > 0);
}

// After finishing something: the string pops up. Finished everything?
// Everything done? That earns today's streak day right away. Tapping the flame is the celebration.
function afterFinishing() {
  if (allTodayDone()) {
    const newDay = streak.lastDate !== todayISO();
    earnStreakDay();
    setTimeout(() => stringFinal(newDay), 350);
  } else {
    setTimeout(stringAfterTask, 350);
  }
}

function completeTask(task, fromElement) {
  task.done = true;
  task.doneAt = new Date().toISOString();
  task.steps.forEach(step => { step.done = true; });
  saveTasks();
  smallReward(fromElement);

  afterFinishing();
  toast(pickCheer(task.title), () => {
    task.done = false;
    task.doneAt = null;
    saveTasks();
    undoStreakDayIfNeeded();
    render();
  });
  render();
}

// The tick on the plan: finishes the task, or just today's part of a big one.
function finishTodayPart(task, fromElement) {
  const parts = partsDueNow(task);
  if (parts.length === 0 || parts.length === task.sessions.filter(part => !part.done).length) {
    completeTask(task, fromElement);
    return;
  }
  parts.forEach(part => { part.done = true; part.doneOn = todayISO(); });
  saveTasks();
  smallReward(fromElement);
  afterFinishing();
  toast(`Today's part of ${task.title} is done.`, () => {
    parts.forEach(part => { part.done = false; part.doneOn = null; });
    saveTasks();
    undoStreakDayIfNeeded();
    render();
  });
  render();
}

function uncompleteTask(task) {
  task.done = false;
  task.doneAt = null;
  saveTasks();
  undoStreakDayIfNeeded();
  render();
}

function completeStep(task, step, fromElement) {
  step.done = true;
  if (task.steps.every(s => s.done)) {
    completeTask(task, fromElement);
    return;
  }
  saveTasks();
  smallReward(fromElement);
  toast(step.session ? step.text + " done. Take your break!" : "Step done: " + step.text, () => {
    step.done = false;
    saveTasks();
    render();
  });
  render();
}

const CHEERS = ["{t}: crushed.", "{t}? Handled.", "Nobody can ask you about {t} now.", "{t} is off your back.", "{t}: done before anyone even asked."];
function pickCheer(title) {
  return CHEERS[Math.floor(Math.random() * CHEERS.length)].replace("{t}", title);
}


// ---------------------------------------------------------------
// Subjects: a coloured tag, and a picker used when adding or reviewing.
// ---------------------------------------------------------------
function subjectColour(name) {
  const s = subjectNamed(name);
  return s ? s.colour : null;
}

function subjectTagHTML(name, extraAttrs = "") {
  const colour = subjectColour(name);
  if (!colour) return "";
  return `<span class="subj" style="--subj: ${colour}" ${extraAttrs}><i aria-hidden="true"></i>${escapeHTML(name)}</span>`;
}

// Chips for every subject plus "None" and a box to make a new one.
// `attr` is the data attribute the page listens for, e.g. 'data-action="subject"'.
function subjectPickerHTML(current, attr, inputId) {
  const chips = subjects.map(s => `
    <button class="choice choice--small subj-choice ${current === s.name ? "choice--on" : ""}" type="button" ${attr} data-value="${escapeHTML(s.name)}" style="--subj: ${s.colour}" aria-pressed="${current === s.name}"><i aria-hidden="true"></i>${escapeHTML(s.name)}</button>`).join("");
  return `
    <div class="subj-picker">
      ${chips}
      <button class="choice choice--small ${!current ? "choice--on" : ""}" type="button" ${attr} data-value="" aria-pressed="${!current}">None</button>
      <label class="sr-only" for="${inputId}">New subject</label>
      <input class="input input--tiny subj-new" id="${inputId}" maxlength="20" placeholder="+ New" data-new-subject>
    </div>`;
}


// ---------------------------------------------------------------
// Notes on a task: page numbers, the teacher's instructions, a link.
// One note can be open at a time; it saves as you type.
// ---------------------------------------------------------------
state.noteOpen = null;
const NOTE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"></path><path d="M15 4v4h4"></path><path d="M8.5 12.5h7M8.5 16h5"></path></svg>';

// Plain text in, safe HTML out, with web links you can tap.
function linkify(text) {
  return escapeHTML(text).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url.replace(/^https?:\/\//, "").slice(0, 40)}${url.length > 48 ? "…" : ""}</a>`);
}

function noteButtonHTML(task) {
  const has = task.notes && task.notes.trim();
  return `<button class="icon-btn note-btn ${has ? "note-btn--has" : ""}" type="button" data-note="toggle" data-id="${task.id}" aria-expanded="${state.noteOpen === task.id}" aria-label="${has ? "Notes" : "Add a note"}: ${escapeHTML(task.title)}">${NOTE_ICON}</button>`;
}

function noteBlockHTML(task) {
  if (state.noteOpen === task.id) {
    return `
      <div class="note-edit">
        <label class="sr-only" for="note-${task.id}">Notes for ${escapeHTML(task.title)}</label>
        <textarea class="input note-text" id="note-${task.id}" data-note-for="${task.id}" rows="3" maxlength="1000" placeholder="Page numbers, what the teacher said, a link…">${escapeHTML(task.notes || "")}</textarea>
        <button class="link-btn link-btn--quiet" type="button" data-note="toggle" data-id="${task.id}">Done</button>
      </div>`;
  }
  if (!task.notes || !task.notes.trim()) return "";
  return `<p class="note-preview">${linkify(task.notes.trim())}</p>`;
}

document.addEventListener("click", event => {
  const button = event.target.closest('[data-note="toggle"]');
  if (!button) return;
  event.stopPropagation();
  const id = button.dataset.id;
  state.noteOpen = state.noteOpen === id ? null : id;
  render();
  if (state.noteOpen) {
    const box = document.getElementById("note-" + id);
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }
}, true);

let noteSaveTimer = null;
document.addEventListener("input", event => {
  const box = event.target.closest("[data-note-for]");
  if (!box) return;
  const task = findTask(box.dataset.noteFor);
  if (!task) return;
  task.notes = box.value;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(saveTasks, 400);
});
