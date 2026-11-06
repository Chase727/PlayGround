import { TAU, clamp } from './core.js';
import { drawBuilding, drawPylon, drawSign, drawCar } from './sprites.js';

const ISO_X = 0.866;
const ISO_Y = 0.5;

export class Renderer {
  constructor(canvas, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.track = track;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.camera = { x: 0, y: 0, zoom: 3, shake: 0 };
    this.shakeX = 0;
    this.shakeY = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  project(x, y, z = 0) {
    const cam = this.camera;
    const dx = x - cam.x;
    const dy = y - cam.y;
    return {
      x: this.w * 0.5 + (dx - dy) * ISO_X * cam.zoom + this.shakeX,
      y: this.h * 0.555 + (dx + dy) * ISO_Y * cam.zoom - z * cam.zoom * 0.92 + this.shakeY
    };
  }

  draw(game) {
    this.camera = game.camera;
    this.zoom = game.camera.zoom;
    const shake = game.camera.shake || 0;
    this.shakeX = (Math.random() - 0.5) * shake * 14;
    this.shakeY = (Math.random() - 0.5) * shake * 10;
    const ctx = this.ctx;

    this.drawBackground(game);
    this.drawGrid(game);
    this.drawSpecks(game);
    this.drawTrack(game);
    this.drawSkids(game);
    this.drawGates(game);
    this.drawWorld(game);
    this.drawParticles(game);
    this.drawSpeedLines(game);
    this.shakeX = 0;
    this.shakeY = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBackground(game) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, '#070b18');
    grad.addColorStop(0.42, '#0a1122');
    grad.addColorStop(0.72, '#0b1424');
    grad.addColorStop(1, '#050912');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    const glow = ctx.createRadialGradient(this.w * 0.54, this.h * 0.42, 10, this.w * 0.54, this.h * 0.42, this.h * 0.85);
    glow.addColorStop(0, 'rgba(40,75,150,0.13)');
    glow.addColorStop(0.5, 'rgba(24,42,92,0.05)');
    glow.addColorStop(1, 'rgba(2,4,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawGrid(game) {
    const ctx = this.ctx;
    const cam = this.camera;
    const step = 38;
    const span = 480;
    const startX = Math.floor((cam.x - span) / step) * step;
    const startY = Math.floor((cam.y - span) / step) * step;
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = startX; x <= cam.x + span; x += step) {
      const a = this.project(x, cam.y - span);
      const b = this.project(x, cam.y + span);
      if ((a.x < -400 && b.x < -400) || (a.x > this.w + 400 && b.x > this.w + 400)) continue;
      const major = Math.abs(x / step) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(77,135,172,0.13)' : 'rgba(63,113,150,0.075)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let y = startY; y <= cam.y + span; y += step) {
      const a = this.project(cam.x - span, y);
      const b = this.project(cam.x + span, y);
      if ((a.y < -400 && b.y < -400) || (a.y > this.h + 400 && b.y > this.h + 400)) continue;
      const major = Math.abs(y / step) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(77,135,172,0.13)' : 'rgba(63,113,150,0.075)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSpecks(game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const speck of this.track.props.specks) {
      const p = this.project(speck.x, speck.y, 0);
      if (p.x < -20 || p.x > this.w + 20 || p.y < -20 || p.y > this.h + 20) continue;
      const alpha = 0.18 + 0.14 * Math.sin(game.clock * 1.7 + speck.phase);
      ctx.globalAlpha = Math.max(0.05, alpha);
      ctx.fillStyle = speck.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, speck.size * (this.zoom / 3.3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  offsetPath(half) {
    const ctx = this.ctx;
    const points = this.track.points;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const s = this.project(p.x + p.nx * half, p.y + p.ny * half);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
  }

  drawTrack(game) {
    const ctx = this.ctx;
    const track = this.track;
    const scale = clamp(this.zoom / 3.3, 0.6, 1.5);

    // Run-off shoulder.
    ctx.save();
    this.offsetPath(track.roadHalf + track.shoulder);
    const shoulderGrad = ctx.createLinearGradient(0, 0, 0, this.h);
    shoulderGrad.addColorStop(0, '#161d2c');
    shoulderGrad.addColorStop(1, '#0d121e');
    ctx.fillStyle = shoulderGrad;
    ctx.fill();
    ctx.restore();

    // Asphalt.
    this.offsetPath(track.roadHalf);
    const roadGrad = ctx.createLinearGradient(0, 0, 0, this.h);
    roadGrad.addColorStop(0, '#293144');
    roadGrad.addColorStop(0.55, '#222a3b');
    roadGrad.addColorStop(1, '#1a2030');
    ctx.fillStyle = roadGrad;
    ctx.fill();

    // Soft inner glow / racing surface sheen.
    this.offsetPath(track.roadHalf * 0.74);
    ctx.strokeStyle = 'rgba(94,244,255,0.035)';
    ctx.lineWidth = 18 * scale;
    ctx.stroke();

    // Curbs.
    const curbColors = ['#ff4f6d', '#e9fbff'];
    const points = track.points;
    const step = 5;
    for (let i = 0; i < points.length; i += step) {
      const a = points[i];
      const b = points[(i + step) % points.length];
      for (const side of [1, -1]) {
        const inner = track.roadHalf;
        const outer = track.roadHalf + 1.5;
        const a1 = this.project(a.x + a.nx * inner * side, a.y + a.ny * inner * side);
        const b1 = this.project(b.x + b.nx * inner * side, b.y + b.ny * inner * side);
        const b2 = this.project(b.x + b.nx * outer * side, b.y + b.ny * outer * side);
        const a2 = this.project(a.x + a.nx * outer * side, a.y + a.ny * outer * side);
        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
        ctx.fillStyle = curbColors[(i / step + (side > 0 ? 1 : 0)) % 2 | 0];
        ctx.globalAlpha = i % 10 === 0 ? 0.6 : 0.45;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Glowing edge lines.
    ctx.save();
    ctx.strokeStyle = 'rgba(94,244,255,0.82)';
    ctx.shadowColor = 'rgba(94,244,255,0.8)';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.15;
    for (const side of [1, -1]) {
      this.offsetPath(track.roadHalf * side + (side > 0 ? 0.3 : -0.3));
      ctx.stroke();
    }
    ctx.restore();

    // Outer guard rail.
    ctx.save();
    ctx.strokeStyle = 'rgba(72,108,136,0.5)';
    ctx.lineWidth = 3;
    this.offsetPath(track.roadHalf + track.shoulder + 1.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,209,102,0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 16]);
    this.offsetPath(track.roadHalf + track.shoulder + 1.2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < points.length; i += 14) {
      const p = points[i];
      for (const side of [1, -1]) {
        const base = this.project(p.x + p.nx * (track.roadHalf + track.shoulder + 1.2) * side, p.y + p.ny * (track.roadHalf + track.shoulder + 1.2) * side);
        const top = this.project(p.x + p.nx * (track.roadHalf + track.shoulder + 1.2) * side, p.y + p.ny * (track.roadHalf + track.shoulder + 1.2) * side, 1.7);
        ctx.strokeStyle = 'rgba(104,146,175,0.55)';
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Centre line.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,211,112,0.26)';
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    ctx.setLineDash([15 * scale, 18 * scale]);
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const p = this.project(points[i].x, points[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Direction chevrons.
    ctx.save();
    ctx.strokeStyle = 'rgba(94,244,255,0.22)';
    ctx.lineWidth = Math.max(1, 1.6 * scale);
    for (let i = 12; i < points.length; i += 44) {
      const p = points[i];
      const back = 3.5;
      const spread = 4.2;
      const c = this.project(p.x, p.y);
      const l = this.project(p.x - p.tx * back + p.nx * spread, p.y - p.ty * back + p.ny * spread);
      const r = this.project(p.x - p.tx * back - p.nx * spread, p.y - p.ty * back - p.ny * spread);
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
    ctx.restore();

    this.drawStartLine(game);
  }

  drawStartLine(game) {
    const ctx = this.ctx;
    const p = this.track.start;
    const half = this.track.roadHalf;
    const rows = 2;
    const cols = 12;
    const rowDepth = 2.4;
    ctx.save();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const f0 = (row / rows) * rowDepth - rowDepth * 0.5;
        const f1 = ((row + 1) / rows) * rowDepth - rowDepth * 0.5;
        const l0 = -half + (col / cols) * half * 2;
        const l1 = -half + ((col + 1) / cols) * half * 2;
        const corners = [
          [p.x + p.tx * f0 + p.nx * l0, p.y + p.ty * f0 + p.ny * l0],
          [p.x + p.tx * f0 + p.nx * l1, p.y + p.ty * f0 + p.ny * l1],
          [p.x + p.tx * f1 + p.nx * l1, p.y + p.ty * f1 + p.ny * l1],
          [p.x + p.tx * f1 + p.nx * l0, p.y + p.ty * f1 + p.ny * l0]
        ].map(([x, y]) => this.project(x, y));
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        const white = (row + col) % 2 === 0;
        ctx.fillStyle = white ? 'rgba(235,251,255,0.9)' : 'rgba(9,14,22,0.92)';
        ctx.fill();
      }
    }
    const a = this.project(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(94,244,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, 42 * (this.zoom / 3.3), 16 * (this.zoom / 3.3), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawSkids(game) {
    if (!game.skids.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(3,5,10,0.62)';
    ctx.lineWidth = Math.max(1.4, 2.5 * (this.zoom / 3.3));
    ctx.lineCap = 'round';
    for (const mark of game.skids) {
      const a = this.project(mark.x1, mark.y1);
      const b = this.project(mark.x2, mark.y2);
      if (Math.max(a.x, b.x) < -40 || Math.min(a.x, b.x) > this.w + 40) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGate(cp, active, isStart, game) {
    const ctx = this.ctx;
    const track = this.track;
    const side = track.roadHalf + 2.5;
    const left = { x: cp.x + cp.nx * side, y: cp.y + cp.ny * side };
    const right = { x: cp.x - cp.nx * side, y: cp.y - cp.ny * side };
    const height = isStart ? 10.5 : 6.4;
    const lb = this.project(left.x, left.y, 0);
    const rb = this.project(right.x, right.y, 0);
    const lt = this.project(left.x, left.y, height);
    const rt = this.project(right.x, right.y, height);
    const scale = clamp(this.zoom / 3.3, 0.6, 1.4);
    const color = active ? '#ffd166' : isStart ? '#5ef4ff' : 'rgba(94,244,255,0.6)';
    const pulse = active ? 0.7 + Math.sin(game.clock * 6) * 0.3 : 0.5;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = active ? 20 : 8;
    ctx.lineWidth = Math.max(1.2, scale * (isStart ? 2.6 : 1.8));
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.moveTo(lb.x, lb.y);
    ctx.lineTo(lt.x, lt.y);
    ctx.lineTo(rt.x, rt.y);
    ctx.lineTo(rb.x, rb.y);
    ctx.moveTo(lt.x, lt.y);
    ctx.lineTo(rt.x, rt.y);
    ctx.stroke();

    ctx.globalAlpha = pulse * 0.4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lt.x, lt.y, 2.5 * scale, 0, TAU);
    ctx.arc(rt.x, rt.y, 2.5 * scale, 0, TAU);
    ctx.fill();

    if (active && !isStart) {
      ctx.globalAlpha = 0.18 + Math.sin(game.clock * 6) * 0.08;
      ctx.fillStyle = color;
      quadFill(ctx, lb, rb, rt, lt);
      ctx.fill();
    }
    ctx.restore();

    if (isStart) {
      const centre = this.project(cp.x, cp.y, height + 2.2);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(12 * scale)}px "Arial Black", Impact, sans-serif`;
      ctx.fillStyle = active ? '#ffe39b' : '#e7fdff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillText('NEON DRIFT', centre.x, centre.y);
      ctx.font = `700 ${Math.round(7 * scale)}px monospace`;
      ctx.fillStyle = active ? '#ffd166' : 'rgba(180,230,245,0.65)';
      ctx.fillText('START / FINISH', centre.x, centre.y + 11 * scale);
      ctx.restore();
    }
  }

  drawGates(game) {
    for (const cp of this.track.checkpoints) {
      if (cp.fraction === 0) {
        this.drawGate(cp, game.state === 'menu' || game.nextGate === 7, true, game);
      } else {
        const index = Math.round(cp.fraction * 8) - 1;
        this.drawGate(cp, game.state === 'race' && game.nextGate === index, false, game);
      }
    }
  }

  drawWorld(game) {
    const ctx = this.ctx;
    const items = [];
    const props = this.track.props;
    for (const b of props.buildings) items.push({ depth: b.x + b.y, kind: 'building', item: b });
    for (const p of props.pylons) items.push({ depth: p.x + p.y, kind: 'pylon', item: p });
    for (const s of props.signs) items.push({ depth: s.x + s.y, kind: 'sign', item: s });
    for (const car of game.cars) items.push({ depth: car.x + car.y, kind: 'car', item: car });
    items.sort((a, b) => a.depth - b.depth);

    for (const entry of items) {
      if (entry.kind === 'building') drawBuilding(this, ctx, entry.item, game.clock);
      else if (entry.kind === 'pylon') drawPylon(this, ctx, entry.item, game.clock);
      else if (entry.kind === 'sign') drawSign(this, ctx, entry.item, game.clock);
      else drawCar(this, ctx, entry.item, game.clock);
    }
  }

  drawParticles(game) {
    const particles = game.particles;
    if (!particles.length) return;
    const ctx = this.ctx;
    ctx.save();
    for (const p of particles) {
      const s = this.project(p.x, p.y, p.z);
      if (s.x < -60 || s.x > this.w + 60 || s.y < -60 || s.y > this.h + 60) continue;
      const life = clamp(p.life / p.maxLife, 0, 1);
      const scale = clamp(this.zoom / 3.3, 0.65, 1.4);
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = life * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(0.8, p.size * scale * life), 0, TAU);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        const radius = Math.max(1, p.size * (1.7 - life * 0.7) * scale * 2.5);
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
        grad.addColorStop(0, `rgba(225,245,255,${0.32 * life})`);
        grad.addColorStop(0.55, `rgba(166,217,250,${0.15 * life})`);
        grad.addColorStop(1, 'rgba(120,180,230,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawSpeedLines(game) {
    if (game.state !== 'race' && game.state !== 'countdown') return;
    const speed = game.player.speed || 0;
    if (speed < 58 && !game.player.boosting) return;
    const ctx = this.ctx;
    const intensity = clamp((speed - 58) / 60, 0, 1) + (game.player.boosting ? 0.35 : 0);
    if (intensity <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(124,226,255,${0.06 + intensity * 0.08})`;
    ctx.lineWidth = 1;
    const cx = this.w / 2;
    const cy = this.h / 2;
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * TAU + game.clock * 0.05;
      const radius = Math.max(this.w, this.h) * (0.38 + ((i * 37) % 100) / 100 * 0.25);
      const length = 20 + ((i * 53) % 70) * intensity;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.72);
      ctx.lineTo(cx + Math.cos(angle) * (radius + length), cy + Math.sin(angle) * (radius + length) * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function quadFill(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}
