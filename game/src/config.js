// Neon Bay — shared tuning, palette and world constants.

export const WORLD = {
  width: 3600,
  height: 3600,
  roadGap: 400, // distance between road centres
  roadWidth: 112,
  firstRoad: 220, // centre of the first road
  sidewalk: 26,
  beachY: 3440, // sand band starts here (south edge)
};

export const PLAYER = {
  walkSpeed: 175,
  sprintSpeed: 265,
  radius: 13,
  maxHealth: 100,
  enterRadius: 70,
  punchRange: 34,
  shootCooldown: 0.16,
};

export const CAR = {
  maxForward: 540,
  maxReverse: 190,
  accel: 420,
  brake: 700,
  drag: 0.9,
  turnRate: 2.6,
  radius: 15,
  maxHealth: 100,
};

export const WANTED = {
  max: 5,
  evadeSeconds: [0, 6, 8, 10, 12, 14],
  copCars: [0, 1, 2, 3, 4, 5],
  footCops: [0, 0, 1, 2, 3, 4],
  bustRadius: 30,
  bustTime: 1.4,
};

export const COLORS = {
  grass: '#7fae5a',
  grassDark: '#74a253',
  sidewalk: '#cbb9a0',
  sidewalkEdge: '#b3a189',
  asphalt: '#3a3f4a',
  asphaltEdge: '#2f333d',
  roadLine: '#e8d44d',
  sand: '#e8d29a',
  water: '#3fa7c4',
  waterDeep: '#2b8aa8',
  park: '#6da34e',
  buildingRoof: ['#e8d8c0', '#d9a08c', '#a8c8c0', '#e0b8d0', '#c0c8e0', '#f0e0a8'],
  buildingEdge: ['#b8a888', '#a87868', '#88a89e', '#b088a8', '#98a0b8', '#c0b078'],
  carPaint: ['#d94f4f', '#4f7fd9', '#e8e8e8', '#2e2e34', '#e8a13c', '#4fd98a', '#9b5fd9', '#d94f9b'],
};

// Sun-soaked late-afternoon light: warm overlay tint drawn over the world.
export const SUN_TINT = 'rgba(255, 186, 90, 0.08)';

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
