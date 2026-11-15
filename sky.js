// sky.js: your night sky.
//
// Every day you finish what you planned, a loose star lights up. Join 3 or
// more of your loose stars into a constellation whenever you like, and name
// it. Five or more stars makes a gold one. Each month has a quest: make 5
// constellations. Loose stars you haven't used carry over to next month.
//
// The sky shows up in three places: its own page, inside the focus timer
// (it slowly turns while you focus, shooting stars on breaks), and in the
// end-of-day moment when tonight's star lights up.

const SKY_GOAL = 5;      // constellations per month
const SKY_MIN = 3;       // smallest constellation
const SKY_BRIGHT = 5;    // this many stars or more makes a gold one
const SKY_NAMES = ["Exam Week", "The Comeback", "Chem Grind", "Rainy Week", "Quiet Wins", "Night Owl", "Main Character", "Deadline Season"];

function makeSky() {
  return { loose: [], made: [], nextId: 1, unseen: false, before: null, migrated: false, badges: [], monthStars: [], rewardPending: null };
}
let sky = Object.assign(makeSky(), load(KEYS.sky, {}));
function saveSky() { save(KEYS.sky, sky); }

function monthKey(iso) { return (iso || todayISO()).slice(0, 7); }
function monthName(iso) { return fromISO((iso || todayISO()).slice(0, 7) + "-01").toLocaleDateString("en-US", { month: "long" }); }
function daysLeftInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
}
function madeThisMonth() { return sky.made.filter(c => c.month === monthKey()); }


// ---------------------------------------------------------------
// Placing stars. World units: x runs -1..1, y runs about -1.2..1.2.
// ---------------------------------------------------------------
function allStarPoints() {
  return sky.loose.map(s => [s.x, s.y]).concat(...sky.made.map(c => c.stars), sky.monthStars.map(s => [s.x, s.y]));
}

// New loose stars gather near each other, like a small patch of sky, so the
// constellations you draw from them stay compact. The first one of a new
// patch goes wherever there's room.
function freeSpot(cluster = true) {
  const taken = allStarPoints();
  const near = cluster ? sky.loose : [];
  if (near.length > 0) {
    const cx = near.reduce((s, p) => s + p.x, 0) / near.length;
    const cy = near.reduce((s, p) => s + p.y, 0) / near.length;
    for (let tries = 0; tries < 160; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.12 + Math.random() * (0.18 + near.length * 0.02);
      const x = cx + Math.cos(angle) * dist, y = cy + Math.sin(angle) * dist;
      if (Math.abs(x) > 0.86 || Math.abs(y) > 1.08) continue;
      if (taken.every(p => Math.hypot(p[0] - x, p[1] - y) > 0.12)) return [x, y];
    }
  }
  for (let tries = 0; tries < 240; tries++) {
    const x = (Math.random() * 2 - 1) * 0.82;
    const y = (Math.random() * 2 - 1) * 1.02;
    const gap = tries < 140 ? 0.2 : tries < 200 ? 0.13 : 0.08;
    if (taken.every(p => Math.hypot(p[0] - x, p[1] - y) > gap)) return [x, y];
  }
  return [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.8];
}

function addLooseStar(date) {
  const [x, y] = freeSpot();
  const star = { id: "s" + sky.nextId++, x: x, y: y, date: date };
  sky.loose.push(star);
  return star;
}

// Older versions collected string colours and sweaters. Each finished
// sweater becomes a gold constellation, and each spare colour a loose star,
// so nobody loses anything they earned.
(function moveOverFromStrings() {
  if (sky.migrated) return;
  sky.migrated = true;
  const old = load(KEYS.yarn, null);
  if (old) {
    (old.sweaters || []).forEach((_, index) => {
      const [cx, cy] = freeSpot();
      const stars = [];
      let angle = Math.random() * Math.PI * 2;
      let x = cx - 0.2, y = cy;
      for (let i = 0; i < 5; i++) {
        stars.push([x, y]);
        angle += (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.8);
        x += Math.cos(angle) * 0.15;
        y += Math.sin(angle) * 0.15;
      }
      sky.made.push({ name: "Sweater " + (index + 1), stars: stars, edges: [[0, 1], [1, 2], [2, 3], [3, 4]], month: "earlier", date: null });
    });
    (old.colours || []).forEach(() => addLooseStar(null));
  }
  saveSky();
})();


// ---------------------------------------------------------------
// Earning a star. data.js calls these when a streak day is earned or undone.
// ---------------------------------------------------------------
function earnStar() {
  sky.before = JSON.parse(JSON.stringify({ loose: sky.loose, nextId: sky.nextId, unseen: sky.unseen }));
  const star = addLooseStar(todayISO());
  sky.unseen = true;
  saveSky();
  skyAnim.lit.push({ id: star.id, start: performance.now() + 400 });
}

function undoStar() {
  if (!sky.before) return;
  Object.assign(sky, sky.before);
  sky.before = null;
  saveSky();
}

// A dot on the Sky button while a new star is waiting to be seen.
function updateSkyDot() {
  document.getElementById("strings-new").hidden = !sky.unseen;
  document.getElementById("nav-strings").setAttribute("aria-label", sky.unseen ? "Sky, new star waiting" : "Sky");
}

// "focus", a break ("short"/"long"), or null when no timer is going.
function timerMode() {
  return (timer.running || timer.overtime) && !timer.waiting ? timer.mode : null;
}


// ---------------------------------------------------------------
// The Sky page
// ---------------------------------------------------------------
const skyUI = {
  mode: "view",      // "view", "design" or "name"
  chosen: [],        // star ids joined so far
  edges: [],         // [id, id] lines
  anchor: null,      // the star you're drawing from
  history: [],
};
const skyEl = document.getElementById("strings-content");

function renderSky() {
  if (sky.unseen) {
    sky.unseen = false;
    saveSky();
    updateSkyDot();
  }
  skyEl.innerHTML = rewardHTML() + questHTML() + `
    <div class="sky-box ${skyUI.mode === "design" ? "sky-box--design" : ""}">
      <canvas class="sky-canvas sky-canvas--page" data-scene="page" role="img" aria-label="Your night sky: ${sky.made.length} constellations and ${sky.loose.length} loose stars"></canvas>
      <span class="sky-pill" id="sky-pill" ${skyUI.mode === "design" ? "" : "hidden"}>${designPillText()}</span>
      <span class="sky-tip" id="sky-tip" hidden></span>
      <span class="sky-banner" id="sky-banner" hidden></span>
    </div>
    ${skyUI.mode === "design" ? designBarHTML() : skyUI.mode === "name" ? nameCardHTML() : bankBarHTML()}
    ${badgesHTML()}`;
  if (skyUI.mode === "name") document.getElementById("sky-name").focus({ preventScroll: true });
  startSky();
}

function questHTML() {
  const month = madeThisMonth();
  const name = monthName();
  const done = month.length >= SKY_GOAL;
  const slots = Array.from({ length: SKY_GOAL }, (_, i) => {
    const c = month[i];
    if (!c) return `<div class="sky-slot"><span class="sky-slot-num">${i + 1}</span></div>`;
    return `<div class="sky-slot sky-slot--done ${c.stars.length >= SKY_BRIGHT ? "sky-slot--gold" : ""}" title="${escapeHTML(c.name)} · ${c.stars.length} stars">${miniConstellation(c)}</div>`;
  }).join("");
  const carried = sky.loose.filter(s => s.date && monthKey(s.date) < monthKey()).length;
  return `
    <section class="sky-quest" aria-label="${name} quest">
      <div class="sky-quest-top">
        <span class="sky-quest-title">${done ? `${name} quest complete` : `${name} quest: make ${SKY_GOAL} constellations`}</span>
        <span class="sky-quest-count"><strong>${Math.min(month.length, SKY_GOAL)}</strong> of ${SKY_GOAL}</span>
      </div>
      <div class="sky-slots">${slots}</div>
      <p class="sky-quest-note">${done ? "Every constellation from here is a bonus." : `${plural(daysLeftInMonth(), "day")} left. Finish all ${SKY_GOAL} to earn the ${name} badge and a star of your own. Each needs ${SKY_MIN}+ stars, and ${SKY_BRIGHT}+ shines gold.`}${carried ? ` ${plural(carried, "star")} carried over from last month.` : ""}</p>
    </section>`;
}

function miniConstellation(c) {
  const xs = c.stars.map(p => p[0]), ys = c.stars.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const at = p => [((p[0] - (minX + maxX) / 2) / span) * 34 + 20, ((p[1] - (minY + maxY) / 2) / span) * 34 + 20];
  const colour = c.stars.length >= SKY_BRIGHT ? "#F5D892" : "#C9DAFF";
  const lines = c.edges.map(([a, b]) => {
    const A = at(c.stars[a]), B = at(c.stars[b]);
    return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${colour}" stroke-opacity="0.75" stroke-width="1.3" stroke-linecap="round"></line>`;
  }).join("");
  const dots = c.stars.map(p => { const [x, y] = at(p); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#FFFFFF"></circle>`; }).join("");
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${lines}${dots}</svg>`;
}

function bankBarHTML() {
  const n = sky.loose.length;
  const sub = n >= SKY_MIN
    ? (n >= SKY_BRIGHT ? "Enough for a gold constellation." : `Enough to make one. Save up ${SKY_BRIGHT} and it shines gold.`)
    : n === 0 ? "Finish your day to light your first one." : `Finish ${plural(SKY_MIN - n, "more day")} to make a constellation.`;
  return `
    <div class="sky-bar">
      <div class="sky-bar-text">
        <span class="sky-bar-title">${plural(n, "loose star")}<span class="sky-loose-dots" aria-hidden="true">${"<i></i>".repeat(Math.min(n, 10))}</span></span>
        <span class="sky-bar-sub">${sub}</span>
      </div>
      ${n >= SKY_MIN ? `<button class="btn btn--primary" type="button" data-sky="make">Make a constellation</button>` : ""}
    </div>`;
}

function designPillText() {
  if (skyUI.anchor) return "Drawing · tap the next star";
  return skyUI.chosen.length ? "Tap a joined star to keep going" : "Tap a star to start";
}

function designBarHTML() {
  const count = skyUI.chosen.filter(id => skyUI.edges.some(e => e.includes(id))).length;
  const ok = count >= SKY_MIN;
  const title = count === 0 ? "Tap two stars to join them" : `${plural(count, "star")} joined${count >= SKY_BRIGHT ? " · gold" : ""}`;
  const sub = ok
    ? (count >= SKY_BRIGHT ? "Looking good. Tap Done to name it." : `Tap Done, or join ${SKY_BRIGHT - count} more to make it gold.`)
    : `Keep tapping to draw. Tap a joined star to branch off. You need at least ${SKY_MIN}.`;
  return `
    <div class="sky-bar">
      <div class="sky-bar-text">
        <span class="sky-bar-title">${title}</span>
        <span class="sky-bar-sub">${sub}</span>
      </div>
      <div class="row-gap">
        <button class="btn btn--ghost btn--small" type="button" data-sky="undo" ${skyUI.history.length ? "" : "disabled"}>Undo</button>
        <button class="btn btn--ghost btn--small" type="button" data-sky="cancel">Cancel</button>
        <button class="btn btn--primary btn--small" type="button" data-sky="done" ${ok ? "" : "disabled"}>Done</button>
      </div>
    </div>`;
}

function nameCardHTML() {
  const count = skyUI.chosen.length;
  const gold = count >= SKY_BRIGHT;
  const taken = sky.made.map(c => c.name);
  const chips = SKY_NAMES.filter(name => !taken.includes(name)).slice(0, 4)
    .map(name => `<button class="choice choice--small" type="button" data-sky="pick-name" data-name="${name}">${name}</button>`).join("");
  return `
    <form class="sky-name" data-sky-form="name">
      <h2 class="section-title">${gold ? "A gold constellation" : "Name your constellation"}</h2>
      <p class="muted">${plural(count, "day")}, all finished.${gold ? " This one shines." : ""} What do you want to call it?</p>
      <div class="sky-name-row">
        <label class="sr-only" for="sky-name">Constellation name</label>
        <input class="input" id="sky-name" name="name" maxlength="22" autocomplete="off" placeholder="Name it">
        <button class="btn btn--primary" type="submit">Save</button>
      </div>
      <div class="choices">${chips}</div>
    </form>`;
}

skyEl.addEventListener("click", event => {
  const canvas = event.target.closest(".sky-canvas--page");
  if (canvas) { tapSky(canvas, event); return; }
  const button = event.target.closest("[data-sky]");
  if (!button) return;
  switch (button.dataset.sky) {
    case "make":
      Object.assign(skyUI, { mode: "design", chosen: [], edges: [], anchor: null, history: [] });
      break;
    case "cancel":
      skyUI.mode = "view";
      break;
    case "undo": {
      const before = skyUI.history.pop();
      if (before) Object.assign(skyUI, before);
      break;
    }
    case "done":
      // Only stars with at least one line count.
      skyUI.chosen = skyUI.chosen.filter(id => skyUI.edges.some(e => e.includes(id)));
      if (skyUI.chosen.length >= SKY_MIN) skyUI.mode = "name";
      break;
    case "pick-name":
      saveConstellation(button.dataset.name);
      return;
    case "reward-ok":
      sky.rewardPending = null;
      saveSky();
      break;
  }
  renderSky();
});

skyEl.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.dataset.skyForm === "name") saveConstellation(event.target.elements.name.value);
});

function rememberDesign() {
  skyUI.history.push({ chosen: skyUI.chosen.slice(), edges: skyUI.edges.map(e => e.slice()), anchor: skyUI.anchor });
}

function tapSky(canvas, event) {
  const view = skyView(canvas);
  const box = canvas.getBoundingClientRect();
  const mx = event.clientX - box.left, my = event.clientY - box.top;
  let best = null;
  sky.loose.forEach(star => {
    const [x, y] = skyPoint(view, star.x, star.y);
    const d = Math.hypot(x - mx, y - my);
    if (d < 28 && (!best || d < best.d)) best = { d, star, x, y };
  });
  if (skyUI.mode !== "design") {
    sky.made.forEach(c => c.stars.forEach(p => {
      const [x, y] = skyPoint(view, p[0], p[1]);
      const d = Math.hypot(x - mx, y - my);
      if (d < 26 && (!best || d < best.d)) best = { d, made: c, x, y };
    }));
    sky.monthStars.forEach(ms => {
      const [x, y] = skyPoint(view, ms.x, ms.y);
      const d = Math.hypot(x - mx, y - my);
      if (d < 30 && (!best || d < best.d)) best = { d, monthStar: ms, x, y };
    });
    if (!best) { document.getElementById("sky-tip").hidden = true; return; }
    if (best.monthStar) { skyTip(`${monthName(best.monthStar.month)}'s Star · quest reward`, best.x, best.y); return; }
    if (best.made) skyTip(`${best.made.name} · ${plural(best.made.stars.length, "star")}${best.made.stars.length >= SKY_BRIGHT ? " · gold" : ""}`, best.x, best.y);
    else skyTip(best.star.date ? `${friendlyDate(best.star.date)} · ready to use` : "A finished day, ready to use", best.x, best.y);
    return;
  }
  if (!best || !best.star) return;

  const id = best.star.id;
  const joined = skyUI.chosen.includes(id);
  if (skyUI.anchor === null) {
    if (skyUI.chosen.length > 0 && !joined) { skyTip("Start from a joined star so it stays connected", best.x, best.y); return; }
    rememberDesign();
    if (!joined) skyUI.chosen.push(id);
    skyUI.anchor = id;
  } else if (skyUI.anchor === id) {
    rememberDesign();
    skyUI.anchor = null;   // lift the pen
  } else {
    rememberDesign();
    const exists = skyUI.edges.some(([a, b]) => (a === skyUI.anchor && b === id) || (a === id && b === skyUI.anchor));
    if (!exists) skyUI.edges.push([skyUI.anchor, id]);
    if (!joined) skyUI.chosen.push(id);
    skyUI.anchor = id;
    playNotes([1046.5 + skyUI.chosen.length * 60], 0.05, 0.25, 0.06);
  }
  renderSky();
}

function saveConstellation(rawName) {
  const ids = skyUI.chosen;
  const stars = ids.map(id => { const s = sky.loose.find(star => star.id === id); return [s.x, s.y]; });
  const edges = skyUI.edges.filter(([a, b]) => ids.includes(a) && ids.includes(b)).map(([a, b]) => [ids.indexOf(a), ids.indexOf(b)]);
  const name = rawName.trim().slice(0, 22) || "Constellation " + (sky.made.length + 1);
  sky.made.push({ name: name, stars: stars, edges: edges, month: monthKey(), date: todayISO() });
  sky.loose = sky.loose.filter(star => !ids.includes(star.id));
  sky.before = null;   // can't undo a star that's now part of a constellation
  saveSky();
  const month = monthKey();
  if (madeThisMonth().length >= SKY_GOAL && !sky.badges.some(b => b.month === month)) awardQuest(month);

  const gold = stars.length >= SKY_BRIGHT;
  const now = performance.now();
  skyAnim.born = { name: name, start: now };
  stars.forEach(([x, y]) => {
    for (let k = 0; k < (gold ? 14 : 8); k++) {
      skyAnim.sparks.push({ x, y, a: Math.random() * Math.PI * 2, v: 0.06 + Math.random() * 0.12, start: now + edges.length * 220, life: 900 + Math.random() * 600, rgb: gold ? "245, 216, 146" : "169, 200, 255" });
    }
  });
  playNotes(gold ? [784, 987.8, 1174.7, 1568] : [784, 1046.5, 1318.5], 0.11, 0.6, 0.12);

  Object.assign(skyUI, { mode: "view", chosen: [], edges: [], anchor: null, history: [] });
  renderSky();
  const count = madeThisMonth().length;
  if (count === SKY_GOAL) {
    skyBanner(`${monthName()} quest complete`, 4200);
    for (let i = 0; i < 6; i++) setTimeout(() => skyShoot(performance.now()), 700 + i * 380);
  } else {
    skyBanner(gold ? `${name} · a gold constellation` : `${name} is in your sky`, 2800);
  }
}

function skyTip(text, x, y) {
  const tip = document.getElementById("sky-tip");
  if (!tip) return;
  const width = tip.parentElement.getBoundingClientRect().width;
  tip.textContent = text;
  tip.style.left = Math.min(width - 90, Math.max(90, x)) + "px";
  tip.style.top = y + "px";
  tip.hidden = false;
  clearTimeout(skyTip.timer);
  skyTip.timer = setTimeout(() => { tip.hidden = true; }, 2600);
}

function skyBanner(text, ms) {
  const banner = document.getElementById("sky-banner");
  if (!banner) return;
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(skyBanner.timer);
  skyBanner.timer = setTimeout(() => { banner.hidden = true; }, ms);
}


// ---------------------------------------------------------------
// The end-of-day moment: tonight's star lighting up.
// ---------------------------------------------------------------
function celebrateStar(earned) {
  const canvas = document.getElementById("sky-moment");
  const note = document.getElementById("sky-note");
  if (!earned || !sky.unseen) {
    canvas.hidden = true;
    note.hidden = true;
    return;
  }
  const n = sky.loose.length;
  note.textContent = `A new star is in your sky · ${plural(n, "loose star")}${n >= SKY_MIN ? ", enough for a constellation" : ""}`;
  note.hidden = false;
  canvas.hidden = false;
  const newest = sky.loose[sky.loose.length - 1];
  if (newest) skyAnim.lit.push({ id: newest.id, start: performance.now() + 300 });
  startSky();
}

function hideSkyMoment() {
  document.getElementById("sky-moment").hidden = true;
  document.getElementById("sky-note").hidden = true;
}


// ---------------------------------------------------------------
// Drawing. One loop draws every sky canvas that's on screen.
// ---------------------------------------------------------------
const skyAnim = { lit: [], rotation: 0, shooting: [], nextShot: 0, born: null, sparks: [], drawing: false, last: 0 };

function skySeeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Background atmosphere: never earned, the same for everyone.
const SKY_NEBULAE = [
  { x: -0.55, y: -0.7, r: 0.9, rgb: "96, 78, 170", a: 0.2, s: 0.11 },
  { x: 0.6, y: 0.1, r: 0.85, rgb: "36, 128, 112", a: 0.18, s: 0.08 },
  { x: -0.2, y: 0.85, r: 1.0, rgb: "40, 72, 150", a: 0.16, s: 0.07 },
  { x: 0.35, y: -0.95, r: 0.6, rgb: "120, 160, 255", a: 0.07, s: 0.13 },
  { x: -0.75, y: 0.35, r: 0.55, rgb: "150, 90, 160", a: 0.09, s: 0.1 },
];
const SKY_DUST = (() => {
  const rand = skySeeded(7);
  const tints = ["220, 239, 226", "200, 214, 255", "255, 236, 210", "214, 255, 222"];
  const dust = [];
  for (let i = 0; i < 520; i++) {
    const r = Math.sqrt(rand()) * 1.9, a = rand() * Math.PI * 2;
    dust.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 1.2, s: rand() < 0.92 ? 0.35 + rand() * 0.5 : 0.9 + rand() * 0.6, phase: rand() * 6, speed: 0.4 + rand() * 1.4, tint: tints[Math.floor(rand() * tints.length)], a: 0.35 + rand() * 0.5 });
  }
  for (let i = 0; i < 1100; i++) {   // a faint band of tiny stars, corner to corner
    const t = rand() * 3.6 - 1.8, off = (rand() + rand() + rand() - 1.5) * 0.2;
    dust.push({ x: t * 0.7 + off * 0.7, y: t * -0.75 + off, s: 0.25 + rand() * 0.35, phase: rand() * 6, speed: 0.3, tint: "214, 230, 255", a: 0.25 });
  }
  return dust;
})();

function skyView(canvas) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(box.width * ratio) || canvas.height !== Math.round(box.height * ratio)) {
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
  }
  const scene = canvas.dataset.scene;
  const W = box.width, H = box.height;
  const unit = scene === "page" ? W / 2.1 : scene === "timer" ? W / 2.5 : W / 0.9;
  // The end-of-day moment zooms in on tonight's star.
  const newest = scene === "moment" && sky.loose.length ? sky.loose[sky.loose.length - 1] : null;
  return { W, H, ratio, unit, scene, rotation: scene === "timer" ? skyAnim.rotation : 0, ox: newest ? newest.x : 0, oy: newest ? newest.y : 0 };
}

function skyPoint(view, x, y) {
  const c = Math.cos(view.rotation), s = Math.sin(view.rotation);
  x -= view.ox || 0; y -= view.oy || 0;
  return [view.W / 2 + (x * c - y * s) * view.unit, view.H / 2 + (x * s + y * c) * view.unit];
}

function skyGlow(pen, x, y, radius, rgb, alpha) {
  if (radius <= 0) return;
  const g = pen.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(0.35, `rgba(${rgb}, ${alpha * 0.35})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  pen.fillStyle = g;
  pen.beginPath(); pen.arc(x, y, radius, 0, Math.PI * 2); pen.fill();
}

// A star: a soft halo, and for brighter ones four thin light spikes.
function skyStar(pen, x, y, r, rgb, strength, spikes) {
  skyGlow(pen, x, y, r * 7 * strength, rgb, 0.5 * Math.min(1, strength));
  if (spikes > 0) {
    pen.save();
    pen.translate(x, y);
    for (const [dx, dy, len] of [[1, 0, 1], [0, 1, 1], [0.7, 0.7, 0.45], [0.7, -0.7, 0.45]]) {
      const L = r * 9 * spikes * len;
      const g = pen.createLinearGradient(-dx * L, -dy * L, dx * L, dy * L);
      g.addColorStop(0, `rgba(${rgb}, 0)`);
      g.addColorStop(0.5, `rgba(255, 255, 255, ${0.8 * Math.min(1, spikes)})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      pen.strokeStyle = g;
      pen.lineWidth = len === 1 ? 1 : 0.7;
      pen.beginPath(); pen.moveTo(-dx * L, -dy * L); pen.lineTo(dx * L, dy * L); pen.stroke();
    }
    pen.restore();
  }
  pen.fillStyle = "#FFFFFF";
  pen.beginPath(); pen.arc(x, y, r, 0, Math.PI * 2); pen.fill();
}

function skyLine(pen, x1, y1, x2, y2, u, colour, width, blur) {
  pen.save();
  pen.shadowColor = colour; pen.shadowBlur = blur;
  pen.strokeStyle = colour; pen.lineWidth = width; pen.lineCap = "round";
  pen.beginPath(); pen.moveTo(x1, y1); pen.lineTo(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u); pen.stroke();
  pen.restore();
}

function skySpaced(pen, text, cx, y, spacing) {
  const chars = [...text];
  const widths = chars.map(ch => pen.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  pen.textAlign = "left";
  chars.forEach((ch, i) => { pen.fillText(ch, x, y); x += widths[i] + spacing; });
}

function drawSkyCanvas(canvas, now) {
  const view = skyView(canvas);
  if (view.W === 0) return;
  const pen = canvas.getContext("2d");
  const t = now / 1000;
  const { W, H } = view;
  const small = view.scene !== "page";
  pen.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);

  const bg = pen.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#03060D"); bg.addColorStop(0.55, "#060C1A"); bg.addColorStop(1, "#0A1630");
  pen.fillStyle = bg;
  pen.fillRect(0, 0, W, H);

  pen.globalCompositeOperation = "lighter";
  for (const n of SKY_NEBULAE) {
    const dx = reduceMotion ? 0 : Math.sin(t * n.s) * 0.05, dy = reduceMotion ? 0 : Math.cos(t * n.s * 0.8) * 0.04;
    const [x, y] = skyPoint(view, n.x + dx, n.y + dy);
    skyGlow(pen, x, y, n.r * view.unit, n.rgb, n.a);
  }
  pen.globalCompositeOperation = "source-over";

  const dustSize = Math.max(small ? 0.7 : 1, W / 420);
  for (const d of SKY_DUST) {
    const [x, y] = skyPoint(view, d.x, d.y);
    if (x < -3 || y < -3 || x > W + 3 || y > H + 3) continue;
    const twinkle = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t * d.speed + d.phase);
    pen.fillStyle = `rgba(${d.tint}, ${d.a * twinkle})`;
    pen.beginPath(); pen.arc(x, y, d.s * dustSize, 0, Math.PI * 2); pen.fill();
  }

  sky.made.forEach((c, i) => drawConstellation(pen, view, c, i, now, t, small));
  sky.monthStars.forEach(ms => drawMonthStar(pen, view, ms, now, t, small));

  const designing = view.scene === "page" && skyUI.mode === "design";
  sky.loose.forEach((star, i) => {
    const [x, y] = skyPoint(view, star.x, star.y);
    const chosen = designing && skyUI.chosen.includes(star.id);
    let r = small ? 1.6 : 2.2;
    let strength = reduceMotion ? 1 : 0.9 + 0.2 * Math.sin(t * 1.6 + i);
    const lit = skyAnim.lit.find(l => l.id === star.id && now >= l.start);
    if (lit) {
      const u = Math.min(1, (now - lit.start) / 900);
      const ease = 1 - Math.pow(1 - u, 3);
      r *= 0.2 + ease * 0.8 + Math.sin(u * Math.PI) * 1.1;
      strength *= 1 + Math.sin(u * Math.PI) * 2.2;
      if (u < 1) {
        pen.strokeStyle = `rgba(243, 251, 242, ${0.55 * (1 - u)})`;
        pen.lineWidth = 1;
        pen.beginPath(); pen.arc(x, y, 8 + ease * 36, 0, Math.PI * 2); pen.stroke();
      }
    } else if (skyAnim.lit.some(l => l.id === star.id)) {
      return; // waiting to light up
    }
    skyStar(pen, x, y, r, chosen ? "169, 200, 255" : "214, 236, 255", strength, chosen ? 0.9 : small ? 0.3 : 0.55);
    if (designing) {
      const isAnchor = skyUI.anchor === star.id;
      pen.strokeStyle = isAnchor ? "rgba(169, 200, 255, 0.95)" : chosen ? "rgba(169, 200, 255, 0.5)" : "rgba(214, 236, 255, 0.35)";
      pen.lineWidth = isAnchor ? 1.6 : 1;
      pen.setLineDash(chosen ? [] : [3, 4]);
      pen.beginPath(); pen.arc(x, y, isAnchor ? 15 + Math.sin(t * 4) * 1.5 : 12, 0, Math.PI * 2); pen.stroke();
      pen.setLineDash([]);
    }
  });

  if (designing) {
    for (const [a, b] of skyUI.edges) {
      const A = sky.loose.find(s => s.id === a), B = sky.loose.find(s => s.id === b);
      if (!A || !B) continue;
      const [x1, y1] = skyPoint(view, A.x, A.y), [x2, y2] = skyPoint(view, B.x, B.y);
      skyLine(pen, x1, y1, x2, y2, 1, "rgba(169, 200, 255, 0.85)", 1.5, 8);
    }
  }

  if (view.scene === "page") {
    for (const p of skyAnim.sparks) {
      if (now < p.start) continue;
      const u = (now - p.start) / p.life;
      const [x, y] = skyPoint(view, p.x, p.y);
      pen.fillStyle = `rgba(${p.rgb}, ${1 - u})`;
      pen.beginPath();
      pen.arc(x + Math.cos(p.a) * p.v * u * view.unit, y + Math.sin(p.a) * p.v * u * view.unit, 1.4 * (1 - u) + 0.4, 0, Math.PI * 2);
      pen.fill();
    }
  }

  // Shooting stars: on breaks inside the timer, and when a quest is finished.
  if (view.scene !== "moment") {
    for (const s of skyAnim.shooting) {
      if (s.where !== view.scene) continue;
      const u = (now - s.start) / s.life;
      const ease = 1 - Math.pow(1 - u, 2);
      const hx = (s.x + s.dx * ease) * W, hy = (s.y + s.dy * ease) * H;
      const len = (small ? 60 : 120) * Math.sin(u * Math.PI) * Math.max(1, W / 420);
      const ang = Math.atan2(s.dy * H, s.dx * W);
      const g = pen.createLinearGradient(hx, hy, hx - Math.cos(ang) * len, hy - Math.sin(ang) * len);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * (1 - u * 0.5)})`);
      g.addColorStop(0.3, `rgba(185, 168, 242, ${0.4 * (1 - u)})`);
      g.addColorStop(1, "rgba(185, 168, 242, 0)");
      pen.strokeStyle = g; pen.lineWidth = 1.8; pen.lineCap = "round";
      pen.beginPath(); pen.moveTo(hx, hy); pen.lineTo(hx - Math.cos(ang) * len, hy - Math.sin(ang) * len); pen.stroke();
      skyGlow(pen, hx, hy, 8, "255, 255, 255", 0.8 * (1 - u));
    }
  }

  // Darker edges; in the timer, a darker middle too so the numbers read.
  const v = pen.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (view.scene === "timer" ? 0.05 : 0.35), W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, view.scene === "timer" ? "rgba(3, 6, 11, 0.55)" : "rgba(0, 0, 0, 0)");
  v.addColorStop(view.scene === "timer" ? 0.45 : 0.01, "rgba(0, 0, 0, 0.05)");
  v.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  pen.fillStyle = v;
  pen.fillRect(0, 0, W, H);
}

function drawConstellation(pen, view, c, index, now, t, small) {
  const gold = c.stars.length >= SKY_BRIGHT;
  const points = c.stars.map(p => skyPoint(view, p[0], p[1]));
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const born = view.scene === "page" && skyAnim.born && skyAnim.born.name === c.name && index === sky.made.length - 1 ? skyAnim.born : null;
  const age = born ? (now - born.start) / 1000 : 99;

  if (gold) {
    const spread = Math.max(...points.map(p => Math.hypot(p[0] - cx, p[1] - cy))) + (small ? 20 : 50);
    const pulse = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 0.9 + index);
    const grow = Math.min(1, age / 1.2);
    pen.globalCompositeOperation = "lighter";
    skyGlow(pen, cx, cy, spread * 1.25, "245, 216, 146", 0.11 * pulse * grow);
    skyGlow(pen, cx + spread * 0.15, cy - spread * 0.08, spread, "185, 168, 242", 0.09 * pulse * grow);
    pen.globalCompositeOperation = "source-over";
  }

  c.edges.forEach(([a, b], i) => {
    const u = born ? Math.min(1, Math.max(0, (age - i * 0.22) / 0.4)) : 1;
    if (u <= 0) return;
    const flash = born ? Math.max(0, 1 - Math.abs(age - c.edges.length * 0.22 - 0.4) / 0.6) : 0;
    const colour = gold ? `rgba(245, 225, 170, ${0.62 + flash * 0.35})` : `rgba(169, 200, 255, ${0.5 + flash * 0.4})`;
    skyLine(pen, points[a][0], points[a][1], points[b][0], points[b][1], u, colour, small ? 1 : gold ? 1.4 : 1.2, small ? 4 : gold ? 10 : 6);
  });

  points.forEach(([x, y], i) => {
    const twinkle = reduceMotion ? 1 : 0.88 + 0.12 * Math.sin(t * 1.3 + i * 1.7 + index);
    skyStar(pen, x, y, small ? 1.5 : gold ? 2.4 : 2, gold ? "245, 216, 146" : "169, 200, 255", twinkle * (gold ? 1.15 : 1), small ? (gold ? 0.5 : 0) : gold ? 0.85 : 0.35);
  });

  if (small) return;
  const lowest = Math.max(...points.map(p => p[1]));
  pen.font = `500 ${Math.max(10, Math.round(view.W / 46))}px "Space Grotesk", system-ui, sans-serif`;
  pen.fillStyle = gold ? "rgba(245, 216, 146, 0.85)" : "rgba(220, 239, 226, 0.6)";
  pen.globalAlpha = born ? Math.min(1, Math.max(0, age - 0.9) / 0.8) : 1;
  skySpaced(pen, c.name.toUpperCase(), cx, lowest + 24, 2.2);
  pen.globalAlpha = 1;
}

function skyShoot(now, where = "page") {
  const left = Math.random() < 0.5;
  skyAnim.shooting.push({
    where: where,
    start: now,
    life: reduceMotion ? 300 : 1200,
    x: left ? 0.05 + Math.random() * 0.3 : 0.65 + Math.random() * 0.3,
    y: 0.05 + Math.random() * 0.3,
    dx: (left ? 1 : -1) * (0.4 + Math.random() * 0.2),
    dy: 0.2 + Math.random() * 0.12,
  });
}

function skyFrame(now) {
  const canvases = [...document.querySelectorAll(".sky-canvas")].filter(canvas => !canvas.hidden && canvas.offsetParent !== null);
  if (canvases.length === 0) {
    skyAnim.drawing = false;
    return;
  }
  const dt = Math.min(0.05, (now - skyAnim.last) / 1000);
  skyAnim.last = now;

  const mode = timerMode();
  if (mode === "focus" && !reduceMotion) skyAnim.rotation += dt * 0.012;   // one slow turn every ~9 minutes
  if ((mode === "short" || mode === "long") && now > skyAnim.nextShot) {
    skyShoot(now, "timer");
    skyAnim.nextShot = now + 4000 + Math.random() * 4000;
  }
  if (canvases.some(canvas => canvas.dataset.scene === "page") && !reduceMotion) {
    if (!skyAnim.nextPageShot) skyAnim.nextPageShot = now + 1800;
    if (now > skyAnim.nextPageShot) {
      skyShoot(now, "page");
      skyAnim.nextPageShot = now + 6000 + Math.random() * 9000;   // every 6 to 15 seconds
    }
  } else {
    skyAnim.nextPageShot = 0;
  }
  skyAnim.shooting = skyAnim.shooting.filter(s => now - s.start < s.life);
  skyAnim.sparks = skyAnim.sparks.filter(p => now - p.start < p.life);
  skyAnim.lit = skyAnim.lit.filter(l => now - l.start < 1200);

  canvases.forEach(canvas => drawSkyCanvas(canvas, now));
  requestAnimationFrame(skyFrame);
}

function startSky() {
  if (skyAnim.drawing) return;
  skyAnim.drawing = true;
  skyAnim.last = performance.now();
  requestAnimationFrame(skyFrame);
}



// ---------------------------------------------------------------
// The monthly quest reward: a badge to keep, and a bright star of your own
// that stays in your sky for good.
// ---------------------------------------------------------------
function awardQuest(month) {
  const [x, y] = freeSpot(false);
  sky.monthStars.push({ month: month, x: x, y: y });
  sky.badges.push({ month: month, date: todayISO() });
  sky.rewardPending = month;
  saveSky();
  skyAnim.monthStarBorn = { month: month, start: performance.now() + 1600 };
  playNotes([659.25, 783.99, 987.77, 1318.5, 1567.98], 0.14, 0.9, 0.1);
}

function shortMonth(month) {
  return fromISO(month + "-01").toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

// A round medal: gold rim, night-blue face, the month's star in the middle
// and five small stars around it for the five constellations.
function badgeSVG(month, size) {
  const id = "b" + month.replace("-", "") + size;
  const ring = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 72) * Math.PI / 180;
    return [50 + Math.cos(a) * 29, 46 + Math.sin(a) * 29];
  });
  const lines = ring.map((p, i) => { const q = ring[(i + 2) % 5]; return `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="#F5D892" stroke-opacity="0.22" stroke-width="0.8"></line>`; }).join("");
  const dots = ring.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.1" fill="#FBE7B0"></circle>`).join("");
  return `
    <svg class="badge-svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${monthName(month)} ${month.slice(0, 4)} badge">
      <defs>
        <radialGradient id="${id}f" cx="50%" cy="40%" r="62%"><stop offset="0" stop-color="#2A3C7E"></stop><stop offset="1" stop-color="#0A1128"></stop></radialGradient>
        <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCEBC0"></stop><stop offset="0.5" stop-color="#D9AE52"></stop><stop offset="1" stop-color="#FCEBC0"></stop></linearGradient>
        <radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#F5D892" stop-opacity="0.55"></stop><stop offset="1" stop-color="#F5D892" stop-opacity="0"></stop></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#${id}r)"></circle>
      <circle cx="50" cy="50" r="41" fill="url(#${id}f)"></circle>
      ${lines}${dots}
      <circle cx="50" cy="46" r="17" fill="url(#${id}g)"></circle>
      <path d="M50 33 Q51.6 44.4 63 46 Q51.6 47.6 50 59 Q48.4 47.6 37 46 Q48.4 44.4 50 33 Z" fill="#FFF6DD"></path>
      <text x="50" y="80" text-anchor="middle" font-family="Space Grotesk, system-ui, sans-serif" font-size="9.5" font-weight="600" letter-spacing="1.6" fill="#F5D892">${shortMonth(month)}</text>
    </svg>`;
}

function rewardHTML() {
  if (!sky.rewardPending) return "";
  const month = sky.rewardPending;
  const name = monthName(month);
  return `
    <section class="sky-reward" role="status">
      <div class="sky-reward-badge">${badgeSVG(month, 104)}</div>
      <div class="sky-reward-text">
        <span class="sky-reward-eyebrow">Quest complete</span>
        <h2 class="section-title">You earned the ${name} badge</h2>
        <p class="muted">Your reward: <strong>${name}'s Star</strong> now shines in your sky for good. Tap it any time.</p>
        <button class="btn btn--primary btn--small" type="button" data-sky="reward-ok">Nice</button>
      </div>
    </section>`;
}

function badgesHTML() {
  if (!sky.badges.length) return "";
  return `
    <section class="sky-badges" aria-label="Your badges">
      <h2 class="section-title">Badges</h2>
      <div class="sky-badge-row">
        ${sky.badges.map(b => `
          <figure class="sky-badge">
            ${badgeSVG(b.month, 68)}
            <figcaption>${monthName(b.month)} ${b.month.slice(0, 4)}</figcaption>
          </figure>`).join("")}
      </div>
    </section>`;
}

// The reward star: bigger and brighter than any other, with long rays.
function drawMonthStar(pen, view, ms, now, t, small) {
  const [x, y] = skyPoint(view, ms.x, ms.y);
  let grow = 1;
  const born = skyAnim.monthStarBorn && skyAnim.monthStarBorn.month === ms.month ? skyAnim.monthStarBorn : null;
  if (born && view.scene === "page") {
    const u = (now - born.start) / 1400;
    if (u < 0) return;
    if (u < 1) {
      grow = (1 - Math.pow(1 - u, 3)) + Math.sin(u * Math.PI) * 0.8;
      pen.strokeStyle = `rgba(245, 216, 146, ${0.6 * (1 - u)})`;
      pen.lineWidth = 1.2;
      pen.beginPath(); pen.arc(x, y, 10 + u * 70, 0, Math.PI * 2); pen.stroke();
    }
  }
  const pulse = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.1);
  pen.globalCompositeOperation = "lighter";
  skyGlow(pen, x, y, (small ? 18 : 46) * grow * pulse, "245, 216, 146", 0.32);
  pen.globalCompositeOperation = "source-over";
  skyStar(pen, x, y, (small ? 2.2 : 3.4) * grow, "245, 216, 146", 1.3 * pulse, (small ? 0.9 : 1.7) * grow);
  if (small) return;
  pen.font = `500 ${Math.max(10, Math.round(view.W / 50))}px "Space Grotesk", system-ui, sans-serif`;
  pen.fillStyle = "rgba(245, 216, 146, 0.8)";
  skySpaced(pen, `${shortMonth(ms.month)} STAR`, x, y + 30, 2);
}
