// Neon Bay — pedestrians: sidewalk walkers who flee from gunfire and
// explosions, and get knocked down when a car hits them.

import { WORLD, clamp } from './config.js';
import { pick, range } from './random.js';
import { resolveBuildingCollision, onRoad } from './city.js';

const SHIRTS = ['#d95f4f', '#4f8fd9', '#e8d44d', '#7fd94f', '#d94f9b', '#e8e8e8', '#8a6fd9', '#4fd9c8'];
const SKINS = ['#f2c89b', '#d9a066', '#a06a3b', '#8a5a2e', '#f2d5b0'];

let nextPedId = 1;

export function makePed(x, y, rng) {
  return {
    id: nextPedId++,
    x, y,
    angle: rng() * Math.PI * 2,
    speed: range(rng, 45, 75),
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    state: 'walk', // 'walk' | 'flee' | 'down'
    stateT: 0,
    wanderT: range(rng, 1, 4),
    dead: false,
  };
}

export function updatePeds(peds, city, player, danger, dt, rng) {
  for (const p of peds) {
    if (p.state === 'down') {
      p.stateT -= dt;
      if (p.stateT <= 0) p.state = 'walk';
      continue;
    }
    // Flee from nearby danger (gunfire, explosions, speeding cars).
    if (danger && Math.hypot(p.x - danger.x, p.y - danger.y) < danger.r) {
      p.state = 'flee';
      p.stateT = range(rng, 2, 4);
      p.angle = Math.atan2(p.y - danger.y, p.x - danger.x) + range(rng, -0.5, 0.5);
    }
    if (p.state === 'flee') {
      p.stateT -= dt;
      if (p.stateT <= 0) p.state = 'walk';
    }
    p.wanderT -= dt;
    if (p.wanderT <= 0) {
      p.wanderT = range(rng, 2, 5);
      if (p.state === 'walk') p.angle += range(rng, -1.2, 1.2);
    }
    // Prefer sidewalks: a pedestrian caught on a road hurries to the
    // nearest edge instead of strolling down the middle of it.
    if (p.state === 'walk' && onRoad(city, p.x, p.y)) {
      let bestD = Infinity;
      let bestAxis = 'x';
      let bestC = 0;
      for (const c of city.roads) {
        const dx = Math.abs(p.x - c);
        const dy = Math.abs(p.y - c);
        if (dx < bestD) { bestD = dx; bestAxis = 'x'; bestC = c; }
        if (dy < bestD) { bestD = dy; bestAxis = 'y'; bestC = c; }
      }
      if (bestAxis === 'x') p.angle = p.x < bestC ? Math.PI : 0;
      else p.angle = p.y < bestC ? -Math.PI / 2 : Math.PI / 2;
    }
    const sp = p.state === 'flee' ? 210 : p.speed;
    p.x += Math.cos(p.angle) * sp * dt;
    p.y += Math.sin(p.angle) * sp * dt;
    resolveBuildingCollision(city, p, 10);
    // Keep peds inside the world and off the deep beach water line.
    p.x = clamp(p.x, 10, WORLD.width - 10);
    p.y = clamp(p.y, 10, WORLD.height - 10);
  }
}

export function knockPedDown(p, rng) {
  p.state = 'down';
  p.stateT = range(rng, 3, 6);
}

// Keep pedestrians populated near the player.
export function maintainPeds(city, peds, player, rng, dt, state) {
  state.pedTimer -= dt;
  if (state.pedTimer > 0) return;
  state.pedTimer = 0.5;
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (Math.hypot(p.x - player.x, p.y - player.y) > 1200) peds.splice(i, 1);
  }
  const target = 22;
  let tries = 0;
  while (peds.length < target && tries++ < 8) {
    const a = rng() * Math.PI * 2;
    const d = range(rng, 250, 900);
    const x = player.x + Math.cos(a) * d;
    const y = player.y + Math.sin(a) * d;
    if (x < 20 || y < 20 || x > WORLD.width - 20 || y > WORLD.height - 20) continue;
    if (onRoad(city, x, y)) continue; // spawn on sidewalks, not asphalt
    peds.push(makePed(x, y, rng));
  }
}

// A car hitting a pedestrian. Returns the peds hit this frame.
export function carHitsPeds(car, peds, speed, rng) {
  const hit = [];
  if (Math.abs(speed) < 40) return hit;
  for (const p of peds) {
    if (p.state === 'down') continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    if (dx * dx + dy * dy < 30 * 30) {
      knockPedDown(p, rng);
      p.x += dx * 0.4;
      p.y += dy * 0.4;
      hit.push(p);
    }
  }
  return hit;
}
