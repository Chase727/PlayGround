import { clamp } from './core.js';

function quad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

function onScreen(r, x, y, margin = 160) {
  return x > -margin && x < r.w + margin && y > -margin && y < r.h + margin;
}

export function drawBuilding(r, ctx, b, time) {
  const { x, y, w, d, h } = b;
  const corners = [
    [x - w / 2, y - d / 2], [x + w / 2, y - d / 2],
    [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]
  ];
  const base = corners.map(([cx, cy]) => r.project(cx, cy, 0));
  const top = corners.map(([cx, cy]) => r.project(cx, cy, h));
  if (!onScreen(r, base[2].x, base[2].y, 240)) return;

  // Right (+x) face.
  quad(ctx, base[1], base[2], top[2], top[1]);
  const rightGrad = ctx.createLinearGradient(base[1].x, base[1].y, base[2].x, top[1].y);
  rightGrad.addColorStop(0, b.mid);
  rightGrad.addColorStop(1, b.dark);
  ctx.fillStyle = rightGrad;
  ctx.fill();

  // Front (+y) face.
  quad(ctx, base[2], base[3], top[3], top[2]);
  const frontGrad = ctx.createLinearGradient(base[2].x, base[2].y, top[2].x, top[2].y);
  frontGrad.addColorStop(0, b.dark);
  frontGrad.addColorStop(1, b.deep);
  ctx.fillStyle = frontGrad;
  ctx.fill();

  // Roof.
  ctx.beginPath();
  top.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = b.deep;
  ctx.fill();
  ctx.strokeStyle = b.glow;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Window rows on both visible faces.
  const scale = r.zoom / 3.3;
  if (scale > 0.7) {
    const cols = Math.min(4, b.windows);
    const floors = Math.min(6, b.floors);
    const margin = 0.16;
    for (let face = 0; face < 2; face += 1) {
      for (let row = 0; row < floors; row += 1) {
        const z0 = h * (0.12 + (row / floors) * 0.72);
        const z1 = z0 + Math.max(1.1, h * 0.055);
        for (let col = 0; col < cols; col += 1) {
          const lit = Math.sin(b.seed + row * 7.13 + col * 3.71 + face * 2.3) > -0.18;
          if (!lit) continue;
          const u0 = margin + (col / cols) * (1 - margin * 2);
          const u1 = u0 + (1 - margin * 2) / cols * 0.62;
          let p0;
          let p1;
          let p2;
          let p3;
          if (face === 0) {
            const ya = y - d / 2 + u0 * d;
            const yb = y - d / 2 + u1 * d;
            p0 = r.project(x + w / 2, ya, z0);
            p1 = r.project(x + w / 2, yb, z0);
            p2 = r.project(x + w / 2, yb, z1);
            p3 = r.project(x + w / 2, ya, z1);
          } else {
            const xa = x + w / 2 - u0 * w;
            const xb = x + w / 2 - u1 * w;
            p0 = r.project(xa, y + d / 2, z0);
            p1 = r.project(xb, y + d / 2, z0);
            p2 = r.project(xb, y + d / 2, z1);
            p3 = r.project(xa, y + d / 2, z1);
          }
          if (Math.abs(p2.x - p0.x) + Math.abs(p2.y - p0.y) < 1.2) continue;
          quad(ctx, p0, p1, p2, p3);
          ctx.fillStyle = b.glow;
          ctx.globalAlpha = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(time * 0.8 + b.seed + row + col));
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // Neon vertical strip on the closest corner.
  ctx.save();
  ctx.strokeStyle = b.glow;
  ctx.shadowColor = b.glow;
  ctx.shadowBlur = 14;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = Math.max(1, scale * 1.1);
  ctx.beginPath();
  ctx.moveTo(base[2].x, base[2].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.stroke();
  ctx.globalAlpha = 0.24;
  ctx.beginPath();
  ctx.moveTo(top[1].x, top[1].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.lineTo(top[3].x, top[3].y);
  ctx.stroke();
  ctx.restore();

  if (h > 48) {
    const antenna = r.project(x + w * 0.18, y + d * 0.18, h + 7);
    ctx.strokeStyle = 'rgba(140,190,220,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(top[2].x, top[2].y);
    ctx.lineTo(antenna.x, antenna.y);
    ctx.stroke();
    ctx.fillStyle = Math.sin(time * 2.4 + b.seed) > 0 ? '#ff6f9c' : '#5c1b32';
    ctx.beginPath();
    ctx.arc(antenna.x, antenna.y, Math.max(1.4, scale * 2), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPylon(r, ctx, p, time) {
  const base = r.project(p.x, p.y, 0);
  const top = r.project(p.x, p.y, p.h);
  if (!onScreen(r, base.x, base.y, 130)) return;
  const scale = clamp(r.zoom / 3.3, 0.7, 1.4);
  const pulse = 0.65 + Math.sin(time * 2 + p.seed) * 0.25;

  ctx.save();
  ctx.strokeStyle = 'rgba(108,144,176,0.55)';
  ctx.lineWidth = Math.max(1, scale * 1.5);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();

  ctx.strokeStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();

  ctx.globalAlpha = pulse;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(top.x, top.y, Math.max(1.8, scale * 3.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.16 * pulse;
  ctx.beginPath();
  ctx.arc(top.x, top.y, Math.max(5, scale * 10), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, scale * 7, scale * 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawSign(r, ctx, s, time) {
  const base = r.project(s.x, s.y, 0);
  const top = r.project(s.x, s.y, s.h);
  if (!onScreen(r, base.x, base.y, 220)) return;
  const scale = clamp(r.zoom / 3.3, 0.75, 1.4);
  const panelW = 74 * scale;
  const panelH = 27 * scale;
  const bob = Math.sin(time * 1.4 + s.x) * 2 * scale;
  const cx = top.x;
  const cy = top.y - panelH * 0.5 + bob;

  ctx.save();
  ctx.strokeStyle = 'rgba(118,160,190,0.55)';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(base.x - 5 * scale, base.y);
  ctx.lineTo(cx - panelW * 0.32, cy + panelH * 0.5);
  ctx.moveTo(base.x + 5 * scale, base.y);
  ctx.lineTo(cx + panelW * 0.32, cy + panelH * 0.5);
  ctx.stroke();

  ctx.fillStyle = 'rgba(4,9,20,0.84)';
  ctx.strokeStyle = s.color;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(cx - panelW / 2, cy - panelH / 2, panelW, panelH);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 8;
  ctx.fillStyle = s.color;
  ctx.font = `900 ${Math.round(11 * scale)}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.text, cx, cy + scale * 0.6);
  ctx.globalAlpha = 0.3;
  ctx.fillRect(cx - panelW / 2, cy + panelH / 2 + 3 * scale, panelW, scale);
  ctx.restore();
}

export function drawCar(r, ctx, car, time) {
  const base = r.project(car.x, car.y, 0);
  if (!onScreen(r, base.x, base.y, 120)) return;
  const front = r.project(car.x + Math.cos(car.angle) * 2, car.y + Math.sin(car.angle) * 2, 0);
  const screenAngle = Math.atan2(front.y - base.y, front.x - base.x);
  const scale = clamp(r.zoom / 3.3, 0.78, 1.35) * (car.size || 1);
  const L = 41 * scale;
  const W = 19 * scale;
  const accent = car.accent;

  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(screenAngle);

  // Player marker ring.
  if (car.player) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.28 + Math.sin(time * 5) * 0.08;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.62, W * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Ground shadow and neon underglow.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.filter = 'blur(2px)';
  ctx.beginPath();
  ctx.ellipse(-L * 0.02, W * 0.1, L * 0.56, W * 0.54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 0.55);
  glow.addColorStop(0, `${car.glow}3d`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.62, W * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Headlight wash.
  if (!car.ai || r.zoom > 2.1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(L * 0.4, 0, L * 0.4 + L * 2.4, 0);
    beam.addColorStop(0, 'rgba(210,245,255,0.1)');
    beam.addColorStop(1, 'rgba(120,210,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(L * 0.4, -W * 0.32);
    ctx.lineTo(L * 2.5, -W * 1.5);
    ctx.lineTo(L * 2.5, W * 1.5);
    ctx.lineTo(L * 0.4, W * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Body with a pointed nose and a squared-off rear.
  const bodyGrad = ctx.createLinearGradient(-L * 0.5, 0, L * 0.5, 0);
  bodyGrad.addColorStop(0, car.bodyDark || '#08131d');
  bodyGrad.addColorStop(0.42, car.body);
  bodyGrad.addColorStop(0.82, car.body);
  bodyGrad.addColorStop(1, car.bodyLight || car.body);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.7, 0.75 * scale);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(L * 0.53, 0);
  ctx.quadraticCurveTo(L * 0.48, -W * 0.26, L * 0.33, -W * 0.36);
  ctx.lineTo(L * 0.08, -W * 0.46);
  ctx.lineTo(-L * 0.31, -W * 0.45);
  ctx.lineTo(-L * 0.5, -W * 0.33);
  ctx.lineTo(-L * 0.54, -W * 0.18);
  ctx.lineTo(-L * 0.54, W * 0.18);
  ctx.lineTo(-L * 0.5, W * 0.33);
  ctx.lineTo(-L * 0.31, W * 0.45);
  ctx.lineTo(L * 0.08, W * 0.46);
  ctx.lineTo(L * 0.33, W * 0.36);
  ctx.quadraticCurveTo(L * 0.48, W * 0.26, L * 0.53, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Wheels straddle the body so they read at a glance.
  const wheelW = L * 0.21;
  const wheelH = W * 0.27;
  for (const [wx, wy, steering] of [
    [L * 0.3, -W * 0.53, true], [L * 0.3, W * 0.53, true],
    [-L * 0.32, -W * 0.53, false], [-L * 0.32, W * 0.53, false]
  ]) {
    ctx.save();
    ctx.translate(wx, wy);
    if (steering) ctx.rotate((car.steer || 0) * 0.34);
    ctx.fillStyle = '#05080e';
    ctx.beginPath();
    ctx.roundRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH, 1.8 * scale);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,188,208,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-wheelW * 0.22, -wheelH * 0.28);
    ctx.lineTo(wheelW * 0.22, -wheelH * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  // Cabin and glass.
  ctx.fillStyle = 'rgba(4,10,18,0.96)';
  ctx.beginPath();
  ctx.roundRect(-L * 0.16, -W * 0.4, L * 0.36, W * 0.8, 3 * scale);
  ctx.fill();
  const glass = ctx.createLinearGradient(0, -W * 0.3, 0, W * 0.3);
  glass.addColorStop(0, 'rgba(47,136,175,0.9)');
  glass.addColorStop(0.45, 'rgba(10,32,50,0.98)');
  glass.addColorStop(1, 'rgba(36,107,145,0.7)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.roundRect(-L * 0.07, -W * 0.32, L * 0.19, W * 0.64, 2 * scale);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(L * 0.1, -W * 0.27);
  ctx.lineTo(L * 0.1, W * 0.27);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Centre stripe / livery.
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = accent;
  ctx.fillRect(-L * 0.47, -W * 0.045, L * 0.88, W * 0.09);
  ctx.globalAlpha = 1;

  // Headlight and tail-light bars.
  ctx.fillStyle = '#eeffff';
  ctx.shadowColor = '#dffcff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(L * 0.45, -W * 0.19, L * 0.045, W * 0.15, 1);
  ctx.roundRect(L * 0.45, W * 0.04, L * 0.045, W * 0.15, 1);
  ctx.fill();
  ctx.fillStyle = '#ff3d63';
  ctx.shadowColor = '#ff3d63';
  ctx.beginPath();
  ctx.roundRect(-L * 0.52, -W * 0.27, L * 0.035, W * 0.54, 1);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Spoiler.
  ctx.fillStyle = car.bodyDark || '#09121c';
  ctx.fillRect(-L * 0.55, -W * 0.46, L * 0.065, W * 0.92);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-L * 0.555, -W * 0.46, L * 0.012, W * 0.12);
  ctx.fillRect(-L * 0.555, W * 0.34, L * 0.012, W * 0.12);
  ctx.globalAlpha = 1;

  // Nitro flame.
  if (car.boosting) {
    const flicker = 0.7 + Math.sin(time * 38 + (car.seed || 0)) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    const flame = ctx.createLinearGradient(-L * 0.5, 0, -L * 0.5 - 38 * scale * flicker, 0);
    flame.addColorStop(0, 'rgba(255,255,255,0.95)');
    flame.addColorStop(0.35, 'rgba(94,244,255,0.8)');
    flame.addColorStop(1, 'rgba(94,244,255,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-L * 0.48, -W * 0.22);
    ctx.lineTo(-L * 0.5 - 38 * scale * flicker, 0);
    ctx.lineTo(-L * 0.48, W * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();

  if (car.player) {
    const bob = Math.sin(time * 4.2) * 2.2 * scale;
    const my = base.y - 30 * scale - 9 + bob;
    ctx.save();
    ctx.fillStyle = '#c7fdff';
    ctx.shadowColor = '#5ef4ff';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(base.x, my + 6 * scale);
    ctx.lineTo(base.x - 4.5 * scale, my - 2 * scale);
    ctx.lineTo(base.x + 4.5 * scale, my - 2 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
