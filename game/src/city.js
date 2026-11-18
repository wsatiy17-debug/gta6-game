// Neon Bay — the city: a road grid, blocks with buildings, a park, a beach,
// traffic-light intersections, palms and street props. Also collision queries.

import { WORLD, COLORS, clamp } from './config.js';
import { makeRng, pick, range, rangeInt } from './random.js';

export function roadCenters() {
  const centers = [];
  for (let c = WORLD.firstRoad; c < WORLD.width; c += WORLD.roadGap) centers.push(c);
  return centers;
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const roads = roadCenters();
  const buildings = [];
  const trees = [];
  const lamps = [];
  const hydrants = [];
  const parkBlocks = new Set();
  // The park: the block at column 4, row 4. The plaza: column 6, row 2.
  parkBlocks.add('4,4');
  const plazaKey = '6,2';

  const halfRoad = WORLD.roadWidth / 2;
  for (let bx = 0; bx < roads.length - 1; bx++) {
    for (let by = 0; by < roads.length - 1; by++) {
      const x0 = roads[bx] + halfRoad + WORLD.sidewalk;
      const y0 = roads[by] + halfRoad + WORLD.sidewalk;
      const x1 = roads[bx + 1] - halfRoad - WORLD.sidewalk;
      const y1 = roads[by + 1] - halfRoad - WORLD.sidewalk;
      const key = bx + ',' + by;
      // Skip the block row that overlaps the beach.
      if (y0 > WORLD.beachY - 60) continue;
      if (parkBlocks.has(key)) {
        for (let i = 0; i < 14; i++) {
          trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), palm: rng() < 0.4 });
        }
        continue;
      }
      if (key === plazaKey) {
        for (let i = 0; i < 8; i++) {
          trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), palm: true });
        }
        continue;
      }
      const count = rng() < 0.5 ? 1 : 2;
      if (count === 1) {
        const w = range(rng, (x1 - x0) * 0.55, (x1 - x0) * 0.9);
        const h = range(rng, (y1 - y0) * 0.55, (y1 - y0) * 0.9);
        buildings.push(makeBuilding(rng, x0 + (x1 - x0 - w) / 2, y0 + (y1 - y0 - h) / 2, w, h));
      } else {
        const vertical = rng() < 0.5;
        if (vertical) {
          const mid = (x0 + x1) / 2;
          buildings.push(makeBuilding(rng, x0 + 4, y0 + 8, mid - x0 - 12, (y1 - y0) * range(rng, 0.6, 0.85)));
          buildings.push(makeBuilding(rng, mid + 8, y0 + 8, x1 - mid - 12, (y1 - y0) * range(rng, 0.6, 0.85)));
        } else {
          const mid = (y0 + y1) / 2;
          buildings.push(makeBuilding(rng, x0 + 8, y0 + 4, (x1 - x0) * range(rng, 0.6, 0.85), mid - y0 - 12));
          buildings.push(makeBuilding(rng, x0 + 8, mid + 8, (x1 - x0) * range(rng, 0.6, 0.85), y1 - mid - 12));
        }
      }
      // Sidewalk props around the block.
      const nProps = rangeInt(rng, 1, 3);
      for (let i = 0; i < nProps; i++) {
        const edge = rangeInt(rng, 0, 3);
        const t = rng();
        let px;
        let py;
        if (edge === 0) { px = x0 + t * (x1 - x0); py = y0 - WORLD.sidewalk / 2; }
        else if (edge === 1) { px = x0 + t * (x1 - x0); py = y1 + WORLD.sidewalk / 2; }
        else if (edge === 2) { px = x0 - WORLD.sidewalk / 2; py = y0 + t * (y1 - y0); }
        else { px = x1 + WORLD.sidewalk / 2; py = y0 + t * (y1 - y0); }
        if (rng() < 0.55) trees.push({ x: px, y: py, palm: rng() < 0.6 });
        else if (rng() < 0.7) lamps.push({ x: px, y: py });
        else hydrants.push({ x: px, y: py });
      }
    }
  }

  // Beach palms along the boardwalk.
  for (let x = 120; x < WORLD.width; x += 90) {
    trees.push({ x: x + range(rng, -20, 20), y: WORLD.beachY + range(rng, 10, 90), palm: true });
  }

  // Landmarks: hospital, police station, garage, Vera's bar. Fixed spots so
  // missions and respawns can name them.
  const landmarks = {
    hospital: { x: roads[1], y: roads[1], label: 'St. Marina Hospital' },
    policeStation: { x: roads[7], y: roads[1], label: 'Neon Bay PD' },
    garage: { x: roads[6], y: roads[6], label: "Rico's Garage" },
    veraBar: { x: roads[3], y: roads[5], label: 'The Sunset Bar' },
    hideout: { x: roads[1], y: roads[7], label: 'Hideout' },
    pier: { x: roads[4], y: WORLD.beachY + 40, label: 'Neon Pier' },
  };

  return { roads, buildings, trees, lamps, hydrants, landmarks, seed };
}

function makeBuilding(rng, x, y, w, h) {
  const ci = Math.floor(rng() * COLORS.buildingRoof.length);
  return {
    x, y, w, h,
    roof: COLORS.buildingRoof[ci],
    edge: COLORS.buildingEdge[ci],
    floors: rangeInt(rng, 1, 4),
    lit: rng() < 0.7,
  };
}

// Is a point on a road (within the asphalt)?
export function onRoad(city, x, y) {
  const half = WORLD.roadWidth / 2;
  for (const c of city.roads) {
    if (Math.abs(x - c) < half || Math.abs(y - c) < half) return true;
  }
  return false;
}

// Nearest point on the road network to (x, y), for spawning cars on roads.
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const c of city.roads) {
    const d1 = Math.abs(x - c);
    const d2 = Math.abs(y - c);
    if (d1 < bestD) { bestD = d1; best = { x: c, y }; }
    if (d2 < bestD) { bestD = d2; best = { x, y: c }; }
  }
  return best;
}

// Circle vs building rects. Returns the building hit, or null.
export function collideBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

// Push a circle out of buildings and the world edge. Mutates p {x, y}.
export function resolveBuildingCollision(city, p, r) {
  for (const b of city.buildings) {
    const nx = clamp(p.x, b.x, b.x + b.w);
    const ny = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - nx;
    const dy = p.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r;
      p.y = ny + (dy / d) * r;
    } else if (d2 <= 0.0001) {
      // Centre inside the rect: push out along the smallest penetration.
      const left = p.x - b.x;
      const right = b.x + b.w - p.x;
      const top = p.y - b.y;
      const bottom = b.y + b.h - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = b.x - r;
      else if (m === right) p.x = b.x + b.w + r;
      else if (m === top) p.y = b.y - r;
      else p.y = b.y + b.h + r;
    }
  }
  p.x = clamp(p.x, r, WORLD.width - r);
  p.y = clamp(p.y, r, WORLD.height - r);
}

// A random road point at least minDist and at most maxDist from (x, y).
export function randomRoadPointNear(city, rng, x, y, minDist, maxDist) {
  for (let tries = 0; tries < 24; tries++) {
    const c = pick(rng, city.roads);
    const along = range(rng, 100, WORLD.width - 100);
    const p = rng() < 0.5 ? { x: c, y: along } : { x: along, y: c };
    const d = Math.hypot(p.x - x, p.y - y);
    if (d >= minDist && d <= maxDist) return p;
  }
  return nearestRoadPoint(city, x + minDist, y);
}
