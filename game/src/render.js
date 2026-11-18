// Neon Bay — all canvas drawing: the city, cars, people, effects and the
// minimap. One renderer, driven by the game state each frame.

import { WORLD, COLORS, SUN_TINT, clamp } from './config.js';

export class Renderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = minimapCanvas;
    this.mapCtx = minimapCanvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.viewW = w;
    this.viewH = h;
  }

  // --- world ---------------------------------------------------------------

  draw(state) {
    const ctx = this.ctx;
    const cam = state.camera;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    const vx0 = cam.x - this.viewW / 2 - 80;
    const vy0 = cam.y - this.viewH / 2 - 80;
    const vx1 = cam.x + this.viewW / 2 + 80;
    const vy1 = cam.y + this.viewH / 2 + 80;

    ctx.save();
    ctx.translate(this.viewW / 2 - cam.x, this.viewH / 2 - cam.y);

    this.drawGround(ctx, state, vx0, vy0, vx1, vy1);
    this.drawBuildings(ctx, state, vx0, vy0, vx1, vy1);
    this.drawProps(ctx, state, vx0, vy0, vx1, vy1);
    this.drawBeacon(ctx, state);
    this.drawCars(ctx, state, vx0, vy0, vx1, vy1);
    this.drawPeds(ctx, state, vx0, vy0, vx1, vy1);
    this.drawPlayer(ctx, state);
    this.drawBullets(ctx, state);
    this.drawParticles(ctx, state);

    // Warm late-afternoon sun tint.
    ctx.fillStyle = SUN_TINT;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.restore();

    this.drawMinimap(state);
  }

  drawGround(ctx, state, vx0, vy0, vx1, vy1) {
    const { city } = state;
    // Base grass.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);

    // Park block + plaza: richer green.
    ctx.fillStyle = COLORS.park;
    const r = city.roads;
    ctx.fillRect(r[4] + 56, r[4] + 56, r[5] - r[4] - 112, r[5] - r[4] - 112);

    // Sidewalks: light border around every block.
    ctx.fillStyle = COLORS.sidewalk;
    const half = WORLD.roadWidth / 2;
    for (let i = 0; i < r.length - 1; i++) {
      for (let j = 0; j < r.length - 1; j++) {
        const x0 = r[i] + half;
        const y0 = r[j] + half;
        const x1 = r[i + 1] - half;
        const y1 = r[j + 1] - half;
        if (x1 < vx0 || y1 < vy0 || x0 > vx1 || y0 > vy1) continue;
        if (y0 > WORLD.beachY) continue;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }

    // Asphalt roads.
    ctx.fillStyle = COLORS.asphalt;
    for (const c of r) {
      ctx.fillRect(c - half, Math.max(0, vy0), WORLD.roadWidth, Math.min(WORLD.height, vy1) - Math.max(0, vy0));
      ctx.fillRect(Math.max(0, vx0), c - half, Math.min(WORLD.width, vx1) - Math.max(0, vx0), WORLD.roadWidth);
    }

    // Centre dashes.
    ctx.strokeStyle = COLORS.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const c of r) {
      ctx.moveTo(c, Math.max(0, vy0));
      ctx.lineTo(c, Math.min(WORLD.height, vy1));
      ctx.moveTo(Math.max(0, vx0), c);
      ctx.lineTo(Math.min(WORLD.width, vx1), c);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const cx of r) {
      for (const cy of r) {
        if (cx < vx0 - 80 || cx > vx1 + 80 || cy < vy0 - 80 || cy > vy1 + 80) continue;
        for (let k = -2; k <= 2; k++) {
          ctx.fillRect(cx - 44 + k * 18, cy - half - 12, 10, 8);
          ctx.fillRect(cx - 44 + k * 18, cy + half + 4, 10, 8);
        }
      }
    }

    // Beach + water at the south edge.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(Math.max(0, vx0), WORLD.beachY, Math.min(WORLD.width, vx1) - Math.max(0, vx0), WORLD.height - WORLD.beachY);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(Math.max(0, vx0), WORLD.height - 46, Math.min(WORLD.width, vx1) - Math.max(0, vx0), 46);
    ctx.fillStyle = COLORS.waterDeep;
    for (let x = Math.floor(vx0 / 90) * 90; x < vx1; x += 90) {
      ctx.fillRect(x, WORLD.height - 34 + ((x / 90) % 2) * 10, 46, 3);
    }
  }

  drawBuildings(ctx, state, vx0, vy0, vx1, vy1) {
    for (const b of state.city.buildings) {
      if (b.x + b.w < vx0 || b.y + b.h < vy0 || b.x > vx1 || b.y > vy1) continue;
      // Drop shadow (sun from the south-west).
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      // Roof.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Parapet edge.
      ctx.strokeStyle = b.edge;
      ctx.lineWidth = 4;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      // Rooftop detail: vents / AC units.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      const cols = Math.max(1, Math.floor(b.w / 60));
      const rows = Math.max(1, Math.floor(b.h / 60));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if ((i * 7 + j * 3 + b.floors) % 3 === 0) {
            ctx.fillRect(b.x + 12 + i * 60, b.y + 12 + j * 60, 22, 14);
          }
        }
      }
      // Lit windows along the south face at dusk.
      if (b.lit) {
        ctx.fillStyle = 'rgba(255, 214, 120, 0.85)';
        for (let x = b.x + 10; x < b.x + b.w - 14; x += 26) {
          ctx.fillRect(x, b.y + b.h - 8, 12, 5);
        }
      }
    }
  }

  drawProps(ctx, state, vx0, vy0, vx1, vy1) {
    const { city } = state;
    for (const t of city.trees) {
      if (t.x < vx0 || t.y < vy0 || t.x > vx1 || t.y > vy1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(t.x + 4, t.y + 5, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#8a6a42';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + 6);
        ctx.lineTo(t.x, t.y - 6);
        ctx.stroke();
        ctx.strokeStyle = '#3f8a4f';
        ctx.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y - 6);
          ctx.lineTo(t.x + Math.cos(a) * 13, t.y - 6 + Math.sin(a) * 13);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#4e8a3f';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5da34a';
        ctx.beginPath();
        ctx.arc(t.x - 4, t.y - 4, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const l of city.lamps) {
      if (l.x < vx0 || l.y < vy0 || l.x > vx1 || l.y > vy1) continue;
      ctx.fillStyle = '#5a5a66';
      ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
      ctx.fillStyle = 'rgba(255, 240, 170, 0.5)';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const h of city.hydrants) {
      if (h.x < vx0 || h.y < vy0 || h.x > vx1 || h.y > vy1) continue;
      ctx.fillStyle = '#d94f4f';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBeacon(ctx, state) {
    const pos = state.missions.objectivePos();
    if (!pos) return;
    const t = state.time;
    const pulse = 1 + Math.sin(t * 4) * 0.15;
    // Ground ring.
    ctx.strokeStyle = 'rgba(255, 210, 60, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 34 * pulse, 20 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Floating marker.
    const bob = Math.sin(t * 3) * 6;
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - 58 + bob);
    ctx.lineTo(pos.x - 12, pos.y - 82 + bob);
    ctx.lineTo(pos.x + 12, pos.y - 82 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a6a00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawCars(ctx, state, vx0, vy0, vx1, vy1) {
    for (const car of state.cars) {
      if (car.x < vx0 - 60 || car.y < vy0 - 60 || car.x > vx1 + 60 || car.y > vy1 + 60) continue;
      this.drawCar(ctx, car, state.time);
    }
  }

  drawCar(ctx, car, time) {
    const { w, h } = car.spec;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, 7);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
    roundRect(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    if (car.isPolice) {
      // White doors.
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-6, -h / 2 + 1, 16, h - 2);
      // Light bar, alternating red/blue.
      const phase = Math.sin(car.sirenPhase) > 0;
      ctx.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-14, -h / 2 - 1, 10, 5);
      ctx.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-14, h / 2 - 4, 10, 5);
      // Light glow on the road.
      ctx.fillStyle = phase ? 'rgba(255,46,46,0.18)' : 'rgba(46,107,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(-4, -h / 2 - 3, 8, 4);
    }
    // Windshield + rear window.
    ctx.fillStyle = car.dead ? '#222' : '#bfe3ec';
    roundRect(ctx, w / 2 - 16, -h / 2 + 4, 10, h - 8, 3);
    ctx.fill();
    ctx.fillStyle = car.dead ? '#222' : '#9fc6d4';
    roundRect(ctx, -w / 2 + 5, -h / 2 + 4, 9, h - 8, 3);
    ctx.fill();
    // Headlights / taillights.
    ctx.fillStyle = '#fff8c8';
    ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 5);
    ctx.fillRect(w / 2 - 2, h / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-w / 2 - 1, -h / 2 + 3, 3, 5);
    ctx.fillRect(-w / 2 - 1, h / 2 - 8, 3, 5);
    // Damage: dents + smoke handled by particles.
    if (car.health < 55 && !car.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(-w / 4, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Player marker above the player's car.
    if (car.isPlayer) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(car.x, car.y - 34 - Math.sin(time * 3) * 3);
      ctx.lineTo(car.x - 7, car.y - 46 - Math.sin(time * 3) * 3);
      ctx.lineTo(car.x + 7, car.y - 46 - Math.sin(time * 3) * 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawPeds(ctx, state, vx0, vy0, vx1, vy1) {
    for (const p of state.peds) {
      if (p.x < vx0 || p.y < vy0 || p.x > vx1 || p.y > vy1) continue;
      this.drawPerson(ctx, p.x, p.y, p.angle, p.shirt, p.skin, p.state === 'down');
    }
    for (const c of state.cops) {
      if (c.x < vx0 || c.y < vy0 || c.x > vx1 || c.y > vy1) continue;
      this.drawPerson(ctx, c.x, c.y, c.angle, '#2b3a55', '#f2c89b', false, true);
    }
  }

  drawPerson(ctx, x, y, angle, shirt, skin, down, isCop = false) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      // Lying flat.
      ctx.rotate(angle);
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(12, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    // Body.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(4, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // Arms hint.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(-2, -9, 3.5, 0, Math.PI * 2);
    ctx.arc(-2, 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (isCop) {
      ctx.fillStyle = '#141c2a';
      ctx.fillRect(0, -6, 8, 12);
    }
    ctx.restore();
  }

  drawPlayer(ctx, state) {
    const p = state.player;
    if (p.inCar) return;
    // Aiming line when the mouse is down.
    if (state.input.mouseDown) {
      const mx = state.camera.x - this.viewW / 2 + state.input.mouseX;
      const my = state.camera.y - this.viewH / 2 + state.input.mouseY;
      const a = Math.atan2(my - p.y, mx - p.x);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18);
      ctx.lineTo(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60);
      ctx.stroke();
    }
    this.drawPerson(ctx, p.x, p.y, p.angle, '#1f9d8a', '#f2c89b', false);
    // Cap.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(4, -5, 8, 10);
    ctx.restore();
  }

  drawBullets(ctx, state) {
    ctx.fillStyle = '#ffe27a';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx, state) {
    for (const pt of state.particles) {
      const t = pt.life / pt.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (2 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- minimap ---------------------------------------------------------------

  drawMinimap(state) {
    const m = this.mapCtx;
    const S = this.map.width;
    const scale = S / WORLD.width;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, S, S);
    // Round clip.
    m.save();
    m.beginPath();
    m.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    m.clip();
    m.fillStyle = '#6da34e';
    m.fillRect(0, 0, S, S);
    // Beach.
    m.fillStyle = '#e8d29a';
    m.fillRect(0, WORLD.beachY * scale, S, S - WORLD.beachY * scale);
    m.fillStyle = '#3fa7c4';
    m.fillRect(0, (WORLD.height - 46) * scale, S, 46 * scale);
    // Roads.
    m.fillStyle = '#3a3f4a';
    for (const c of state.city.roads) {
      m.fillRect(c * scale - (WORLD.roadWidth * scale) / 2, 0, WORLD.roadWidth * scale, S);
      m.fillRect(0, c * scale - (WORLD.roadWidth * scale) / 2, S, WORLD.roadWidth * scale);
    }
    // Buildings.
    m.fillStyle = '#d8cdb8';
    for (const b of state.city.buildings) {
      m.fillRect(b.x * scale, b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
    }
    // Mission beacon.
    const obj = state.missions.objectivePos();
    if (obj) {
      const pulse = 5 + Math.sin(state.time * 4) * 2;
      m.fillStyle = '#ffd23c';
      m.beginPath();
      m.arc(obj.x * scale, obj.y * scale, pulse, 0, Math.PI * 2);
      m.fill();
      m.strokeStyle = '#8a6a00';
      m.lineWidth = 1.5;
      m.stroke();
    }
    // Cops.
    for (const c of state.cars) {
      if (!c.isPolice || c.dead) continue;
      m.fillStyle = Math.sin(c.sirenPhase) > 0 ? '#ff2e2e' : '#2e6bff';
      m.beginPath();
      m.arc(c.x * scale, c.y * scale, 3.5, 0, Math.PI * 2);
      m.fill();
    }
    for (const cop of state.cops) {
      m.fillStyle = '#2e6bff';
      m.beginPath();
      m.arc(cop.x * scale, cop.y * scale, 3, 0, Math.PI * 2);
      m.fill();
    }
    // Player arrow.
    const p = state.player;
    const ang = p.inCar && p.car ? p.car.angle : p.angle;
    m.save();
    m.translate(p.x * scale, p.y * scale);
    m.rotate(ang);
    m.fillStyle = '#ffffff';
    m.strokeStyle = '#222';
    m.lineWidth = 1;
    m.beginPath();
    m.moveTo(8, 0);
    m.lineTo(-5, -5);
    m.lineTo(-5, 5);
    m.closePath();
    m.fill();
    m.stroke();
    m.restore();
    m.restore();
    // Rim.
    m.strokeStyle = 'rgba(255,255,255,0.85)';
    m.lineWidth = 3;
    m.beginPath();
    m.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    m.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
