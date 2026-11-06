import { clamp, formatScore, formatTime, ordinal, TAU } from './core.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(track) {
    this.track = track;
    this.app = $('app');
    this.refs = {
      lap: $('lap'),
      time: $('time'),
      gateFill: $('gateFill'),
      gateCount: $('gateCount'),
      pos: $('pos'),
      score: $('score'),
      combo: $('combo'),
      speed: $('speed'),
      gear: $('gear'),
      revFill: $('revFill'),
      nitroFill: $('nitroFill'),
      nitroPct: $('nitroPct'),
      driftLabel: $('driftLabel'),
      driftBar: document.querySelector('.drift-bar'),
      speedHint: $('speedHint'),
      minimap: $('minimap'),
      countdown: $('countdown'),
      countdownNumber: document.querySelector('#countdown span'),
      toast: $('toast'),
      flash: $('flash'),
      bestLap: $('bestLap'),
      bestScore: $('bestScore'),
      resultTitle: $('resultTitle'),
      resultFlavor: $('resultFlavor'),
      resultTime: $('resultTime'),
      resultLap: $('resultLap'),
      resultScore: $('resultScore'),
      resultSpeed: $('resultSpeed'),
      newBest: $('newBest')
    };
    this.toastTimer = null;
    this.countdownValue = null;
    this.mapFrame = 0;
    this.mapBounds = this.computeBounds();
  }

  computeBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.track.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  setState(state) {
    this.app.dataset.state = state;
  }

  updateBest(best) {
    this.refs.bestLap.textContent = best.bestLap ? formatTime(best.bestLap) : '--:--.---';
    this.refs.bestScore.textContent = best.bestScore ? formatScore(best.bestScore) : '0';
  }

  update(game) {
    const r = this.refs;
    const player = game.player;
    r.lap.textContent = String(Math.min(3, game.lap));
    r.time.textContent = formatTime(game.time);
    r.score.textContent = formatScore(game.score);
    r.combo.textContent = `x${game.multiplier.toFixed(1)}`;
    r.combo.classList.toggle('hot', game.multiplier > 1.45);

    const lapProgress = clamp((game.total - game.lapIndex * game.track.length) / game.track.length, 0, 1);
    r.gateFill.style.width = `${(lapProgress * 100).toFixed(1)}%`;
    r.gateCount.textContent = `${String(game.nextGate + 1).padStart(2, '0')} / 08`;

    r.pos.textContent = String(game.position);
    const kmh = Math.round(player.speed * 2.2);
    r.speed.textContent = String(kmh);
    r.gear.textContent = player.vf < -1.5 ? 'R' : player.speed < 0.8 ? 'N' : 'D';
    r.revFill.style.width = `${clamp(player.speed / 112, 0, 1) * 100}%`;
    r.nitroFill.style.width = `${clamp(game.nitro, 0, 100)}%`;
    r.nitroPct.textContent = `${Math.round(game.nitro)}%`;
    r.driftBar.classList.toggle('boosting', player.boosting);

    let driftText = 'READY TO SLIDE';
    let driftClass = '';
    if (player.boosting) {
      driftText = 'NITRO BURN';
      driftClass = 'boost';
    } else if (game.drifting) {
      driftText = `DRIFTING  x${game.multiplier.toFixed(1)}`;
      driftClass = 'active';
    } else if (game.offRoad) {
      driftText = 'OFF TRACK';
      driftClass = 'active';
    }
    if (r.driftLabel.textContent !== driftText) r.driftLabel.textContent = driftText;
    r.driftLabel.className = `drift-label ${driftClass}`;

    if (player.boosting) r.speedHint.textContent = 'NITRO FEED';
    else if (game.offRoad) r.speedHint.textContent = 'GRIP LOST — RETURN TO TRACK';
    else if (game.inputState?.handbrake && player.speed > 4) r.speedHint.textContent = 'HANDBRAKE';
    else if (kmh < 2) r.speedHint.textContent = 'HOLD THROTTLE';
    else r.speedHint.textContent = game.drifting ? 'CHARGING NITRO' : 'DRIFT TO CHARGE NITRO';

    this.mapFrame = (this.mapFrame + 1) % 5;
    if (this.mapFrame === 0) this.drawMinimap(game);
  }

  drawMinimap(game) {
    const canvas = this.refs.minimap;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const b = this.mapBounds;
    const pad = 16;
    const sx = (x) => pad + ((x - b.minX) / (b.maxX - b.minX)) * (w - pad * 2);
    const sy = (y) => pad + ((y - b.minY) / (b.maxY - b.minY)) * (h - pad * 2);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,20,0.55)';
    ctx.strokeStyle = 'rgba(94,244,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(1, 1, w - 2, h - 2, 10);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    this.track.points.forEach((p, i) => {
      const x = sx(p.x);
      const y = sy(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(94,244,255,0.12)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140,241,255,0.5)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Next gate pulse.
    const gatePoint = this.track.pointAtDistance(((game.nextGate + 1) / 8) * this.track.length);
    const gp = { x: sx(gatePoint.x), y: sy(gatePoint.y) };
    const pulse = 2.6 + Math.sin(performance.now() * 0.006) * 1.1;
    ctx.fillStyle = 'rgba(255,209,102,0.2)';
    ctx.beginPath();
    ctx.arc(gp.x, gp.y, pulse + 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(gp.x, gp.y, 2.2, 0, TAU);
    ctx.fill();

    for (const ai of game.ai) {
      ctx.fillStyle = ai.body;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(sx(ai.x), sy(ai.y), 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const px = sx(game.player.x);
    const py = sy(game.player.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.player.angle);
    ctx.fillStyle = '#eafdff';
    ctx.shadowColor = '#5ef4ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(4.8, 0);
    ctx.lineTo(-3.2, -3.2);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-3.2, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  setCountdown(value, isGo = false) {
    const r = this.refs;
    if (value === null) {
      r.countdown.classList.remove('show', 'pop');
      this.countdownValue = null;
      return;
    }
    if (value === this.countdownValue) return;
    this.countdownValue = value;
    r.countdownNumber.textContent = value;
    r.countdownNumber.classList.toggle('go', isGo);
    r.countdown.classList.add('show');
    r.countdown.classList.remove('pop');
    // Force animation restart.
    void r.countdown.offsetWidth;
    r.countdown.classList.add('pop');
  }

  toast(text, warn = false, duration = 1500) {
    const el = this.refs.toast;
    el.textContent = text;
    el.classList.toggle('warn', warn);
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  popup(game, text, kind = '') {
    const el = document.createElement('div');
    el.className = `scorepop ${kind}`;
    el.textContent = text;
    const p = game.renderer.project(game.player.x, game.player.y, 1.6);
    el.style.left = `${clamp(p.x + (Math.random() - 0.5) * 34, 40, game.renderer.w - 40)}px`;
    el.style.top = `${clamp(p.y - 18, 60, game.renderer.h - 100)}px`;
    document.getElementById('popups').appendChild(el);
    setTimeout(() => el.remove(), 920);
  }

  flash() {
    const el = this.refs.flash;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 130);
  }

  showResults(game) {
    const r = this.refs;
    const result = game.result;
    r.resultTitle.textContent = `P${result.position}`;
    r.resultTime.textContent = formatTime(result.time);
    r.resultLap.textContent = formatTime(result.bestLap);
    r.resultScore.textContent = formatScore(result.score);
    r.resultSpeed.textContent = `${result.topSpeed} km/h`;
    r.resultFlavor.textContent =
      result.position === 1
        ? (result.score > 5000 ? 'Fast, sideways, and untouchable.' : 'Clean lines. Cold-blooded win.')
        : result.position === 2
          ? 'Half a breath off the win. Slide deeper.'
          : result.position === 3
            ? 'On the podium. Now find another gear.'
            : 'The pack got away. Bank more nitro from the slides.';
    r.newBest.classList.toggle('show', result.newBest);
    r.newBest.textContent = result.newBest ? 'NEW PERSONAL BEST' : '';
    this.updateBest(game.best);
  }

  hideResults() {
    this.refs.newBest.classList.remove('show');
  }

  ordinal(value) {
    return ordinal(value);
  }
}
