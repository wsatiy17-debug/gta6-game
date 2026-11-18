// Neon Bay — the game itself: state, the loop, the player, camera, HUD wiring
// and the glue between city, cars, police, combat and missions.

import { WORLD, PLAYER, CAR, clamp, formatMoney } from './config.js';
import { makeRng } from './random.js';
import { generateCity, resolveBuildingCollision } from './city.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Renderer } from './render.js';
import { MissionManager } from './missions.js';
import {
  makeCar, drivePlayerCar, updateTrafficCar, collideCars, damageCar,
  maintainTraffic, maintainParked, nearestCar,
} from './vehicles.js';
import { updatePeds, maintainPeds, carHitsPeds } from './pedestrians.js';
import { addWanted, updatePoliceCars, updateFootCops, updateEvade } from './police.js';
import { makeBullet, updateBullets, punch } from './combat.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { shotParams, applyShotScene } from './shots.js';

const $ = (id) => document.getElementById(id);

function makePlayer(x, y) {
  return {
    x, y, angle: 0, vx: 0, vy: 0, kx: 0, ky: 0,
    health: 100, money: 250,
    inCar: false, car: null,
    shootT: 0, punchT: 0,
  };
}

function createState(seed) {
  const canvas = $('game-canvas');
  const state = {
    time: 0,
    mode: 'menu', // 'menu' | 'playing' | 'paused' | 'brief' | 'wasted' | 'busted'
    seed,
    rng: makeRng(seed),
    city: generateCity(seed),
    input: new Input(canvas),
    audio: new AudioSys(),
    renderer: new Renderer(canvas, $('minimap')),
    player: null,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    wanted: 0,
    evadeT: 0,
    evading: false,
    arrestProgress: 0,
    danger: null,
    shotWantedT: 0,
    crashDmgT: 0,
    camera: { x: WORLD.width / 2, y: WORLD.height / 2 },
    trafficTimer: 0,
    pedTimer: 0,
    saveTimer: 0,
    toastT: 0,
    stats: { earned: 0, carsStolen: 0 },
    missions: null,
  };

  state.player = makePlayer(0, 0);
  const bar = state.city.landmarks.veraBar;
  state.player.x = bar.x + 120;
  state.player.y = bar.y + 120;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.missions = new MissionManager(state);

  // Methods other modules call back into.
  state.toast = (text, color) => showToast(state, text, color);
  state.showBrief = (mission) => showBrief(state, mission);
  state.addWanted = (n, reason) => addWanted(state, n, reason);
  state.damagePlayer = (n) => damagePlayer(state, n);
  state.busted = () => endRun(state, 'busted');
  state.save = () => saveGame(state);
  state.spawnBullet = (x, y, angle, fromPlayer) => {
    state.bullets.push(makeBullet(x, y, angle, fromPlayer));
  };
  state.spawnParticles = (x, y, n, color, speed) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5, maxLife: 0.9,
        color, size: 3 + Math.random() * 4,
      });
    }
  };
  state.spawnParkedCar = (x, y, type, color) => {
    const car = makeCar(x, y, 0, type, { driver: 'parked' });
    if (color) car.color = color;
    state.cars.push(car);
    return car;
  };
  return state;
}

// --- overlays and HUD ---------------------------------------------------------

function showToast(state, text, color) {
  const el = $('toast');
  el.textContent = text;
  el.style.color = color || '#ffffff';
  el.style.opacity = '1';
  state.toastT = 3.5;
}

function showBrief(state, mission) {
  state.mode = 'brief';
  $('brief-title').textContent = mission.name;
  $('brief-text').textContent = mission.brief;
  $('brief-pay').textContent = `Payout: ${formatMoney(mission.pay)}`;
  $('brief').classList.remove('hidden');
}

function hideBrief(state) {
  $('brief').classList.add('hidden');
  state.mode = 'playing';
}

function updateHUD(state) {
  const p = state.player;
  // Stars.
  const stars = document.querySelectorAll('#hud-stars .star');
  stars.forEach((s, i) => s.classList.toggle('lit', i < state.wanted));
  $('hud-stars').style.visibility = state.wanted > 0 ? 'visible' : 'hidden';
  // Health.
  $('health-fill').style.width = clamp(p.health, 0, 100) + '%';
  $('health-fill').style.background = p.health > 30 ? '#7fd94f' : '#ff5a5a';
  // Money.
  $('money').textContent = formatMoney(p.money);
  // Speed.
  if (p.inCar && p.car) {
    $('speed').classList.remove('hidden');
    $('speed-value').textContent = Math.round(Math.abs(p.car.speed) * 0.55);
  } else {
    $('speed').classList.add('hidden');
  }
  // Objective.
  $('objective').textContent = state.missions.objectiveLabel();
  // Evading indicator.
  $('evade').style.visibility = state.evading && state.wanted > 0 ? 'visible' : 'hidden';
  // Arrest progress.
  const arrest = $('arrest');
  if (state.arrestProgress > 0.02 && state.wanted > 0) {
    arrest.classList.remove('hidden');
    $('arrest-fill').style.width = Math.round(state.arrestProgress * 100) + '%';
  } else {
    arrest.classList.add('hidden');
  }
  // Toast fade.
  if (state.toastT > 0) {
    state.toastT -= 1 / 60;
    if (state.toastT <= 0) $('toast').style.opacity = '0';
  }
}

// --- player -------------------------------------------------------------------

function updatePlayerOnFoot(state, dt) {
  const p = state.player;
  const input = state.input;
  let mx = 0;
  let my = 0;
  if (input.down('KeyW', 'ArrowUp')) my -= 1;
  if (input.down('KeyS', 'ArrowDown')) my += 1;
  if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.down('KeyD', 'ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my);
  const sprint = input.down('ShiftLeft', 'ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (len > 0) {
    p.vx = (mx / len) * speed;
    p.vy = (my / len) * speed;
  } else {
    p.vx = 0;
    p.vy = 0;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  resolveBuildingCollision(state.city, p, PLAYER.radius);
  // Don't walk through cars. A fast car knocks the player down instead of
  // bulldozing them along: damage plus a knockback impulse.
  for (const c of state.cars) {
    if (c.dead) continue;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 26 * 26 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      p.x = c.x + nx * 26;
      p.y = c.y + ny * 26;
      if (Math.abs(c.speed) > 150 && state.crashDmgT <= 0) {
        state.crashDmgT = 0.8;
        damagePlayer(state, 10);
        p.kx = nx * 320;
        p.ky = ny * 320;
        c.speed *= 0.6;
      }
    }
  }
  // Knockback impulse decays.
  if (p.kx || p.ky) {
    p.x += (p.kx || 0) * dt;
    p.y += (p.ky || 0) * dt;
    p.kx = (p.kx || 0) * (1 - 6 * dt);
    p.ky = (p.ky || 0) * (1 - 6 * dt);
    if (Math.abs(p.kx) < 5) p.kx = 0;
    if (Math.abs(p.ky) < 5) p.ky = 0;
    resolveBuildingCollision(state.city, p, PLAYER.radius);
  }
  // Face movement, or the mouse while shooting.
  if (input.mouseDown) {
    const wx = state.camera.x - state.renderer.viewW / 2 + input.mouseX;
    const wy = state.camera.y - state.renderer.viewH / 2 + input.mouseY;
    p.angle = Math.atan2(wy - p.y, wx - p.x);
  } else if (len > 0) {
    p.angle = Math.atan2(p.vy, p.vx);
  }

  // Enter a car.
  if (input.justPressed('KeyE')) enterCar(state);
  // Punch.
  p.punchT -= dt;
  if (input.justPressed('KeyF') && p.punchT <= 0) {
    p.punchT = 0.4;
    punch(state);
  }
  // Shoot.
  p.shootT -= dt;
  if (input.mouseDown && p.shootT <= 0) {
    p.shootT = PLAYER.shootCooldown;
    const wx = state.camera.x - state.renderer.viewW / 2 + input.mouseX;
    const wy = state.camera.y - state.renderer.viewH / 2 + input.mouseY;
    const a = Math.atan2(wy - p.y, wx - p.x);
    const gx = p.x + Math.cos(a) * 20;
    const gy = p.y + Math.sin(a) * 20;
    state.spawnBullet(gx, gy, a, true);
    state.spawnParticles(gx, gy, 3, '#ffe27a', 160);
    state.audio.gunshot();
    state.danger = { x: p.x, y: p.y, r: 380, t: 2 };
    // Shots fired in sight of the law draw heat (throttled).
    if (state.shotWantedT <= 0) {
      const copNear = state.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 420) ||
        state.cars.some((c) => c.isPolice && !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 500);
      if (copNear) {
        state.addWanted(1, 'SHOTS FIRED');
        state.shotWantedT = 8;
      }
    }
  }
}

function enterCar(state) {
  const p = state.player;
  const car = nearestCar(state.cars, p.x, p.y, PLAYER.enterRadius);
  if (!car) return;
  if (!car.stolen && car.driver !== 'player') {
    car.stolen = true;
    state.stats.carsStolen++;
    state.addWanted(car.isPolice ? 2 : 1, 'CAR STOLEN');
  }
  car.driver = 'player';
  car.isPlayer = true;
  p.inCar = true;
  p.car = car;
  state.audio.click();
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 34;
  p.y = car.y + Math.sin(side) * 34;
  resolveBuildingCollision(state.city, p, PLAYER.radius);
  p.inCar = false;
  p.car = null;
  car.isPlayer = false;
  car.driver = 'parked';
  state.audio.click();
}

function updatePlayerInCar(state, dt) {
  const p = state.player;
  const car = p.car;
  if (!car) {
    p.inCar = false;
    return;
  }
  drivePlayerCar(car, state.input, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  if (state.input.justPressed('KeyE')) exitCar(state);
  if (state.input.justPressed('KeyH')) state.audio.horn();

  // Tire smoke on handbrake or hard cornering.
  const steering = state.input.down('KeyA', 'ArrowLeft') || state.input.down('KeyD', 'ArrowRight');
  if ((state.input.down('Space') || steering) && Math.abs(car.speed) > 260) {
    const bx = car.x - Math.cos(car.angle) * 18;
    const by = car.y - Math.sin(car.angle) * 18;
    state.spawnParticles(bx, by, 2, 'rgba(200,200,200,0.7)', 40);
  }

  // Running over pedestrians.
  const hit = carHitsPeds(car, state.peds, car.speed, state.rng);
  for (const ped of hit) {
    state.addWanted(2, 'PEDESTRIAN HIT');
    state.audio.crash(0.4);
    state.danger = { x: ped.x, y: ped.y, r: 300, t: 2 };
  }

  // Damage smoke / fire.
  if (!car.dead && car.health < 55) {
    car.smoke -= dt;
    if (car.smoke <= 0) {
      car.smoke = car.health < 25 ? 0.05 : 0.12;
      const hx = car.x + Math.cos(car.angle) * 16;
      const hy = car.y + Math.sin(car.angle) * 16;
      state.spawnParticles(hx, hy, 1, car.health < 25 ? '#ff7a2e' : 'rgba(120,120,120,0.8)', 30);
    }
  }
}

function damagePlayer(state, n) {
  const p = state.player;
  if (state.mode !== 'playing') return;
  p.health -= n;
  if (p.health <= 0) {
    p.health = 0;
    endRun(state, 'wasted');
  }
}

function endRun(state, kind) {
  state.mode = kind;
  state.audio.setEngine(false, 0);
  if (kind === 'wasted') {
    $('end-title').textContent = 'WASTED';
    $('end-text').textContent = 'Kai got taken out. The hospital patched you up — minus a little cash.';
    state.player.money = Math.max(0, state.player.money * 0.9);
  } else {
    $('end-title').textContent = 'BUSTED';
    $('end-text').textContent = 'Neon Bay PD caught you. Bail set you back — the streets are waiting.';
    state.audio.busted();
    state.player.money = Math.max(0, state.player.money - 500);
  }
  $('end').classList.remove('hidden');
  state.save();
}

function respawn(state) {
  const p = state.player;
  $('end').classList.add('hidden');
  const spot = state.mode === 'wasted'
    ? state.city.landmarks.hospital
    : state.city.landmarks.policeStation;
  if (p.car) {
    p.car.isPlayer = false;
    if (p.car.driver === 'player') p.car.driver = 'parked';
    p.car = null;
  }
  p.inCar = false;
  p.x = spot.x + 80;
  p.y = spot.y + 80;
  p.health = 100;
  state.wanted = 0;
  state.evadeT = 0;
  state.cops.length = 0;
  state.camera.x = p.x;
  state.camera.y = p.y;
  state.mode = 'playing';
  state.save();
}

function explodeCar(state, car) {
  car.exploded = true;
  state.spawnParticles(car.x, car.y, 34, '#ff7a2e', 260);
  state.spawnParticles(car.x, car.y, 20, '#ffcf5a', 180);
  state.spawnParticles(car.x, car.y, 14, 'rgba(90,90,90,0.8)', 90);
  state.audio.explosion();
  state.danger = { x: car.x, y: car.y, r: 500, t: 3 };
  const p = state.player;
  if (p.inCar && p.car === car) {
    p.inCar = false;
    p.car = null;
    car.isPlayer = false;
    p.x = car.x + 40;
    p.y = car.y + 40;
    damagePlayer(state, 35);
  } else if (Math.hypot(p.x - car.x, p.y - car.y) < 130) {
    damagePlayer(state, 30);
  }
  for (const o of state.cars) {
    if (o !== car && !o.dead && Math.hypot(o.x - car.x, o.y - car.y) < 120) {
      damageCar(o, 45);
    }
  }
  if (state.mode === 'playing') state.addWanted(1, 'EXPLOSION');
}

// --- update -------------------------------------------------------------------

function update(state, dt) {
  const p = state.player;
  state.time += dt;
  state.shotWantedT -= dt;
  if (state.danger) {
    state.danger.t -= dt;
    if (state.danger.t <= 0) state.danger = null;
  }

  // Pause.
  if (state.input.justPressed('KeyP') || state.input.justPressed('Escape')) {
    setPaused(state, true);
    return;
  }
  if (state.input.justPressed('KeyM')) {
    state.audio.setMuted(!state.audio.muted);
    state.toast(state.audio.muted ? 'SOUND OFF' : 'SOUND ON', '#ffffff');
  }

  if (p.inCar) updatePlayerInCar(state, dt);
  else updatePlayerOnFoot(state, dt);

  for (const c of state.cars) {
    if (c.driver === 'traffic') updateTrafficCar(c, state.city, state.cars, p, dt, state.rng);
  }
  updatePoliceCars(state, dt);
  updateFootCops(state, dt);
  updateEvade(state, dt);
  updatePeds(state.peds, state.city, p, state.danger, dt, state.rng);
  updateBullets(state, dt);
  state.missions.update(dt);

  collideCars(state.cars, state.city, (car, impact) => {
    if (car.isPlayer || (p.inCar && p.car === car)) {
      state.audio.crash(impact / 500);
      state.spawnParticles(car.x, car.y, 5, '#ffd76a', 140);
      // Crash damage is throttled: a pile-up must not insta-kill the player.
      state.crashDmgT -= dt;
      if (impact > 350 && state.crashDmgT <= 0) {
        state.crashDmgT = 0.7;
        damagePlayer(state, Math.min(8, impact * 0.02));
      }
    }
  }, dt);

  // Explosions for newly wrecked cars.
  for (const c of state.cars) {
    if (c.dead && !c.exploded) explodeCar(state, c);
  }
  // Remove wrecks far from the player.
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const c = state.cars[i];
    if (c.dead && Math.hypot(c.x - p.x, c.y - p.y) > 900) state.cars.splice(i, 1);
  }

  maintainTraffic(state.city, state.cars, p, state.rng, dt, state);
  maintainParked(state.city, state.cars, p, state.rng);
  maintainPeds(state.city, state.peds, p, state.rng, dt, state);
  updateParticles(state, dt);
  updateCamera(state, dt);

  // Health regen after a quiet spell.
  if (p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + dt * 1.5);

  // Audio.
  const speedRatio = p.inCar && p.car ? Math.abs(p.car.speed) / p.car.spec.top : 0;
  state.audio.setEngine(p.inCar, speedRatio);
  const nearestCop = nearestCopDist(state);
  state.audio.updateSiren(dt, state.wanted > 0, nearestCop < 500);
  state.audio.updateMusic(dt);

  // Autosave.
  state.saveTimer -= dt;
  if (state.saveTimer <= 0) {
    state.saveTimer = 10;
    saveGame(state);
  }
}

function nearestCopDist(state) {
  let best = Infinity;
  for (const c of state.cars) {
    if (c.isPolice && !c.dead) best = Math.min(best, Math.hypot(c.x - state.player.x, c.y - state.player.y));
  }
  return best;
}

function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2 * dt;
    pt.vy *= 1 - 2 * dt;
  }
}

function updateCamera(state, dt) {
  const p = state.player;
  const k = 1 - Math.exp(-4.5 * dt);
  state.camera.x += (p.x - state.camera.x) * k;
  state.camera.y += (p.y - state.camera.y) * k;
  const vw = state.renderer.viewW / 2;
  const vh = state.renderer.viewH / 2;
  state.camera.x = clamp(state.camera.x, Math.min(vw, WORLD.width / 2), Math.max(WORLD.width - vw, WORLD.width / 2));
  state.camera.y = clamp(state.camera.y, Math.min(vh, WORLD.height / 2), Math.max(WORLD.height - vh, WORLD.height / 2));
}

function updateAmbient(state, dt) {
  // Menu backdrop: a living city behind the title screen.
  state.time += dt;
  const cx = WORLD.width / 2 + Math.cos(state.time * 0.05) * 500;
  const cy = WORLD.height / 2 + Math.sin(state.time * 0.04) * 500;
  state.camera.x += (cx - state.camera.x) * dt * 0.5;
  state.camera.y += (cy - state.camera.y) * dt * 0.5;
  const ghost = { x: state.camera.x, y: state.camera.y, inCar: false };
  for (const c of state.cars) {
    if (c.driver === 'traffic') updateTrafficCar(c, state.city, state.cars, ghost, dt, state.rng);
  }
  updatePeds(state.peds, state.city, ghost, null, dt, state.rng);
  maintainTraffic(state.city, state.cars, ghost, state.rng, dt, state);
  maintainPeds(state.city, state.peds, ghost, state.rng, dt, state);
  updateParticles(state, dt);
}

function setPaused(state, paused) {
  if (paused && state.mode === 'playing') {
    state.mode = 'paused';
    $('pause').classList.remove('hidden');
    state.audio.setEngine(false, 0);
  } else if (!paused && state.mode === 'paused') {
    state.mode = 'playing';
    $('pause').classList.add('hidden');
  }
}

// --- boot -----------------------------------------------------------------------

function seedWorld(state) {
  // A few cars and peds around the spawn so the city feels alive at once.
  const p = state.player;
  state.trafficTimer = 0;
  maintainTraffic(state.city, state.cars, p, state.rng, 1, state);
  state.pedTimer = 0;
  maintainPeds(state.city, state.peds, p, state.rng, 1, state);
  for (let i = 0; i < 4; i++) maintainParked(state.city, state.cars, p, state.rng);
}

function newGame(state) {
  const p = state.player;
  const bar = state.city.landmarks.veraBar;
  p.x = bar.x + 120;
  p.y = bar.y + 120;
  p.health = 100;
  p.money = 250;
  p.inCar = false;
  p.car = null;
  state.wanted = 0;
  state.missions.done = 0;
  state.missions.active = null;
  state.stats = { earned: 0, carsStolen: 0 };
  state.camera.x = p.x;
  state.camera.y = p.y;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state.mode = 'playing';
  state.audio.ensure();
  showToast(state, 'Welcome to Neon Bay — go see Vera at The Sunset Bar', '#ffd76a');
  saveGame(state);
}

function continueGame(state) {
  const data = loadGame();
  if (!data) return;
  const p = state.player;
  p.money = data.money;
  p.health = data.health;
  p.x = data.x;
  p.y = data.y;
  p.inCar = false;
  p.car = null;
  state.missions.done = data.missionsDone;
  state.stats.earned = data.earned;
  state.audio.setMuted(!!data.muted);
  state.camera.x = p.x;
  state.camera.y = p.y;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state.mode = 'playing';
  state.audio.ensure();
  showToast(state, 'Welcome back to Neon Bay', '#ffd76a');
}

function main() {
  const { shot, seed } = shotParams();
  const state = createState(seed);
  seedWorld(state);

  // Menu buttons.
  $('menu-start').addEventListener('click', () => {
    state.audio.ensure();
    state.audio.click();
    newGame(state);
  });
  if (hasSave()) {
    $('menu-continue').classList.remove('hidden');
    $('menu-continue').addEventListener('click', () => {
      state.audio.ensure();
      state.audio.click();
      continueGame(state);
    });
  }
  // Pause buttons.
  $('pause-resume').addEventListener('click', () => setPaused(state, false));
  $('pause-restart').addEventListener('click', () => {
    $('pause').classList.add('hidden');
    newGame(state);
  });
  $('pause-mute').addEventListener('click', () => {
    state.audio.setMuted(!state.audio.muted);
    $('pause-mute').textContent = state.audio.muted ? 'Unmute (M)' : 'Mute (M)';
  });
  $('pause-menu-btn').addEventListener('click', () => {
    $('pause').classList.add('hidden');
    $('hud').classList.add('hidden');
    state.mode = 'menu';
    $('menu').classList.remove('hidden');
  });
  // Brief + end screens.
  $('brief-go').addEventListener('click', () => {
    state.audio.click();
    hideBrief(state);
  });
  $('end-retry').addEventListener('click', () => respawn(state));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && (state.mode === 'wasted' || state.mode === 'busted')) respawn(state);
    if (e.code === 'Enter' && state.mode === 'brief') hideBrief(state);
    if (e.code === 'Enter' && state.mode === 'menu') {
      state.audio.ensure();
      newGame(state);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame(state);
  });
  window.addEventListener('pagehide', () => saveGame(state));

  // Screenshot scenes (?shot=...) start the game in a staged moment.
  if (shot) {
    applyShotScene(state, shot);
    if (state.mode === 'playing') {
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
    }
  }

  // Debug hook for automated play-testing (read-only game state).
  window.__neonBay = state;

  let lastT = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    if (state.mode === 'playing') update(state, dt);
    else if (state.mode === 'menu') updateAmbient(state, dt);
    state.renderer.draw(state);
    if (state.mode === 'playing' || state.mode === 'paused' || state.mode === 'brief') {
      updateHUD(state);
    }
    state.input.endFrame();
  }
  requestAnimationFrame(frame);
}

main();
