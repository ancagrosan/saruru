const canvas = document.getElementById("salt");
const ctx = canvas.getContext("2d");
const hand = document.getElementById("hand");
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

// Layout as fractions of the viewport. tipX/tipY: where the fingertips are.
// waterTop: where the water starts. fadeFrom/fadeTo: how the water fades in from the left.
// handWidth: hand size in px, as a fraction of the viewport width with a max.
const LAYOUT = {
  wide: {
    tipX: 0.72,
    tipY: 0.34,
    waterTop: 0.82,
    fadeFrom: 0.3,
    fadeTo: 0.68,
    handWidth: [0.34, 520],
  },
  narrow: {
    tipX: 0.42,
    tipY: 0.5,
    waterTop: 0.84,
    fadeFrom: 0.2,
    fadeTo: 0.6,
    handWidth: [0.95, 420],
  },
};

// assets/hand.svg: where the salt leaves the fingertips (SVG units, from the comment at the
// top of the file), and how many SVG units wide the drawn hand is (arm excluded) for sizing.
const HAND = { tip: { x: 39.6, y: 99.4 }, drawnWidth: 560 };

const CONFIG = {
  startDelaySeconds: 0.7, // the hand slides in first, then the salt starts
  rampSeconds: 0.5,
  grainsPerFrame: 12,
  gravity: 0.35,
  maxFallSpeed: 13,
  fan: 0.8, // sideways spread of the pour
  drift: -0.3, // leans left, away from the hand
  rippleChance: 0.005,
  maxRipples: 14,
  rippleSeconds: 2.6,
};

let width, height, dpr, layout, tipX, tipY, waterTop;
let grains, ripples, elapsed, lastTime, rafId;

// Roughly normal distribution in [-1, 1].
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// Sizes the hand and moves it so its fingertips sit exactly on (tipX, tipY).
function placeHand() {
  if (!hand.naturalWidth) return; // image not loaded (yet)
  const [fraction, max] = layout.handWidth;
  const scale = Math.min(width * fraction, max) / HAND.drawnWidth;
  hand.style.width = `${hand.naturalWidth * scale}px`;
  hand.style.height = `${hand.naturalHeight * scale}px`;
  hand.style.left = `${tipX - HAND.tip.x * scale}px`;
  hand.style.top = `${tipY - HAND.tip.y * scale}px`;
}

function init() {
  cancelAnimationFrame(rafId);
  dpr = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  layout = width < 700 ? LAYOUT.narrow : LAYOUT.wide;
  tipX = width * layout.tipX;
  tipY = height * layout.tipY;
  waterTop = height * layout.waterTop;
  placeHand();

  grains = [];
  ripples = [];
  elapsed = reduceMotion ? CONFIG.rampSeconds : -CONFIG.startDelaySeconds;
  lastTime = performance.now();

  if (reduceMotion) {
    for (let i = 0; i < 200; i++) update(1);
    draw();
  } else {
    rafId = requestAnimationFrame(frame);
  }
}

// The pour is not perfectly even: it swells and thins a little.
function pourRate() {
  const ramp = Math.min(1, Math.max(0, elapsed / CONFIG.rampSeconds));
  const swell = 0.7 + 0.2 * Math.sin(elapsed * 3.1) + 0.1 * Math.sin(elapsed * 7.3);
  return CONFIG.grainsPerFrame * ramp * swell;
}

function spawnGrains(dt) {
  const count = Math.round(pourRate() * dt + Math.random());
  for (let i = 0; i < count && elapsed >= 0; i++) {
    const z = 0.7 + Math.random() * 0.3; // grain "weight": smaller grains are slower
    grains.push({
      x: tipX + gauss() * 3,
      y: tipY + 4,
      vx: gauss() * CONFIG.fan + CONFIG.drift,
      vy: 3 + Math.random() * 2,
      z,
      r: (1.1 + Math.random() * 1.4) * z,
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
    g.vy = Math.min(g.vy + CONFIG.gravity * dt, CONFIG.maxFallSpeed * g.z);
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

  fillGrains(air, COLORS.ink, 0.18, 0.4, 1.2, 0.3); // soft shadow
  fillGrains(air, COLORS.ink, 0.35, 0, 0, 0.6); // thin outline keeps each grain distinct
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

// Start once the hand image is ready, so it can be measured.
if (hand.complete) init();
else {
  hand.addEventListener("load", init, { once: true });
  hand.addEventListener("error", init, { once: true });
}
