// Neon Bay — scripted scenes for screenshots: ?shot=<name>&seed=<n> sets up
// a deterministic moment of the game (the starter's shots.json uses these).
// Scenes: start, drive, chase, foot, mission.

import { makeCar } from './vehicles.js';
import { makePed } from './pedestrians.js';

export function shotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || null,
    seed: parseInt(q.get('seed') || '7', 10) || 7,
  };
}

export function applyShotScene(state, shot) {
  const { city, rng, player } = state;
  const R = city.roads;
  const putPlayerInCar = (x, y, angle, type, color) => {
    const car = makeCar(x, y, angle, type, { driver: 'player' });
    if (color) car.color = color;
    car.isPlayer = true;
    car.speed = 300;
    state.cars.push(car);
    player.car = car;
    player.inCar = true;
    player.x = x;
    player.y = y;
    state.camera.x = x;
    state.camera.y = y;
  };

  if (shot === 'start') {
    // Title screen over the city: stay in menu mode.
    state.camera.x = R[4];
    state.camera.y = R[4];
    return;
  }

  if (shot === 'drive') {
    // Cruising a boulevard in a sports car, traffic around. The player takes
    // the south lane with a clear run ahead; oncoming and cross traffic
    // keep the street alive without a rear-end.
    putPlayerInCar(R[4] + 30, R[3] + 26, 0, 'sports', '#d94f4f');
    for (let i = 0; i < 3; i++) {
      const c = makeCar(R[4] + 400 + i * 260, R[3] - 26, Math.PI, 'sedan', { driver: 'traffic', axis: 'x', dir: -1 });
      c.speed = 200;
      state.cars.push(c);
    }
    for (let i = 0; i < 3; i++) {
      const c = makeCar(R[5] + (i % 2 ? 26 : -26), R[3] - 200 - i * 200, Math.PI / 2, i === 1 ? 'taxi' : 'truck', { driver: 'traffic', axis: 'y', dir: 1 });
      c.speed = 170;
      state.cars.push(c);
    }
    for (let i = 0; i < 6; i++) {
      state.peds.push(makePed(R[4] + 100 + i * 90, R[3] + 90, rng));
    }
    state.mode = 'playing';
    return;
  }

  if (shot === 'chase') {
    // A 3-star police chase: the cover shot. Player in a sedan, three
    // cruisers on their tail, sirens flashing, HUD and minimap live.
    // The player starts at speed in the south lane, cops closing in. A
    // sports car (top speed above the cruisers') keeps the chase alive.
    putPlayerInCar(R[3] + 30, R[4] + 26, 0, 'sports', '#4f7fd9');
    state.player.car.speed = 430;
    state.wanted = 3;
    const offsets = [[-190, 26], [-290, -26], [-150, -70]];
    for (const [dx, dy] of offsets) {
      const c = makeCar(R[3] + 30 + dx, R[4] + dy, 0, 'police', { driver: 'police' });
      c.color = '#1e2a38';
      c.speed = 400;
      state.cars.push(c);
    }
    // Cross traffic at the next intersection, clear of the chase line.
    for (let i = 0; i < 3; i++) {
      const c = makeCar(R[4] + (i % 2 ? 26 : -26), R[4] + 260 + i * 200, Math.PI / 2, 'sedan', { driver: 'traffic', axis: 'y', dir: 1 });
      c.speed = 180;
      state.cars.push(c);
    }
    state.toast('WANTED LEVEL 3 — LOSE THE COPS', '#ff5a5a');
    state.mode = 'playing';
    return;
  }

  if (shot === 'foot') {
    // On foot at a busy intersection, pedestrians and traffic around.
    player.x = R[4] + 60;
    player.y = R[4] + 60;
    player.angle = -Math.PI / 4;
    state.camera.x = player.x;
    state.camera.y = player.y;
    for (let i = 0; i < 10; i++) {
      state.peds.push(makePed(R[4] + 40 + (i % 5) * 70, R[4] + 40 + Math.floor(i / 5) * 90, rng));
    }
    for (let i = 0; i < 3; i++) {
      const c = makeCar(R[4] + 30 + i * 150, R[4] - 26, 0, i === 1 ? 'taxi' : 'sedan', { driver: 'traffic', axis: 'x', dir: 1 });
      c.speed = 190;
      state.cars.push(c);
    }
    state.mode = 'playing';
    return;
  }

  if (shot === 'mission') {
    // Mission 1 in progress: the stolen Comet GT, objective marker ahead.
    // start() opens the brief overlay; hide it again for the shot.
    state.missions.done = 1;
    state.missions.start();
    document.getElementById('brief').classList.add('hidden');
    const car = state.missions.active.stealCar;
    if (car) {
      car.isPlayer = true;
      car.driver = 'player';
      car.speed = 320;
      // Point the Comet GT south down the boulevard toward Rico's Garage,
      // so the shot shows the delivery run mid-city, not the world edge.
      car.x = R[6] + 26;
      car.y = R[2];
      car.angle = Math.PI / 2;
      player.car = car;
      player.inCar = true;
      player.x = car.x;
      player.y = car.y;
      state.camera.x = car.x;
      state.camera.y = car.y;
      state.missions.advance(); // step 1 done: now deliver it
    }
    state.mode = 'playing';
    return;
  }
}
