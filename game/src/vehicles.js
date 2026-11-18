// Neon Bay — cars: arcade physics, traffic AI, spawning and damage.
// One model drives the player's car, traffic and police cars.

import { WORLD, CAR, COLORS, clamp, angleLerp, dist2 } from './config.js';
import { makeRng, pick, range } from './random.js';
import { onRoad, nearestRoadPoint, randomRoadPointNear, collideBuildings, resolveBuildingCollision } from './city.js';

export const CAR_TYPES = {
  sedan: { w: 46, h: 24, top: 470, accel: 1.0, grip: 1.0 },
  taxi: { w: 46, h: 24, top: 470, accel: 1.0, grip: 1.0 },
  sports: { w: 48, h: 23, top: 560, accel: 1.35, grip: 1.15 },
  truck: { w: 56, h: 26, top: 400, accel: 0.8, grip: 0.9 },
  van: { w: 52, h: 26, top: 420, accel: 0.85, grip: 0.9 },
  police: { w: 47, h: 24, top: 530, accel: 1.2, grip: 1.1 },
};

let nextCarId = 1;

export function makeCar(x, y, angle, type, opts = {}) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0,
    type,
    spec,
    color: opts.color || pick(makeRng((x | 0) + (y | 0) * 7 + nextCarId), COLORS.carPaint),
    health: CAR.maxHealth,
    isPolice: type === 'police',
    isPlayer: false,
    driver: opts.driver || 'traffic', // 'traffic' | 'player' | 'police' | 'parked'
    // Traffic AI state
    axis: opts.axis || (Math.random() < 0.5 ? 'x' : 'y'),
    dir: opts.dir || (Math.random() < 0.5 ? 1 : -1),
    cruise: range(makeRng(nextCarId * 31), 150, 230),
    stuck: 0,
    sirenPhase: Math.random() * Math.PI * 2,
    smoke: 0,
    crashT: 0, // cooldown between impact damage events
    dead: false,
    honk: 0,
  };
}

// --- player driving -------------------------------------------------------

export function drivePlayerCar(car, input, dt) {
  const spec = car.spec;
  const forward = input.down('KeyW', 'ArrowUp');
  const back = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const handbrake = input.down('Space');

  if (forward) car.speed += CAR.accel * spec.accel * dt;
  if (back) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.55 * dt;
  }
  if (!forward && !back) {
    car.speed -= car.speed * CAR.drag * dt * 0.8;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= car.speed * 2.2 * dt;
    car.smoke = Math.max(car.smoke, 0.5);
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, spec.top);

  const speedRatio = clamp(Math.abs(car.speed) / spec.top, 0, 1);
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const grip = handbrake ? 0.45 : 1;
  const turn = steer * CAR.turnRate * speedRatio * grip * (car.speed < 0 ? -1 : 1);
  car.angle += turn * dt * (handbrake ? 1.5 : 1);

  moveCar(car, dt);
}

function moveCar(car, dt) {
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 20, WORLD.width - 20);
  car.y = clamp(car.y, 20, WORLD.height - 20);
}

// --- traffic AI -----------------------------------------------------------

export function updateTrafficCar(car, city, cars, player, dt, rng) {
  if (car.driver !== 'traffic') return;
  const half = WORLD.roadWidth / 2 - 26; // lane offset from the road centre
  const lane = half * 0.9;
  // Target lane centre along the current axis.
  let targetX = car.x;
  let targetY = car.y;
  if (car.axis === 'x') {
    // Driving along x: find the nearest horizontal road line and hold its lane.
    const roadY = nearestRoadLine(city.roads, car.y);
    targetY = roadY + lane * (car.dir > 0 ? 1 : -1);
    targetX = car.x + car.dir * 100;
  } else {
    const roadX = nearestRoadLine(city.roads, car.x);
    targetX = roadX + lane * (car.dir > 0 ? -1 : 1);
    targetY = car.y + car.dir * 100;
  }
  const wantAngle = Math.atan2(targetY - car.y, targetX - car.x);
  car.angle = angleLerp(car.angle, wantAngle, Math.min(1, dt * 3.5));

  // Slow down for a car or the player ahead.
  const ahead = carAhead(car, cars, player);
  const targetSpeed = ahead ? 0 : car.cruise;
  if (car.speed < targetSpeed) car.speed += 260 * dt;
  else car.speed -= 420 * dt;
  car.speed = clamp(car.speed, 0, car.cruise);

  moveCar(car, dt);

  // At an intersection, sometimes turn.
  if (nearIntersection(city, car.x, car.y) && rng() < dt * 0.5) {
    car.axis = car.axis === 'x' ? 'y' : 'x';
    car.dir = rng() < 0.5 ? 1 : -1;
  }

  // Unstick: if barely moving while wanting speed, nudge forward.
  if (car.speed < 8 && targetSpeed > 0) {
    car.stuck += dt;
    if (car.stuck > 1.2) {
      car.angle += Math.PI / 2;
      car.speed = 60;
      car.stuck = 0;
    }
  } else {
    car.stuck = 0;
  }
}

function nearestRoadLine(roads, v) {
  let best = roads[0];
  let bestD = Infinity;
  for (const r of roads) {
    const d = Math.abs(r - v);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

function nearIntersection(city, x, y) {
  const half = WORLD.roadWidth / 2;
  let onV = false;
  let onH = false;
  for (const c of city.roads) {
    if (Math.abs(x - c) < half) onV = true;
    if (Math.abs(y - c) < half) onH = true;
  }
  return onV && onH;
}

function carAhead(car, cars, player) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const o of cars) {
    if (o === car || o.dead) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < 95 && side < 26) return true;
  }
  if (player && !player.inCar) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < 80 && side < 24) return true;
  }
  return false;
}

// --- collisions and damage -------------------------------------------------

export function collideCars(cars, city, onCrash, dt = 0.016) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    a.crashT = Math.max(0, a.crashT - dt);
    // Buildings: two probe circles along the car's body. Push the car out
    // along the wall normal and scrub speed, so cars slide along walls
    // instead of wedging nose-first into them.
    const fx = Math.cos(a.angle);
    const fy = Math.sin(a.angle);
    for (const off of [-14, 14]) {
      const probe = { x: a.x + fx * off, y: a.y + fy * off };
      const ox = probe.x;
      const oy = probe.y;
      resolveBuildingCollision(city, probe, CAR.radius);
      const dx = probe.x - ox;
      const dy = probe.y - oy;
      if (dx !== 0 || dy !== 0) {
        a.x += dx;
        a.y += dy;
        const impact = Math.abs(a.speed);
        if (impact > 60 && a.crashT <= 0) {
          a.crashT = 0.4;
          damageCar(a, Math.min(8, impact * 0.04), onCrash);
          if (onCrash) onCrash(a, impact);
        }
        // Deflect the heading toward the wall tangent so the car glances
        // off instead of wedging nose-first into the building.
        const nl = Math.hypot(dx, dy) || 1;
        const nx = dx / nl;
        const ny = dy / nl;
        let tx = -ny;
        let ty = nx;
        if (Math.cos(a.angle) * tx + Math.sin(a.angle) * ty < 0) {
          tx = -tx;
          ty = -ty;
        }
        a.angle = angleLerp(a.angle, Math.atan2(ty, tx), 0.3);
        // Keep some forward momentum so the car can slide off the wall.
        a.speed *= 0.5;
      }
    }
    // Car vs car: push apart and scrub speed. Radius 24 lets cars pass in
    // adjacent lanes (26 px apart) without clipping each other.
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 24;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // Impact damage and speed loss only on a real hit, throttled per
        // car: gentle pushing (a traffic jam) must not drain speed or
        // shred health every frame while the cars stay in contact.
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 80) {
          if (a.crashT <= 0) {
            a.crashT = 0.5;
            damageCar(a, Math.min(8, rel * 0.03), onCrash);
            a.speed *= 0.8;
          }
          if (b.crashT <= 0) {
            b.crashT = 0.5;
            damageCar(b, Math.min(8, rel * 0.03), onCrash);
            b.speed *= 0.8;
          }
          if (onCrash) onCrash(a, rel);
        }
      }
    }
  }
}

export function damageCar(car, amount, onCrash) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
  }
}

// Keep traffic populated near the player and remove distant cars.
export function maintainTraffic(city, cars, player, rng, dt, state) {
  state.trafficTimer -= dt;
  if (state.trafficTimer > 0) return;
  state.trafficTimer = 0.7;
  const px = player.x;
  const py = player.y;
  let count = 0;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.driver === 'traffic') {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d > 1400 || c.dead) cars.splice(i, 1);
      else count++;
    }
  }
  const target = 14;
  while (count < target) {
    const p = randomRoadPointNear(city, rng, px, py, 500, 1200);
    if (!p) break;
    const onV = city.roads.some((r) => Math.abs(r - p.x) < 4);
    const type = pick(rng, ['sedan', 'sedan', 'taxi', 'truck', 'van', 'sports']);
    const car = makeCar(p.x, p.y, onV ? Math.PI / 2 : 0, type, {
      axis: onV ? 'y' : 'x',
      dir: rng() < 0.5 ? 1 : -1,
    });
    if (type === 'taxi') car.color = '#e8c832';
    car.speed = car.cruise;
    cars.push(car);
    count++;
  }
}

// Parked cars the player can steal, scattered near the player.
export function maintainParked(city, cars, player, rng) {
  let count = 0;
  for (const c of cars) if (c.driver === 'parked' && !c.dead) count++;
  if (count >= 6) return;
  const p = randomRoadPointNear(city, rng, player.x, player.y, 180, 700);
  if (!p) return;
  const type = pick(rng, ['sedan', 'sports', 'van', 'truck']);
  const car = makeCar(p.x + 40, p.y + 40, rng() * Math.PI * 2, type, { driver: 'parked' });
  // Parked cars sit on the road edge, not inside a building.
  if (collideBuildings(city, car.x, car.y, 20)) return;
  cars.push(car);
}

export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const c of cars) {
    if (c.dead) continue;
    const d = dist2(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
