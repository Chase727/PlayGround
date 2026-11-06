import { clamp } from './core.js';

export class PlayerCar {
  constructor(track) {
    this.player = true;
    this.ai = false;
    this.body = '#13b9d8';
    this.bodyDark = '#03141e';
    this.bodyLight = '#78f4ff';
    this.accent = '#d6fdff';
    this.glow = '#4de9ff';
    this.reset(track);
  }

  reset(track) {
    const start = track.start;
    this.x = start.x;
    this.y = start.y;
    this.angle = Math.atan2(start.ty, start.tx);
    this.vx = 0;
    this.vy = 0;
    this.vf = 0;
    this.vl = 0;
    this.speed = 0;
    this.slip = 0;
    this.steer = 0;
    this.offRoad = false;
    this.boosting = false;
    this.skidTrail = [null, null];
    this.smokeTimer = 0;
    this.sparkTimer = 0;
  }

  update(dt, input, game) {
    const track = game.track;
    const throttle = input.throttle;
    const brake = input.brake;
    const handbrake = input.handbrake;

    this.steer += (input.steer - this.steer) * Math.min(1, dt * 9.5);
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const rx = -fy;
    const ry = fx;
    let vf = this.vx * fx + this.vy * fy;
    let vl = this.vx * rx + this.vy * ry;
    const speed = Math.hypot(this.vx, this.vy);

    const steerAuthority = clamp(Math.abs(vf) / 7, 0, 1) * (1 - clamp(speed / 190, 0, 0.42));
    this.angle += this.steer * 2.12 * steerAuthority * dt * (vf < -0.5 ? -1 : 1);

    const nfx = Math.cos(this.angle);
    const nfy = Math.sin(this.angle);
    const nrx = -nfy;
    const nry = nfx;
    vf = this.vx * nfx + this.vy * nfy;
    vl = this.vx * nrx + this.vy * nry;

    const boosting = Boolean(input.boost) && game.nitro > 0.5 && !this.offRoad;
    if (boosting) {
      game.nitro = Math.max(0, game.nitro - 27 * dt);
      vf += 48 * dt;
    }

    if (throttle) {
      const limiter = 1 - clamp(vf / 120, 0, 1) * 0.55;
      vf += (boosting ? 82 : 62) * dt * Math.max(0.16, limiter);
    }
    if (brake) {
      if (vf > 0.8) vf -= 88 * dt;
      else vf -= 31 * dt;
    }

    vf *= Math.exp(-(boosting ? 0.2 : 0.34) * dt);
    if (handbrake) vf *= Math.exp(-0.52 * dt);
    vf = clamp(vf, -27, boosting ? 148 : 112);

    if (boosting && !this.boosting && game.audio) game.audio.boost();
    this.boosting = boosting;

    const roadFactor = this.offRoad ? 2.2 : 0;
    const baseGrip = handbrake ? 1.55 : 6.5 - clamp(speed / 120, 0, 1) * 2.3 - Math.abs(this.steer) * 1.15;
    const grip = Math.max(0.8, baseGrip - roadFactor);
    vl *= Math.exp(-grip * dt);
    if (this.offRoad) vf *= Math.exp(-1.55 * dt);

    this.vx = nfx * vf + nrx * vl;
    this.vy = nfy * vf + nry * vl;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.vf = vf;
    this.vl = vl;
    this.speed = Math.hypot(this.vx, this.vy);
    this.slip = Math.abs(Math.atan2(vl, Math.abs(vf) + 0.6));

    const near = track.nearest(this.x, this.y);
    this.near = near;
    this.offRoad = near.distance > track.roadHalf + 0.55;
    game.offRoad = this.offRoad;

    const limit = track.roadHalf + track.shoulder - 0.9;
    if (near.distance > limit) {
      this.x = near.x + near.nx * limit;
      this.y = near.y + near.ny * limit;
      const outward = this.vx * near.nx + this.vy * near.ny;
      if (outward > 0) {
        this.vx -= near.nx * outward * 1.35;
        this.vy -= near.ny * outward * 1.35;
      }
      this.vx *= 0.7;
      this.vy *= 0.7;
      if (game.crashCooldown <= 0) game.onCrash(Math.abs(outward));
    }
  }

  rearWheels() {
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const sx = -fy;
    const sy = fx;
    const back = -3.05;
    return [1, -1].map((side) => ({
      x: this.x + fx * back + sx * 1.55 * side,
      y: this.y + fy * back + sy * 1.55 * side
    }));
  }
}
