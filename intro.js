// intro.js: a short intro to your sky, shown once before the main page.
// Three steps, each with a small live picture: a star lighting up, stars
// joining into a constellation, and the monthly quest's reward.

const INTRO_STEPS = [
  {
    title: "Finish your day, light a star",
    text: "Every day you finish what you planned, a new star lights up in your sky.",
  },
  {
    title: "Join stars into constellations",
    text: "Once you have 3 or more, connect them into any shape you like and give it a name. Use 5 or more and it shines gold.",
  },
  {
    title: "Make 5 this month",
    text: "Five constellations in a month earns that month's badge and a bright star of your own. Stars you don't use carry over.",
  },
];

const intro = { step: 0, start: 0, running: false };

// Shows the intro if it hasn't been seen. Returns true if it's showing.
function showIntroIfNeeded() {
  if (load(KEYS.intro, false)) return false;
  const box = document.createElement("div");
  box.id = "intro";
  box.className = "intro-sky";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "intro-title");
  document.body.appendChild(box);
  document.body.classList.add("intro-open");
  intro.step = 0;
  drawIntroStep();
  return true;
}

function drawIntroStep() {
  const box = document.getElementById("intro");
  const step = INTRO_STEPS[intro.step];
  const last = intro.step === INTRO_STEPS.length - 1;
  box.innerHTML = `
    <button class="intro-skip" type="button" data-intro="skip">Skip</button>
    <div class="intro-body">
      <canvas class="intro-canvas" aria-hidden="true"></canvas>
      <div class="intro-text">
        <span class="intro-eyebrow">Your sky · ${intro.step + 1} of ${INTRO_STEPS.length}</span>
        <h2 id="intro-title" class="intro-title">${step.title}</h2>
        <p class="intro-copy">${step.text}</p>
      </div>
    </div>
    <div class="intro-foot">
      <div class="intro-dots" aria-hidden="true">${INTRO_STEPS.map((_, i) => `<span class="${i === intro.step ? "on" : ""}"></span>`).join("")}</div>
      <div class="intro-buttons">
        ${intro.step > 0 ? `<button class="btn btn--ghost" type="button" data-intro="back">Back</button>` : ""}
        <button class="btn btn--primary" type="button" data-intro="${last ? "done" : "next"}">${last ? "Let's go" : "Next"}</button>
      </div>
    </div>`;
  box.querySelector(`[data-intro="${last ? "done" : "next"}"]`).focus();
  intro.start = performance.now();
  if (!intro.running) {
    intro.running = true;
    requestAnimationFrame(introFrame);
  }
}

function closeIntro() {
  save(KEYS.intro, true);
  intro.running = false;
  const box = document.getElementById("intro");
  if (box) box.remove();
  document.body.classList.remove("intro-open");
  if (typeof stringOpening === "function") stringOpening();
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-intro]");
  if (!button) return;
  const action = button.dataset.intro;
  if (action === "next") { intro.step++; drawIntroStep(); }
  else if (action === "back") { intro.step = Math.max(0, intro.step - 1); drawIntroStep(); }
  else closeIntro();
});

document.addEventListener("keydown", event => {
  if (!document.getElementById("intro")) return;
  if (event.key === "ArrowRight" && intro.step < INTRO_STEPS.length - 1) { intro.step++; drawIntroStep(); }
  else if (event.key === "ArrowLeft" && intro.step > 0) { intro.step--; drawIntroStep(); }
  else if (event.key === "Escape") closeIntro();
});


// ---------------------------------------------------------------
// The little pictures. They use the same stars and glow as your sky.
// ---------------------------------------------------------------
// Shapes in "world" units, about -1..1 across.
const INTRO_SHAPE = [[-0.55, 0.15], [-0.2, -0.25], [0.18, -0.08], [0.5, -0.42], [0.35, 0.3]];
const INTRO_EDGES = [[0, 1], [1, 2], [2, 3], [2, 4]];
const INTRO_MINI = [
  { x: -0.62, y: -0.55, pts: [[-0.12, 0.05], [0, -0.08], [0.12, 0.02]] },
  { x: 0.6, y: -0.6, pts: [[-0.1, -0.06], [0.02, 0.06], [0.13, -0.04], [0.04, -0.13]] },
  { x: -0.7, y: 0.45, pts: [[-0.1, 0.08], [0.02, -0.06], [0.12, 0.06]] },
  { x: 0.68, y: 0.45, pts: [[-0.12, -0.02], [0, 0.1], [0.12, -0.02], [0.02, -0.12], [-0.1, -0.1]] },
  { x: 0.0, y: 0.78, pts: [[-0.13, 0], [-0.02, -0.08], [0.1, 0.02]] },
];

function introFrame(now) {
  const canvas = document.querySelector(".intro-canvas");
  if (!intro.running || !canvas) { intro.running = false; return; }
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(box.width * ratio) || canvas.height !== Math.round(box.height * ratio)) {
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
  }
  const pen = canvas.getContext("2d");
  const W = box.width, H = box.height;
  const unit = Math.min(W, H) / 2.3;
  const at = (x, y) => [W / 2 + x * unit, H / 2 + y * unit];
  const t = now / 1000;
  const age = reduceMotion ? 99 : (now - intro.start) / 1000;
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, W, H);

  // Background: faint nebula and twinkling dust, clipped to a soft circle.
  pen.save();
  pen.beginPath(); pen.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2); pen.clip();
  const bg = pen.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) / 2);
  bg.addColorStop(0, "#0E1A3A"); bg.addColorStop(1, "#050A16");
  pen.fillStyle = bg; pen.fillRect(0, 0, W, H);
  pen.globalCompositeOperation = "lighter";
  skyGlow(pen, ...at(-0.4, -0.3), unit * 0.9, "96, 78, 170", 0.18);
  skyGlow(pen, ...at(0.5, 0.4), unit * 0.8, "40, 72, 150", 0.18);
  pen.globalCompositeOperation = "source-over";
  for (const d of SKY_DUST) {
    if (Math.abs(d.x) > 1.2 || Math.abs(d.y) > 1.2) continue;
    const [x, y] = at(d.x, d.y);
    const twinkle = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t * d.speed + d.phase);
    pen.fillStyle = `rgba(${d.tint}, ${d.a * twinkle})`;
    pen.beginPath(); pen.arc(x, y, d.s * 0.9, 0, Math.PI * 2); pen.fill();
  }

  if (intro.step === 0) drawIntroLight(pen, at, age, t);
  else if (intro.step === 1) drawIntroJoin(pen, at, age, t, W);
  else drawIntroQuest(pen, at, age, t, unit);
  pen.restore();

  requestAnimationFrame(introFrame);
}

// Step 1: one star lights up with a flash and a ring, then a few more
// appear one by one, like the days of a week.
function drawIntroLight(pen, at, age, t) {
  const loop = reduceMotion ? 99 : age % 7;
  const stars = [[0, 0], [-0.45, -0.35], [0.4, -0.3], [-0.3, 0.42], [0.45, 0.35]];
  stars.forEach(([x, y], i) => {
    const born = 0.6 + i * 1.0;
    if (loop < born) return;
    const u = Math.min(1, (loop - born) / 0.9);
    const ease = 1 - Math.pow(1 - u, 3);
    const [px, py] = at(x, y);
    const big = i === 0 ? 1.6 : 1;
    if (u < 1) {
      pen.strokeStyle = `rgba(243, 251, 242, ${0.6 * (1 - u)})`;
      pen.lineWidth = 1.2;
      pen.beginPath(); pen.arc(px, py, 8 + ease * 44 * big, 0, Math.PI * 2); pen.stroke();
    }
    const r = (2.4 * big) * (0.2 + ease * 0.8 + Math.sin(u * Math.PI) * 0.9);
    skyStar(pen, px, py, r, "214, 236, 255", (1 + Math.sin(u * Math.PI) * 2) * (0.9 + 0.1 * Math.sin(t * 1.6 + i)), 0.7 * big);
  });
}

// Step 2: five loose stars, then lines draw between them one by one and
// the constellation turns gold with its name underneath.
function drawIntroJoin(pen, at, age, t, W) {
  const loop = reduceMotion ? 99 : age % 7.5;
  const pts = INTRO_SHAPE.map(p => at(p[0], p[1]));
  const done = 0.8 + INTRO_EDGES.length * 0.5 + 0.4;
  const gold = Math.min(1, Math.max(0, (loop - done) / 0.8));
  if (gold > 0) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    pen.globalCompositeOperation = "lighter";
    skyGlow(pen, cx, cy, W * 0.38, "245, 216, 146", 0.14 * gold);
    pen.globalCompositeOperation = "source-over";
  }
  INTRO_EDGES.forEach(([a, b], i) => {
    const u = Math.min(1, Math.max(0, (loop - 0.8 - i * 0.5) / 0.45));
    if (u <= 0) return;
    const colour = gold > 0 ? `rgba(245, 225, 170, ${0.6 + 0.3 * gold})` : "rgba(169, 200, 255, 0.85)";
    skyLine(pen, pts[a][0], pts[a][1], pts[b][0], pts[b][1], u, colour, 1.5, 8);
  });
  pts.forEach(([x, y], i) => {
    const rgb = gold > 0 ? "245, 216, 146" : "214, 236, 255";
    skyStar(pen, x, y, 2.4, rgb, 0.95 + 0.15 * Math.sin(t * 1.5 + i), gold > 0 ? 0.6 + 0.4 * gold : 0.5);
  });
  if (gold > 0) {
    pen.globalAlpha = gold;
    pen.font = `500 ${Math.max(11, Math.round(W / 26))}px "Space Grotesk", system-ui, sans-serif`;
    pen.fillStyle = "rgba(245, 216, 146, 0.9)";
    const lowest = Math.max(...pts.map(p => p[1]));
    skySpaced(pen, "EXAM WEEK", pts.reduce((s, p) => s + p[0], 0) / pts.length, lowest + 28, 2.4);
    pen.globalAlpha = 1;
  }
}

// Step 3: five small constellations fill in around the edge, then the
// month's own star bursts into life in the middle.
function drawIntroQuest(pen, at, age, t, unit) {
  const loop = reduceMotion ? 99 : age % 8;
  INTRO_MINI.forEach((c, i) => {
    const show = Math.min(1, Math.max(0, (loop - 0.4 - i * 0.55) / 0.5));
    if (show <= 0) return;
    const pts = c.pts.map(p => at(c.x + p[0] * 1.3, c.y + p[1] * 1.3));
    pen.globalAlpha = show;
    for (let k = 1; k < pts.length; k++) skyLine(pen, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 1, "rgba(169, 200, 255, 0.75)", 1.1, 5);
    pts.forEach(([x, y]) => skyStar(pen, x, y, 1.6, "214, 236, 255", 0.9, 0));
    pen.globalAlpha = 1;
  });
  const born = 0.4 + INTRO_MINI.length * 0.55 + 0.4;
  if (loop < born) return;
  const u = Math.min(1, (loop - born) / 1.2);
  const grow = (1 - Math.pow(1 - u, 3)) + Math.sin(u * Math.PI) * 0.7;
  const [x, y] = at(0, -0.05);
  if (u < 1) {
    pen.strokeStyle = `rgba(245, 216, 146, ${0.6 * (1 - u)})`;
    pen.lineWidth = 1.4;
    pen.beginPath(); pen.arc(x, y, 12 + u * unit * 0.7, 0, Math.PI * 2); pen.stroke();
  }
  const pulse = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.2);
  pen.globalCompositeOperation = "lighter";
  skyGlow(pen, x, y, unit * 0.45 * grow * pulse, "245, 216, 146", 0.35);
  pen.globalCompositeOperation = "source-over";
  skyStar(pen, x, y, 4 * grow, "245, 216, 146", 1.4 * pulse, 2 * grow);
}
