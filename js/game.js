import { clamp, damp, formatScore, formatTime, shortestDelta } from './core.js';
import { PlayerCar } from './car.js';

const AI_DEFS = [
  {
    body: '#ff4fd8', bodyDark: '#2b0a2f', bodyLight: '#ffa7ef', accent: '#ffd5f8', glow: '#ff4fd8',
    base: 50, lane: -3.2, seed: 1.7
  },
  {
    body: '#ffc14d', bodyDark: '#2c1c06', bodyLight: '#ffe3a1', accent: '#fff1c8', glow: '#ffc14d',
    base: 52, lane: 2.8, seed: 4.2
  },
  {
    body: '#a8ff78', bodyDark: '#10260c', bodyLight: '#ddffc8', accent: '#e9ffd8', glow: '#a8ff78',
    base: 54, lane: 0.2, seed: 7.9
  }
];

const ZERO_INPUT = {
  get throttle() { return 0; },
  get brake() { return 0; },
  get steer() { return 0; },
  get handbrake() { return false; },
  get boost() { return false; }
};

const STORE_KEY = 'neon-drift-best-v1';

export class Game {
  constructor({ canvas, track, renderer, input, audio, hud }) {
    this.canvas = canvas;
    this.track = track;
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.hud = hud;

    this.player = new PlayerCar(track);
    this.ai = AI_DEFS.map((def) => ({
      ...def,
      ai: true,
      player: false,
      x: 0,
      y: 0,
      angle: 0,
      vx: 0,
      vy: 0,
      speed: 0,
      steer: 0,
      progress: 0,
      size: 0.94
    }));
    this.cars = [this.player, ...this.ai];

    this.state = 'menu';
    this.clock = 0;
    this.time = 0;
    this.lap = 1;
    this.lapIndex = 0;
    this.nextGate = 0;
    this.total = 0;
    this.prevS = 0;
    this.lapStartTime = 0;
    this.bestLap = 0;
    this.lastLap = 0;
    this.score = 0;
    this.multiplier = 1;
    this.nitro = 0;
    this.position = 4;
    this.topSpeed = 0;
    this.offRoad = false;
    this.drifting = false;
    this.comboTime = 0;
    this.crashCooldown = 0;
    this.countdown = 0;
    this.goTimer = 0;
    this.lastCountdown = null;
    this.driftPopupTimer = 0;
    this.lastPopupScore = 0;
    this.particles = [];
    this.skids = [];
    this.result = null;
    this.pausedFrom = 'race';
    this.camera = { x: 0, y: 0, zoom: 3, shake: 0 };
    this.baseZoom = this.computeZoom();
    this.best = this.loadBest();
    this.muted = false;

    this.bindUI();
    this.hud.updateBest(this.best);
    this.showMenu();
  }

  computeZoom() {
    return clamp(Math.min(this.renderer.w, this.renderer.h) / 230, 2.0, 3.62);
  }

  onResize() {
    this.baseZoom = this.computeZoom();
  }

  bindUI() {
    const click = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    click('startBtn', () => this.startRace());
    click('againBtn', () => this.startRace());
    click('restartBtn', () => this.startRace());
    click('menuBtn', () => this.showMenu());
    click('quitBtn', () => this.showMenu());
    click('resumeBtn', () => this.resume());
    click('pauseBtn', () => this.pause());
    click('muteBtn', () => this.toggleMute());

    this.input.onAction = (action) => {
      if (action === 'start' && (this.state === 'menu' || this.state === 'finished')) this.startRace();
      else if (action === 'pause') {
        if (this.state === 'paused') this.resume();
        else this.pause();
      } else if (action === 'mute') this.toggleMute();
      else if (action === 'restart' && this.state === 'paused') this.startRace();
    };
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.setEnabled(!this.muted);
    const button = document.getElementById('muteBtn');
    button.classList.toggle('muted', this.muted);
    button.setAttribute('aria-label', this.muted ? 'Unmute sound' : 'Mute sound');
    if (!this.muted) this.audio.init();
  }

  startRace() {
    this.audio.init();
    this.audio.setEnabled(!this.muted);
    this.resetRaceState();
    this.player.reset(this.track);
    this.resetAI(false);
    this.state = 'countdown';
    this.countdown = 3.18;
    this.goTimer = 0;
    this.lastCountdown = null;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = this.baseZoom;
    this.camera.shake = 0;
    this.hud.setState('countdown');
    this.hud.hideResults();
    this.hud.updateBest(this.best);
    this.hud.update(this);
    this.input.clear();
  }

  showMenu() {
    this.state = 'menu';
    this.resetRaceState();
    this.player.reset(this.track);
    this.resetAI(true);
    const focus = this.ai[0];
    this.camera.x = focus.x + Math.cos(focus.angle) * 12;
    this.camera.y = focus.y + Math.sin(focus.angle) * 12;
    this.camera.zoom = this.baseZoom * 0.9;
    this.camera.shake = 0;
    this.hud.setState('menu');
    this.hud.setCountdown(null);
    this.hud.hideResults();
    this.hud.updateBest(this.best);
    this.audio.silence();
    this.input.clear();
  }

  resetRaceState() {
    this.time = 0;
    this.lap = 1;
    this.lapIndex = 0;
    this.nextGate = 0;
    this.total = 0;
    this.prevS = this.track.start.s;
    this.lapStartTime = 0;
    this.bestLap = 0;
    this.lastLap = 0;
    this.score = 0;
    this.multiplier = 1;
    this.nitro = 0;
    this.position = 4;
    this.topSpeed = 0;
    this.offRoad = false;
    this.drifting = false;
    this.comboTime = 0;
    this.crashCooldown = 0;
    this.goTimer = 0;
    this.lastCountdown = null;
    this.driftPopupTimer = 0;
    this.lastPopupScore = 0;
    this.particles.length = 0;
    this.skids.length = 0;
    this.result = null;
  }

  resetAI(menu) {
    for (let i = 0; i < this.ai.length; i += 1) {
      const ai = this.ai[i];
      ai.progress = menu ? this.track.length * 0.24 + i * 24 : 9 + i * 8;
      ai.speed = ai.base * 0.72;
      ai.laneOffset = ai.lane;
      this.placeAI(ai, ai.progress);
      ai.speed = ai.base * (menu ? 0.55 : 0.8);
      ai.vx = Math.cos(ai.angle) * ai.speed;
      ai.vy = Math.sin(ai.angle) * ai.speed;
    }
  }

  placeAI(ai, progress) {
    const lane = ai.laneOffset + Math.sin(progress * 0.017 + ai.seed) * 1.9;
    const p = this.track.lanePoint(progress, lane);
    ai.x = p.x;
    ai.y = p.y;
    ai.angle = Math.atan2(p.ty, p.tx);
    ai.steer = 0;
    ai.boosting = false;
  }

  pause() {
    if (this.state !== 'race' && this.state !== 'countdown') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.hud.setState('paused');
    this.hud.setCountdown(null);
    this.audio.silence();
    this.input.clear();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom;
    this.hud.setState(this.state);
    this.lastCountdown = null;
    this.hud.setCountdown(this.state === 'countdown' ? '3' : null);
    this.input.clear();
  }

  update(dt) {
    this.clock += dt;
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.inputState = {
      throttle: this.input.throttle,
      brake: this.input.brake,
      steer: this.input.steer,
      handbrake: this.input.handbrake,
      boost: this.input.boost
    };

    if (this.state === 'menu') {
      this.updateAI(dt, true);
      this.updateParticles(dt);
      this.updateCamera(dt);
      this.audio.update(0, 0, 0, false, false);
      return;
    }
    if (this.state === 'paused') return;

    if (this.state === 'countdown') {
      this.updateCountdown(dt);
      this.updateCamera(dt);
      this.hud.update(this);
      this.audio.update(0, 0, 0, false, true);
      return;
    }

    if (this.state === 'race') {
      this.time += dt;
      this.updatePlayer(dt);
      this.resolveRivalContacts();
      this.updateDrift(dt);
      this.updateEffects(dt);
      this.updateAI(dt, false);
      this.updateProgress();
      this.updateParticles(dt);
      this.updateCamera(dt);
      this.updatePosition();
      this.topSpeed = Math.max(this.topSpeed, this.player.speed * 2.2);
      this.hud.update(this);
      this.audio.update(this.player.speed, this.player.slip, this.inputState.throttle, this.player.boosting, true);
      if (this.goTimer > 0) {
        this.goTimer -= dt;
        if (this.goTimer <= 0) this.hud.setCountdown(null);
      }
      return;
    }

    if (this.state === 'finished') {
      this.player.update(dt, ZERO_INPUT, this);
      this.updateAI(dt, false);
      this.updateParticles(dt);
      this.updateCamera(dt);
      this.hud.update(this);
      this.audio.silence();
    }
  }

  updateCountdown(dt) {
    this.countdown -= dt;
    let label = '3';
    if (this.countdown <= 0.2) label = 'GO';
    else if (this.countdown <= 1.2) label = '1';
    else if (this.countdown <= 2.2) label = '2';
    if (label !== this.lastCountdown) {
      this.lastCountdown = label;
      this.hud.setCountdown(label, label === 'GO');
      this.audio.countdown(label === 'GO');
    }
    this.player.update(dt, ZERO_INPUT, this);
    if (this.countdown <= 0) {
      this.state = 'race';
      this.hud.setState('race');
      this.time = 0;
      this.lapStartTime = 0;
      this.goTimer = 0.8;
      this.audio.countdown(true);
    }
  }

  updatePlayer(dt) {
    this.player.update(dt, this.input, this);
  }

  resolveRivalContacts() {
    const player = this.player;
    for (const ai of this.ai) {
      const dx = player.x - ai.x;
      const dy = player.y - ai.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 4.3 || distance < 0.001) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = 4.3 - distance;
      player.x += nx * overlap * 0.7;
      player.y += ny * overlap * 0.7;
      const relative = player.vx * nx + player.vy * ny;
      if (relative < 0) {
        player.vx -= nx * relative * 0.85;
        player.vy -= ny * relative * 0.85;
      }
      player.vx *= 0.94;
      player.vy *= 0.94;
      if (this.crashCooldown <= 0) {
        this.camera.shake = Math.max(this.camera.shake, 0.28);
        this.audio.crash();
        this.hud.toast('CONTACT', true, 700);
        this.crashCooldown = 0.7;
      }
    }
  }

  updateDrift(dt) {
    const player = this.player;
    const wasDrifting = this.drifting;
    this.drifting = player.speed > 21 && player.slip > 0.2 && !player.offRoad;
    if (this.drifting) {
      if (!wasDrifting) this.driftPopupTimer = 0.35;
      this.multiplier = Math.min(5, this.multiplier + dt * 0.66);
      this.comboTime = 0.72;
      const gain = (10 + player.speed * 0.58) * (0.5 + player.slip * 1.45) * this.multiplier * dt;
      this.score += gain;
      this.nitro = Math.min(100, this.nitro + dt * 8.6 + gain * 0.05);
      this.driftPopupTimer -= dt;
      if (this.driftPopupTimer <= 0) {
        const chunk = Math.max(1, this.score - this.lastPopupScore);
        this.hud.popup(this, `+${formatScore(chunk)}`, 'drift');
        this.lastPopupScore = this.score;
        this.driftPopupTimer = 0.62;
      }
    } else {
      this.comboTime -= dt;
      if (this.comboTime <= 0) {
        this.multiplier = Math.max(1, this.multiplier - dt * 2.2);
        this.lastPopupScore = this.score;
      }
    }
  }

  updateEffects(dt) {
    const player = this.player;
    const drifting = this.drifting;
    const handbrake = this.inputState.handbrake;
    const emitting = player.speed > 11 && (drifting || (handbrake && player.speed > 13) || (player.offRoad && player.speed > 24));

    if (emitting) {
      player.smokeTimer -= dt;
      const wheels = player.rearWheels();
      while (player.smokeTimer <= 0) {
        player.smokeTimer += 0.024;
        for (const wheel of wheels) {
          this.particles.push({
            x: wheel.x + (Math.random() - 0.5) * 0.7,
            y: wheel.y + (Math.random() - 0.5) * 0.7,
            z: 0.25 + Math.random() * 0.4,
            vx: player.vx * 0.08 + (Math.random() - 0.5) * 4.2,
            vy: player.vy * 0.08 + (Math.random() - 0.5) * 4.2,
            vz: 0.9 + Math.random() * 2.4,
            life: 0.8 + Math.random() * 0.65,
            maxLife: 1.45,
            size: 3.0 + Math.random() * 4.4,
            kind: 'smoke'
          });
        }
        if (this.particles.length > 320) this.particles.splice(0, 50);
      }
    } else {
      player.smokeTimer = Math.max(player.smokeTimer, 0);
    }

    if (player.boosting) {
      player.sparkTimer -= dt;
      while (player.sparkTimer <= 0) {
        player.sparkTimer += 0.02;
        const back = -4.1;
        this.particles.push({
          x: player.x + Math.cos(player.angle) * back + (Math.random() - 0.5) * 1.2,
          y: player.y + Math.sin(player.angle) * back + (Math.random() - 0.5) * 1.2,
          z: 0.3 + Math.random() * 0.5,
          vx: player.vx * 0.35 + (Math.random() - 0.5) * 6,
          vy: player.vy * 0.35 + (Math.random() - 0.5) * 6,
          vz: 0.5 + Math.random() * 2.8,
          life: 0.3 + Math.random() * 0.3,
          maxLife: 0.6,
          size: 1.4 + Math.random() * 2.1,
          kind: 'spark',
          color: Math.random() > 0.4 ? '#5ef4ff' : '#ff8be8'
        });
      }
    }

    if (player.speed > 12 && (drifting || handbrake) && !player.offRoad) {
      const wheels = player.rearWheels();
      for (let i = 0; i < wheels.length; i += 1) {
        const wheel = wheels[i];
        const last = player.skidTrail[i];
        if (last) {
          this.skids.push({ x1: last.x, y1: last.y, x2: wheel.x, y2: wheel.y });
          if (this.skids.length > 1600) this.skids.splice(0, 220);
        }
        player.skidTrail[i] = { x: wheel.x, y: wheel.y };
      }
    } else {
      player.skidTrail[0] = null;
      player.skidTrail[1] = null;
    }
  }

  updateAI(dt, menu) {
    const track = this.track;
    for (const ai of this.ai) {
      const lane = ai.laneOffset + Math.sin(ai.progress * 0.017 + ai.seed) * 1.9;
      const current = track.lanePoint(ai.progress, lane);
      const ahead = track.pointAtDistance(ai.progress + 26);
      const dot = clamp(current.tx * ahead.tx + current.ty * ahead.ty, -1, 1);
      const target = menu ? ai.base * 0.6 : Math.max(29, ai.base - (1 - dot) * 34);
      ai.speed = damp(ai.speed, target, 2.2, dt);
      ai.progress += ai.speed * dt;
      if (menu && ai.progress > track.length) ai.progress -= track.length;
      this.placeAI(ai, ai.progress);
      ai.steer = clamp((current.tx * ahead.ty - current.ty * ahead.tx) * 18, -1, 1);
      ai.vx = Math.cos(ai.angle) * ai.speed;
      ai.vy = Math.sin(ai.angle) * ai.speed;
      ai.boosting = false;
    }
  }

  updateProgress() {
    const track = this.track;
    const length = track.length;
    const near = this.player.near || track.nearest(this.player.x, this.player.y);
    let delta = shortestDelta(this.prevS, near.s, length);
    if (Math.abs(delta) > 28) delta = 0;
    this.total += delta;
    this.prevS = near.s;

    const target = this.lapIndex * length + ((this.nextGate + 1) / 8) * length;
    if (this.total >= target) {
      if (this.nextGate < 7) {
        this.nextGate += 1;
        this.score += 100 * this.multiplier;
        this.nitro = Math.min(100, this.nitro + 5);
        this.hud.toast(`GATE ${String(this.nextGate).padStart(2, '0')} / 08`);
        this.hud.popup(this, 'GATE', 'drift');
        this.audio.gate();
      } else {
        const lapTime = this.time - this.lapStartTime;
        this.lastLap = lapTime;
        this.bestLap = this.bestLap > 0 ? Math.min(this.bestLap, lapTime) : lapTime;
        this.lapIndex += 1;
        this.lapStartTime = this.time;
        if (this.lapIndex >= 3) {
          this.finishRace();
          return;
        }
        this.nextGate = 0;
        this.score += 250 * this.multiplier;
        this.nitro = Math.min(100, this.nitro + 12);
        this.hud.toast(`LAP ${this.lapIndex + 1} — ${formatTime(lapTime)}`);
        this.audio.gate();
      }
    }
    this.lap = Math.min(3, this.lapIndex + 1);
  }

  updatePosition() {
    let ahead = 0;
    for (const ai of this.ai) if (ai.progress > this.total) ahead += 1;
    this.position = Math.min(4, ahead + 1);
  }

  updateCamera(dt) {
    const menu = this.state === 'menu';
    const player = this.player;
    let targetX;
    let targetY;
    let zoomTarget;
    if (menu) {
      const focus = this.ai[0];
      targetX = focus.x + Math.cos(focus.angle) * 13;
      targetY = focus.y + Math.sin(focus.angle) * 13;
      zoomTarget = this.baseZoom * 0.9;
    } else {
      targetX = player.x + player.vx * 0.34;
      targetY = player.y + player.vy * 0.34;
      zoomTarget = this.baseZoom * (1 - clamp(player.speed / 190, 0, 0.1));
    }
    this.camera.x = damp(this.camera.x, targetX, menu ? 2.2 : 4.3, dt);
    this.camera.y = damp(this.camera.y, targetY, menu ? 2.2 : 4.3, dt);
    this.camera.zoom = damp(this.camera.zoom, zoomTarget, 2.8, dt);
    this.camera.shake = damp(this.camera.shake, 0, 5.6, dt);
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const drag = p.kind === 'spark' ? 2.6 : 1.35;
      p.vx *= Math.exp(-drag * dt);
      p.vy *= Math.exp(-drag * dt);
      p.vz += (p.kind === 'spark' ? -7 : 2.8) * dt;
      if (p.z < 0) p.z = 0;
    }
  }

  onCrash(force) {
    if (this.state !== 'race' || this.crashCooldown > 0) return;
    this.crashCooldown = 0.68;
    this.camera.shake = Math.min(1, 0.35 + force / 55);
    this.hud.flash();
    this.audio.crash();
    if (this.multiplier > 1.05) this.hud.popup(this, 'COMBO LOST', 'crash');
    this.multiplier = 1;
    this.drifting = false;
    this.comboTime = 0;
    this.nitro = Math.max(0, this.nitro - 8);
    this.hud.toast('WALL — COMBO LOST', true, 1100);
    this.player.skidTrail[0] = null;
    this.player.skidTrail[1] = null;
  }

  finishRace() {
    this.state = 'finished';
    this.lap = 3;
    this.updatePosition();
    const position = this.position;
    const newTime = !this.best.bestTime || this.time < this.best.bestTime;
    const newScore = this.score > this.best.bestScore;
    if (newTime) this.best.bestTime = this.time;
    if (newScore) this.best.bestScore = Math.floor(this.score);
    this.best.bestLap = this.best.bestLap > 0 ? Math.min(this.best.bestLap, this.bestLap) : this.bestLap;
    this.saveBest();
    this.result = {
      time: this.time,
      bestLap: this.bestLap,
      score: Math.floor(this.score),
      topSpeed: Math.round(this.topSpeed),
      position,
      newBest: newTime || newScore
    };
    this.hud.setState('finished');
    this.hud.setCountdown(null);
    this.hud.updateBest(this.best);
    this.hud.update(this);
    this.hud.showResults(this);
    this.audio.silence();
    this.input.clear();
  }

  loadBest() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { bestTime: 0, bestLap: 0, bestScore: 0 };
      const data = JSON.parse(raw);
      return {
        bestTime: Number.isFinite(data.bestTime) ? data.bestTime : 0,
        bestLap: Number.isFinite(data.bestLap) ? data.bestLap : 0,
        bestScore: Number.isFinite(data.bestScore) ? data.bestScore : 0
      };
    } catch {
      return { bestTime: 0, bestLap: 0, bestScore: 0 };
    }
  }

  saveBest() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.best));
    } catch {
      /* Private mode or disabled storage: the race still works. */
    }
  }

  render() {
    this.renderer.draw(this);
  }
}
