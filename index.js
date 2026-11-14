const canvas = document.getElementById("salt");
const ctx = canvas.getContext("2d");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;

// Colors come from main.css, so there is a single source of truth.
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const COLORS = {
  bg: color("--tatami"),
  water: color("--tatami-dark"),
  ink: color("--ink"),
  salt: color("--salt"),
};

// Layout as fractions of the viewport: where the stream falls, where the water
// starts (from the top), and how far the water fades in from the left.
const LAYOUT = {
  wide: { streamX: 0.76, waterTop: 0.82, fadeFrom: 0.3, fadeTo: 0.68 },
  narrow: { streamX: 0.78, waterTop: 0.84, fadeFrom: 0.2, fadeTo: 0.6 },
};

const CONFIG = {
  grainsPerFrame: 9,
  rampSeconds: 1.6,
  gravity: 0.22,
  maxFallSpeed: 11,
  rippleChance: 0.008,
  maxRipples: 14,
  rippleSeconds: 2.6,
};

let width, height, dpr, layout, streamX, waterTop;
let grains, ripples, elapsed, lastTime, rafId;

// Roughly normal distribution in [-1, 1].
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function init() {
  cancelAnimationFrame(rafId);
  dpr = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  layout = width < 700 ? LAYOUT.narrow : LAYOUT.wide;
  streamX = width * layout.streamX;
  waterTop = height * layout.waterTop;

  grains = [];
  ripples = [];
  elapsed = reduceMotion ? CONFIG.rampSeconds : 0;
  lastTime = performance.now();

  if (reduceMotion) {
    for (let i = 0; i < 200; i++) update(1);
    draw();
  } else {
    rafId = requestAnimationFrame(frame);
  }
}

function spawnGrains(dt) {
  const ramp = Math.min(1, elapsed / CONFIG.rampSeconds);
  const count = Math.round(CONFIG.grainsPerFrame * ramp * dt + Math.random());
  for (let i = 0; i < count; i++) {
    grains.push({
      x: streamX + gauss() * 9,
      y: -8,
      vx: gauss() * 0.14,
      vy: 2 + Math.random() * 2,
      r: 1.3 + Math.random() * 1.5,
      depth: 8 + Math.random() * 20, // how far it sinks before vanishing
    });
  }
}

// Removes item i by swapping in the last one (order does not matter).
function removeAt(list, i) {
  list[i] = list[list.length - 1];
  list.pop();
}

function update(dt) {
  spawnGrains(dt);

  for (let i = grains.length - 1; i >= 0; i--) {
    const g = grains[i];
    g.vy = Math.min(g.vy + CONFIG.gravity * dt, CONFIG.maxFallSpeed);
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (g.y < waterTop + g.depth) continue;

    if (Math.random() < CONFIG.rippleChance && ripples.length < CONFIG.maxRipples) {
      ripples.push({ x: g.x, y: g.y, age: 0, maxRadius: 55 + Math.random() * 55 });
    }
    removeAt(grains, i);
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].age += dt / 60;
    if (ripples[i].age >= CONFIG.rippleSeconds) removeAt(ripples, i);
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 16.67, 3); // 1 = one frame at 60fps
  lastTime = now;
  elapsed += dt / 60;
  update(dt);
  draw();
  rafId = requestAnimationFrame(frame);
}

// Horizontal gradient from the page color to `to`, across the water's fade zone.
function fadeIn(to) {
  const gradient = ctx.createLinearGradient(width * layout.fadeFrom, 0, width * layout.fadeTo, 0);
  gradient.addColorStop(0, COLORS.bg);
  gradient.addColorStop(1, to);
  return gradient;
}

function drawWater() {
  ctx.fillStyle = fadeIn(COLORS.water);
  ctx.fillRect(0, waterTop, width, height - waterTop);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = fadeIn(COLORS.salt);
  ctx.fillRect(0, waterTop, width, 1);
  ctx.globalAlpha = 1;
}

function ring(x, y, radius, alpha) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.28, 0, 0, TAU); // a circle seen at an angle
  ctx.stroke();
}

function drawRipples() {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, waterTop, width, height - waterTop);
  ctx.clip();
  ctx.strokeStyle = COLORS.salt;
  ctx.lineWidth = 1.3;
  for (const r of ripples) {
    const progress = r.age / CONFIG.rippleSeconds;
    const radius = r.maxRadius * (1 - (1 - progress) ** 2); // ease-out
    const alpha = (1 - progress) ** 1.6;
    ring(r.x, r.y, radius, alpha * 0.9);
    ring(r.x, r.y, radius * 0.6, alpha * 0.5);
  }
  ctx.restore();
}

// Fills all grains in `list` as one path (fast). dx/dy/grow offset and enlarge them.
function fillGrains(list, fill, alpha, dx = 0, dy = 0, grow = 0) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const g of list) {
    ctx.moveTo(g.x + dx + g.r + grow, g.y + dy);
    ctx.arc(g.x + dx, g.y + dy, g.r + grow, 0, TAU);
  }
  ctx.fill();
}

function drawGrains() {
  const air = grains.filter((g) => g.y <= waterTop);
  const sinking = grains.filter((g) => g.y > waterTop);

  fillGrains(air, COLORS.ink, 0.22, 0.5, 1.2, 0.3); // soft shadow keeps grains distinct
  fillGrains(air, COLORS.salt, 1);

  for (const g of sinking) {
    fillGrains([g], COLORS.salt, Math.max(0, 1 - (g.y - waterTop) / g.depth));
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawWater();
  drawRipples();
  drawGrains();
}

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(init, 200);
});

init();
