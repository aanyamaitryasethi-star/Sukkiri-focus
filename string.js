// string.js: the tangled string.
//
// It's one long line, drawn as 460 points. Each point knows three places
// it could be: in the tangle, on a straight line, or on your flame. As
// you finish tasks, points slide from the tangle to the line, starting
// from the two ends. When everything's done, the line flows into the flame.

// Your flame, from your own sketch. One outline, then one inner flame.
// A point listed twice makes a sharp tip. Negative y is up.
const FLAME_POINTS = [[0,.96],[-.3,.94],[-.56,.76],[-.72,.42],[-.72,.14],[-.64,-.06],[-.64,-.06],[-.54,.12],[-.36,.17],[-.2,.03],[-.2,-.15],[-.33,-.38],[-.31,-.64],[-.14,-.84],[.1,-1],[.1,-1],[-.02,-.72],[.14,-.5],[.32,-.3],[.42,.01],[.38,.18],[.34,.3],[.46,.38],[.58,.32],[.65,.12],[.65,.12],[.74,.36],[.68,.6],[.5,.82],[.26,.94],[0,.96],[-.14,.84],[-.36,.74],[-.5,.54],[-.54,.34],[-.54,.34],[-.42,.46],[-.26,.5],[-.09,.38],[.03,.1],[-.05,-.12],[.03,-.34],[.03,-.34],[.14,-.08],[.2,.14],[.14,.36],[.2,.5],[.38,.54],[.38,.54],[.28,.72],[.12,.84],[0,.86]];
const FLAME_OUTLINE_LENGTH = 31; // the first 31 points are the outer shape

const STRING_POINTS = 460;
const stringBox = document.getElementById("string");
const stringStage = document.getElementById("string-stage");
const stringCanvas = document.getElementById("string-canvas");
const stringPen = stringCanvas.getContext("2d");
const stringMsg = document.getElementById("string-msg");
const stringSub = document.getElementById("string-sub");
const stringClose = document.getElementById("string-close");

const string = {
  untangled: 0,   // 0 = all tangled, 1 = a straight line
  speed: 0,
  tapped: 0,      // where the string is heading right now
  target: 0,      // where it goes on your next tap
  earned: false,  // this flame just earned a new streak day
  wave: 0,        // the ripple along the finished line
  flame: 0,       // 0 = line, 1 = flame
  flameOn: false,
  flameDone: false,
  awaitLight: false, // the flame is formed and waiting for a tap to light it
  litOn: false,      // lighting up now
  lit: 0,            // 0 = dull white, 1 = glowing light blue
  bump: 0,        // a little squeeze when you tap
  mode: null,     // "open", "tap", "final" or "flame"
  autoClose: null,
  time: 0,
  width: 0,
  height: 0,
  drawing: false,
  lastFrame: 0,
};

// Turns your flame's points into a smooth line of evenly spaced points.
function smoothCurve(points, count) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < 12; s++) {
      const t = s / 12, t2 = t * t, t3 = t2 * t;
      const curve = n => 0.5 * (2 * b[n] + (c[n] - a[n]) * t + (2 * a[n] - 5 * b[n] + 4 * c[n] - d[n]) * t2 + (3 * b[n] - a[n] - 3 * c[n] + d[n]) * t3);
      dense.push([curve(0), curve(1)]);
    }
  }
  dense.push(points[points.length - 1]);

  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const even = [];
  let j = 0;
  for (let i = 0; i <= count; i++) {
    const goal = lengths[lengths.length - 1] * i / count;
    while (j < lengths.length - 2 && lengths[j + 1] < goal) j++;
    const k = (goal - lengths[j]) / ((lengths[j + 1] - lengths[j]) || 1);
    even.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * k, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * k]);
  }
  return even;
}

const flameCurve = smoothCurve(FLAME_POINTS, STRING_POINTS);
const easeBetween = x => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };

// How much of today is finished, from 0 to 1.
function todayProgress() {
  const done = doneTodayTasks().length + partsDoneToday();
  const total = done + tasksLeftToday().length;
  return total === 0 ? 0 : done / total;
}

function stringPoint(t) {
  const { width: W, height: H } = string;
  const angle = t * Math.PI * 6.2;
  const radius = Math.min(100, W * 0.24, H * 0.36);

  const tangleX = W / 2 + radius * (0.62 * Math.sin(3.1 * angle + 1) + 0.38 * Math.sin(7.3 * angle));
  const tangleY = H / 2 + radius * (0.62 * Math.cos(4.3 * angle + 0.5) + 0.38 * Math.sin(5.9 * angle + 2));
  const margin = Math.max(24, W * 0.08);
  const lineX = margin + t * (W - 2 * margin);
  const lineY = H / 2;

  // The two ends straighten first. The knot in the middle goes last.
  const fromMiddle = Math.abs(2 * t - 1);
  const free = easeBetween((string.untangled - (1 - fromMiddle) * 0.82) / 0.18);
  const squeeze = 1 + string.bump * 0.08 * (1 - free);
  let x = W / 2 + (tangleX + (lineX - tangleX) * free - W / 2) * squeeze;
  let y = H / 2 + (tangleY + (lineY - tangleY) * free - H / 2) * squeeze;
  y += Math.sin(t * 16 - string.time * 7) * string.wave * 14 * Math.sin(Math.PI * t);

  if (string.flame > 0) {
    const toFlame = easeBetween(string.flame * 1.45 - t * 0.45);
    const point = flameCurve[Math.round(t * STRING_POINTS)];
    const scale = Math.min(130, H * 0.44);
    const lift = (1 - point[1]) / 2; // the top of the flame moves the most
    const sway = reduceMotion ? 0 : Math.sin(string.time * 3 + lift * 3) * 0.04 * lift + Math.sin(string.time * 7.3 + lift * 6) * 0.012 * lift;
    const flick = reduceMotion ? 1 : 1 + Math.sin(string.time * 4.1) * 0.02 * lift;
    x += (W / 2 + (point[0] + sway) * scale - x) * toFlame;
    y += (H / 2 + point[1] * scale * flick - y) * toFlame;
  }
  return [x, y];
}

function drawString() {
  const box = stringStage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  if (string.width !== box.width || string.height !== box.height) {
    string.width = box.width;
    string.height = box.height;
    stringCanvas.width = box.width * ratio;
    stringCanvas.height = box.height * ratio;
  }
  const pen = stringPen;
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, string.width, string.height);

  // A soft pulsing ring says "tap me".
  if (string.mode === "tap" || string.mode === "final" || string.awaitLight) {
    pen.globalAlpha = 0.2 + 0.15 * Math.sin(string.time * 4);
    pen.strokeStyle = "#C9CEDA";
    pen.lineWidth = 2;
    pen.beginPath();
    pen.arc(string.width / 2, string.height / 2, Math.min(124, string.width * 0.3, string.height * 0.44) + Math.sin(string.time * 4) * 4, 0, Math.PI * 2);
    pen.stroke();
    pen.globalAlpha = 1;
  }

  // A dull white line, no glow. Only a lit flame glows.
  const shade = pen.createLinearGradient(string.width * 0.2, string.height, string.width * 0.8, 0);
  shade.addColorStop(0, "#6F7686");
  shade.addColorStop(1, "#C3C8D4");
  pen.strokeStyle = shade;
  pen.shadowBlur = 0;
  pen.lineWidth = 5;
  pen.lineCap = "round";
  pen.lineJoin = "round";
  const trace = () => {
    pen.beginPath();
    for (let i = 0; i <= STRING_POINTS; i++) {
      const [x, y] = stringPoint(i / STRING_POINTS);
      if (i === 0) pen.moveTo(x, y);
      else pen.lineTo(x, y);
    }
    pen.stroke();
  };
  trace();

  // Tapped: the flame lights up light blue and glows.
  if (string.lit > 0) {
    const breathe = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(string.time * 2.4);
    pen.globalAlpha = string.lit;
    pen.strokeStyle = "#A9D8FF";
    pen.shadowColor = "rgba(140, 205, 255, 0.85)";
    pen.shadowBlur = 26 * breathe;
    pen.lineWidth = 5.5;
    trace();
    pen.globalAlpha = 1;
    pen.shadowBlur = 0;
  }
}

function stringFrame(now) {
  if (stringBox.hidden) {
    string.drawing = false;
    return;
  }
  const dt = Math.min((now - string.lastFrame) / 1000, 1 / 30);
  string.lastFrame = now;
  string.time += dt;

  if (reduceMotion) {
    string.untangled = string.tapped;
  } else {
    string.speed += ((string.tapped - string.untangled) * 7 - string.speed * 5.5) * dt;
    string.untangled += string.speed * dt;
    string.bump += (0 - string.bump) * Math.min(1, dt * 8);
    string.wave = Math.max(0, string.wave - dt * 0.4);
  }

  // The flame waits until the string has finished straightening.
  if (string.flameOn && string.untangled > 0.97) {
    string.flame = reduceMotion ? 1 : Math.min(1, string.flame + dt / 3);
    if (string.flame >= 1 && !string.flameDone) {
      string.flameDone = true;
      if (string.earned) waitForLight();
      else { string.litOn = true; showStreakResult(); }
    }
  }
  if (string.litOn) string.lit = reduceMotion ? 1 : Math.min(1, string.lit + dt * 2.2);
  drawString();
  requestAnimationFrame(stringFrame);
}

function showString(mode, message, sub, closeLabel) {
  clearTimeout(string.autoClose);
  string.mode = mode;
  stringMsg.textContent = message;
  stringSub.textContent = sub;
  stringClose.textContent = closeLabel;
  stringBox.hidden = false;
  stringStage.setAttribute("aria-label", mode === "tap" || mode === "final" ? "Tap to untangle the string" : "The string");
  (mode === "tap" || mode === "final" ? stringStage : stringClose).focus();
  if (!string.drawing) {
    string.drawing = true;
    string.lastFrame = performance.now();
    requestAnimationFrame(stringFrame);
  }
}

function hideString() {
  clearTimeout(string.autoClose);
  string.mode = null;
  stringBox.hidden = true;
  hideSkyMoment();
  document.getElementById("report-card").hidden = true;
  stringBox.classList.remove("string--card");
}

function resetFlame() {
  clearTimeout(string.flameTimer);
  string.flame = 0;
  string.flameOn = false;
  string.flameDone = false;
  string.awaitLight = false;
  string.litOn = false;
  string.lit = 0;
  string.wave = 0;
}

// A new streak day: the flame is ready, but you light it yourself.
function waitForLight() {
  string.awaitLight = true;
  stringMsg.textContent = "Tap the flame";
  stringSub.textContent = "";
  stringStage.setAttribute("aria-label", "Tap to light your flame");
  stringStage.focus();
}

function lightFlame() {
  string.awaitLight = false;
  string.litOn = true;
  string.bump = 1;
  updateStreakChip();
  playNotes([660, 880, 1175], 0.08, 0.2, 0.12);
  stringMsg.textContent = "Lit.";
  setTimeout(showStreakResult, reduceMotion ? 0 : 1100);
}

// When the app opens: a short look at today's tangle, then out of the way.
function stringOpening() {
  const open = tasksLeftToday().length;
  if (open === 0) return;
  resetFlame();
  string.untangled = string.tapped = string.target = todayProgress();
  showString("open", "Let's untangle today.", plural(open, "thing") + " to do", "Start");
  string.autoClose = setTimeout(hideString, 2200);
}

// After a task: "give it a tap". Tapping is optional. The task already
// counts, and skipping just means the string catches up next time.
function stringAfterTask() {
  resetFlame();
  string.tapped = string.untangled;
  string.target = todayProgress();
  showString("tap", "Give it a tap", "", "Later");
}

// Last task of the day: one more tap, a clean line, then your flame.
function stringFinal(newDay) {
  resetFlame();
  string.tapped = string.untangled;
  string.target = 1;
  string.earned = newDay;
  showString("final", "Give it a tap", "That was the last one.", "Later");
}

// "Celebrate again" on the Progress page.
function stringReplay(earned) {
  resetFlame();
  string.untangled = string.tapped = string.target = 1;
  string.earned = !!earned;
  showString("flame", "All clear", "", "Back to my day");
  string.flameOn = true;
}

const REPORT_LINES = [
  "Homework: destroyed.",
  "Nothing due. Your teachers can't touch you.",
  "School's out for your brain.",
  "You just out-studied your own to-do list.",
  "Backpack: lighter. Head: clear.",
];

// Special titles for long streaks, like being on the honor roll.
function streakTitle(days) {
  if (days >= 100) return "Valedictorian";
  if (days >= 30) return "Top of the class";
  if (days >= 14) return "Honor roll";
  if (days >= 7) return "Star student";
  if (days >= 3) return "On a roll";
  return "Fresh start";
}

// The flame finished forming: confetti, the bell, and today's report card.
function showStreakResult() {
  fireworks();
  const days = plural(streak.current, "day").replace(" ", "-").replace("days", "day");
  stringMsg.textContent = (string.earned ? "+1 day · " : "") + days + " streak";
  stringSub.textContent = REPORT_LINES[Math.floor(Math.random() * REPORT_LINES.length)];
  document.getElementById("card-tasks").textContent = doneTodayTasks().length;
  const focus = statsFor(todayISO()).minutes;
  document.getElementById("card-focus").textContent = focus ? formatMinutes(focus) : "0 min";
  document.getElementById("card-title").textContent = streakTitle(streak.current);
  document.getElementById("report-card").hidden = false;
  stringBox.classList.add("string--card");
  celebrateStar(string.earned);
  stringClose.textContent = "Back to my day";
  stringClose.focus();
}

stringStage.addEventListener("click", () => {
  if (string.awaitLight) {
    lightFlame();
  } else if (string.mode === "open") {
    hideString();
  } else if (string.mode === "tap") {
    string.tapped = string.target;
    string.bump = 1;
    playNotes([660, 880], 0.07, 0.2, 0.1);
    string.mode = "flame";
    stringMsg.textContent = "A little less tangled";
    string.autoClose = setTimeout(hideString, 3200);
  } else if (string.mode === "final") {
    string.tapped = 1;
    string.bump = 1;
    string.wave = 1;
    string.mode = "flame";
    stringMsg.textContent = "All clear";
    stringSub.textContent = "";
    string.flameTimer = setTimeout(() => { string.flameOn = true; }, reduceMotion ? 0 : 3200);
  }
});

stringClose.addEventListener("click", hideString);


// ---------------------------------------------------------------
// The little flame and number next to the logo
// ---------------------------------------------------------------
const flameIcon = smoothCurve(FLAME_POINTS.slice(0, FLAME_OUTLINE_LENGTH), 80)
  .map((p, i) => (i ? "L" : "M") + p[0].toFixed(3) + " " + p[1].toFixed(3)).join("") + "Z";
document.getElementById("streak-icon").setAttribute("d", flameIcon);

function updateStreakChip() {
  const chip = document.getElementById("streak-chip");
  const lit = streak.current > 0 && streak.lastDate === todayISO();
  const ready = !lit && allTodayDone();
  chip.hidden = streak.best === 0 && !ready;
  chip.classList.toggle("streak-chip--lit", lit);
  chip.classList.toggle("streak-chip--ready", ready);
  document.getElementById("streak-count").textContent = streak.current;
  chip.setAttribute("aria-label", ready
    ? "Everything's done. Tap to light your flame."
    : plural(streak.current, "day") + " streak. See your progress.");
}

// Done for the day but not lit yet? Tapping the little flame lights it.
document.getElementById("streak-chip").addEventListener("click", () => {
  if (!allTodayDone() || (streak.current > 0 && streak.lastDate === todayISO())) {
    goTo("strings");
    return;
  }
  stringReplay(true);
});
