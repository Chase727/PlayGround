import { TAU, distanceSq, mod, mulberry32 } from './core.js';

const CONTROL_POINTS = [
  [60, 225], [-40, 205], [-105, 150], [-120, 80], [-190, 45],
  [-205, -60], [-185, -120], [-150, -160], [-20, -190], [110, -170],
  [190, -95], [185, 10], [120, 55], [70, 10], [35, -35],
  [5, 5], [30, 80], [110, 120], [140, 190]
];

const STEPS_PER_SEGMENT = 30;
const ROAD_HALF = 11.2;
const SHOULDER = 5.6;
const WALL = 16.6;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  };
}

export class Track {
  constructor() {
    this.roadHalf = ROAD_HALF;
    this.shoulder = SHOULDER;
    this.wall = WALL;
    this.points = this.sample();
    this.length = this.points[this.points.length - 1].s + this.segmentLength(this.points.length - 1, 0);
    this.checkpoints = [];
    for (let i = 0; i < 8; i += 1) {
      const fraction = i / 8;
      const point = this.pointAtDistance(fraction * this.length);
      this.checkpoints.push({ ...point, fraction, number: i + 1 });
    }
    this.props = this.buildProps();
    this.start = this.pointAtDistance(0);
  }

  sample() {
    const points = [];
    const count = CONTROL_POINTS.length;
    for (let i = 0; i < count; i += 1) {
      const p0 = CONTROL_POINTS[(i - 1 + count) % count];
      const p1 = CONTROL_POINTS[i];
      const p2 = CONTROL_POINTS[(i + 1) % count];
      const p3 = CONTROL_POINTS[(i + 2) % count];
      for (let step = 0; step < STEPS_PER_SEGMENT; step += 1) {
        points.push(catmullRom(p0, p1, p2, p3, step / STEPS_PER_SEGMENT));
      }
    }

    let distance = 0;
    for (let i = 0; i < points.length; i += 1) {
      const prev = points[(i - 1 + points.length) % points.length];
      const next = points[(i + 1) % points.length];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const length = Math.hypot(dx, dy) || 1;
      points[i].tx = dx / length;
      points[i].ty = dy / length;
      points[i].nx = -points[i].ty;
      points[i].ny = points[i].tx;
      points[i].s = distance;
      const following = points[(i + 1) % points.length];
      distance += Math.hypot(following.x - points[i].x, following.y - points[i].y);
    }
    return points;
  }

  segmentLength(index, nextIndex) {
    const a = this.points[index];
    const b = this.points[nextIndex];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  normalizeDistance(value) {
    return mod(value, this.length);
  }

  pointAtDistance(distance) {
    const d = this.normalizeDistance(distance);
    const points = this.points;
    let low = 0;
    let high = points.length - 1;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (points[mid].s <= d) low = mid;
      else high = mid;
    }
    const a = points[low];
    const index = (low + 1) % points.length;
    const b = points[index];
    const segment = Math.max(0.0001, b.s > a.s ? b.s - a.s : this.length - a.s);
    const t = Math.max(0, Math.min(1, (d - a.s) / segment));
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const tx = a.tx + (b.tx - a.tx) * t;
    const ty = a.ty + (b.ty - a.ty) * t;
    const tl = Math.hypot(tx, ty) || 1;
    return {
      x,
      y,
      tx: tx / tl,
      ty: ty / tl,
      nx: -ty / tl,
      ny: tx / tl,
      s: d,
      index: low
    };
  }

  lanePoint(distance, offset) {
    const p = this.pointAtDistance(distance);
    return { ...p, x: p.x + p.nx * offset, y: p.y + p.ny * offset };
  }

  nearest(x, y) {
    const points = this.points;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const p = points[best];
    const dx = x - p.x;
    const dy = y - p.y;
    const distance = Math.sqrt(bestDist);
    return {
      index: best,
      s: p.s,
      distance,
      x: p.x,
      y: p.y,
      nx: distance > 0.0001 ? dx / distance : p.nx,
      ny: distance > 0.0001 ? dy / distance : p.ny,
      tx: p.tx,
      ty: p.ty,
      roadHalf: ROAD_HALF
    };
  }

  distanceToTrack(x, y) {
    return this.nearest(x, y).distance;
  }

  buildProps() {
    const random = mulberry32(20261106);
    const buildings = [];
    const palette = [
      ['#1a1d3a', '#2a2352', '#0c1024', '#5ef4ff'],
      ['#241638', '#371b4d', '#100b20', '#ff4fd8'],
      ['#0f2436', '#16374c', '#08111e', '#5ef4ff'],
      ['#251c2c', '#332545', '#0e0b16', '#ffd166'],
      ['#121d2a', '#1a2b3d', '#080d15', '#a8ff78']
    ];

    let attempts = 0;
    while (buildings.length < 34 && attempts < 900) {
      attempts += 1;
      const x = (random() - 0.5) * 620;
      const y = (random() - 0.5) * 620;
      const w = 16 + random() * 26;
      const d = 16 + random() * 26;
      const radius = Math.max(w, d) * 0.65;
      if (this.distanceToTrack(x, y) < 29 + radius) continue;
      let overlaps = false;
      for (const other of buildings) {
        if (Math.abs(x - other.x) < (w + other.w) * 0.72 + 4 && Math.abs(y - other.y) < (d + other.d) * 0.72 + 4) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      const scheme = palette[Math.floor(random() * palette.length)];
      const height = 12 + random() * random() * 62;
      buildings.push({
        type: 'building',
        x,
        y,
        w,
        d,
        h: height,
        dark: scheme[0],
        mid: scheme[1],
        deep: scheme[2],
        glow: scheme[3],
        windows: 2 + Math.floor(random() * 4),
        floors: 2 + Math.floor(random() * 5),
        seed: random() * 1000
      });
    }

    const pylons = [];
    for (let i = 3; i < this.points.length; i += 13) {
      const p = this.points[i];
      const side = Math.floor(i / 13) % 2 === 0 ? 1 : -1;
      const offset = 19.5 + random() * 3;
      pylons.push({
        type: 'pylon',
        x: p.x + p.nx * offset * side,
        y: p.y + p.ny * offset * side,
        h: 5.5 + random() * 5,
        color: random() > 0.42 ? '#5ef4ff' : '#ff4fd8',
        seed: random() * 100
      });
    }

    const specks = [];
    for (let i = 0; i < 150; i += 1) {
      const x = (random() - 0.5) * 760;
      const y = (random() - 0.5) * 760;
      if (this.distanceToTrack(x, y) < 15) continue;
      specks.push({
        x,
        y,
        size: 1 + random() * 2.3,
        color: random() > 0.78 ? '#ff4fd8' : random() > 0.45 ? '#5ef4ff' : '#8b7dff',
        phase: random() * TAU
      });
    }

    const signs = [
      { fraction: 0.19, offset: 25, text: 'NEON', color: '#5ef4ff' },
      { fraction: 0.49, offset: 26, text: 'DRIFT', color: '#ff4fd8' },
      { fraction: 0.72, offset: 24, text: 'N2O', color: '#ffd166' }
    ].map((sign) => {
      const p = this.pointAtDistance(sign.fraction * this.length);
      return {
        type: 'sign',
        x: p.x + p.nx * sign.offset,
        y: p.y + p.ny * sign.offset,
        h: 11,
        text: sign.text,
        color: sign.color
      };
    });

    return { buildings, pylons, specks, signs };
  }
}
