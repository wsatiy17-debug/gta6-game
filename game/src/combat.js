// Neon Bay — combat: pistol bullets, fists, damage to peds and cars.

import { PLAYER, dist2 } from './config.js';
import { collideBuildings } from './city.js';
import { knockPedDown } from './pedestrians.js';
import { damageCar } from './vehicles.js';

export function makeBullet(x, y, angle, fromPlayer) {
  const speed = 950;
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.9,
    fromPlayer,
  };
}

export function updateBullets(state, dt) {
  const { bullets, city, peds, cars, player } = state;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && collideBuildings(city, b.x, b.y, 2)) {
      state.spawnParticles(b.x, b.y, 4, '#ffd76a', 120);
      dead = true;
    }
    if (!dead && b.fromPlayer) {
      // Hit a pedestrian?
      for (const p of peds) {
        if (p.state === 'down') continue;
        if (dist2(b.x, b.y, p.x, p.y) < 16 * 16) {
          knockPedDown(p, state.rng);
          state.spawnParticles(p.x, p.y, 6, '#d95f4f', 140);
          state.danger = { x: p.x, y: p.y, r: 320, t: 2 };
          dead = true;
          break;
        }
      }
      // Hit a car?
      if (!dead) {
        for (const c of cars) {
          if (c.dead || c.isPlayer) continue;
          if (dist2(b.x, b.y, c.x, c.y) < 24 * 24) {
            damageCar(c, 12);
            state.spawnParticles(b.x, b.y, 4, '#ffd76a', 120);
            if (c.isPolice) state.addWanted(1, 'COP CAR SHOT');
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      // A cop's bullet hitting the player.
      if (!player.inCar && dist2(b.x, b.y, player.x, player.y) < 15 * 15) {
        state.damagePlayer(6);
        dead = true;
      } else if (player.inCar && player.car && dist2(b.x, b.y, player.car.x, player.car.y) < 24 * 24) {
        damageCar(player.car, 4);
        dead = true;
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

// The player punches: knocks down a nearby pedestrian.
export function punch(state) {
  const { player, peds } = state;
  if (player.inCar) return;
  state.audio.punch();
  state.spawnParticles(
    player.x + Math.cos(player.angle) * 24,
    player.y + Math.sin(player.angle) * 24,
    4, '#ffffff', 90,
  );
  for (const p of peds) {
    if (p.state === 'down') continue;
    if (dist2(player.x, player.y, p.x, p.y) < PLAYER.punchRange * PLAYER.punchRange) {
      knockPedDown(p, state.rng);
      state.addWanted(1, 'ASSAULT');
      state.danger = { x: p.x, y: p.y, r: 260, t: 2 };
      break;
    }
  }
}
