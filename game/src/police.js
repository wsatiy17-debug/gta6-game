// Neon Bay — the wanted system: stars, police cars that chase and ram,
// foot cops who arrest, evasion and the busted/wasted outcomes.

import { WANTED, CAR, clamp, angleLerp } from './config.js';
import { makeCar } from './vehicles.js';
import { randomRoadPointNear, resolveBuildingCollision } from './city.js';
import { pick, range } from './random.js';

let nextCopId = 1;

export function makeFootCop(x, y) {
  return {
    id: nextCopId++,
    x, y,
    angle: 0,
    speed: 0,
    shootT: 1,
    arrestT: 0,
    state: 'chase', // 'chase' | 'leave'
  };
}

export function addWanted(state, n, reason) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + n, 0, WANTED.max);
  if (state.wanted > before) {
    state.audio.wantedUp();
    state.toast(`WANTED LEVEL ${state.wanted} — ${reason}`, '#ff5a5a');
    state.evadeT = 0;
  }
}

// Spawn and steer police cars toward the player.
export function updatePoliceCars(state, dt) {
  const { city, cars, player, rng } = state;
  const want = WANTED.copCars[state.wanted] || 0;
  let have = 0;
  for (const c of cars) if (c.isPolice && !c.dead) have++;

  // Spawn missing cruisers on roads near the player.
  while (have < want) {
    const p = randomRoadPointNear(city, rng, player.x, player.y, 450, 900);
    if (!p) break;
    const car = makeCar(p.x, p.y, Math.atan2(player.y - p.y, player.x - p.x), 'police', { driver: 'police' });
    car.color = '#1e2a38';
    cars.push(car);
    have++;
  }

  for (const c of cars) {
    if (!c.isPolice || c.dead) continue;
    c.sirenPhase += dt * 10;
    if (state.wanted === 0) {
      // No heat: cruisers drive off and despawn.
      c.speed = Math.max(0, c.speed - 200 * dt);
      if (Math.hypot(c.x - player.x, c.y - player.y) > 700) c.dead = true;
      continue;
    }
    // Chase: steer toward the player, faster with more stars.
    const wantAngle = Math.atan2(player.y - c.y, player.x - c.x);
    c.angle = angleLerp(c.angle, wantAngle, Math.min(1, dt * 2.2));
    const distToPlayer = Math.hypot(player.x - c.x, player.y - c.y);
    const top = c.spec.top * (0.85 + state.wanted * 0.05);
    if (!player.inCar && distToPlayer < 110) {
      // Pull up beside a player on foot instead of running them over:
      // the foot cops make the arrest.
      c.speed = Math.max(0, c.speed - 700 * dt);
    } else if (c.speed < top) {
      c.speed += 380 * dt;
    }
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Unstick: if crawling into a building, reverse out and turn.
    if (Math.abs(c.speed) < 20) {
      c.stuck += dt;
      if (c.stuck > 0.8) {
        c.angle += Math.PI / 2 + range(rng, -0.5, 0.5);
        c.speed = 120;
        c.stuck = 0;
      }
    } else {
      c.stuck = 0;
    }
    // Ram the player's car: damage on contact is handled by collideCars.
  }
}

// Foot cops run at the player and arrest them if they catch them standing still.
export function updateFootCops(state, dt) {
  const { player, rng } = state;
  const want = !player.inCar ? WANTED.footCops[state.wanted] || 0 : 0;
  while (state.cops.length < want) {
    const a = rng() * Math.PI * 2;
    const d = range(rng, 260, 420);
    state.cops.push(makeFootCop(player.x + Math.cos(a) * d, player.y + Math.sin(a) * d));
  }
  for (let i = state.cops.length - 1; i >= 0; i--) {
    const cop = state.cops[i];
    const d = Math.hypot(player.x - cop.x, player.y - cop.y);
    if (state.wanted === 0 || player.inCar) {
      // Cops give up and walk away.
      state.cops.splice(i, 1);
      continue;
    }
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    const speed = 235;
    cop.x += Math.cos(cop.angle) * speed * dt;
    cop.y += Math.sin(cop.angle) * speed * dt;
    resolveBuildingCollision(state.city, cop, 12);

    // Arrest: close and the player is slow.
    const playerSpeed = Math.hypot(player.vx || 0, player.vy || 0);
    if (d < WANTED.bustRadius && playerSpeed < 90) {
      cop.arrestT += dt;
      state.arrestProgress = Math.max(state.arrestProgress, cop.arrestT / WANTED.bustTime);
      if (cop.arrestT >= WANTED.bustTime) {
        state.busted();
        return;
      }
    } else {
      cop.arrestT = Math.max(0, cop.arrestT - dt * 2);
    }

    // Cops shoot at 3+ stars.
    if (state.wanted >= 3 && d < 420 && d > 60) {
      cop.shootT -= dt;
      if (cop.shootT <= 0) {
        cop.shootT = range(rng, 0.8, 1.6);
        state.spawnBullet(cop.x, cop.y, cop.angle + range(rng, -0.2, 0.2), false);
        state.audio.gunshot();
      }
    }
  }
  if (state.cops.length === 0) state.arrestProgress = 0;
}

// Wanted decay: when no cop can see the player, stars drop one at a time.
export function updateEvade(state, dt) {
  if (state.wanted === 0) {
    state.evading = false;
    return;
  }
  let seen = false;
  for (const c of state.cars) {
    if (c.isPolice && !c.dead && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 430) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const cop of state.cops) {
      if (Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 300) {
        seen = true;
        break;
      }
    }
  }
  state.evading = !seen;
  if (!seen) {
    state.evadeT += dt;
    const need = WANTED.evadeSeconds[state.wanted] || 8;
    if (state.evadeT >= need) {
      state.wanted -= 1;
      state.evadeT = 0;
      if (state.wanted === 0) {
        state.toast('YOU LOST THE COPS', '#7fd94f');
        state.audio.pickup();
      } else {
        state.toast(`WANTED LEVEL ${state.wanted}`, '#ffcf5a');
      }
    }
  } else {
    state.evadeT = 0;
  }
}
