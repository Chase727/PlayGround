import { Track } from './track.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const app = document.getElementById('app');
const track = new Track();
const renderer = new Renderer(canvas, track);
const input = new Input();
const audio = new GameAudio();
const hud = new Hud(track);
const game = new Game({ canvas, track, renderer, input, audio, hud });

function resize() {
  renderer.resize();
  game.onResize();
  hud.mapBounds = hud.computeBounds();
}

if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver(resize);
  observer.observe(app);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

const STEP = 1 / 120;
let last = performance.now();
let accumulator = 0;

function frame(now) {
  const elapsed = Math.min(0.08, Math.max(0, (now - last) / 1000));
  last = now;
  accumulator += elapsed;
  let steps = 0;
  while (accumulator >= STEP && steps < 12) {
    game.update(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 12) accumulator = 0;
  game.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Exposed for the build's browser checks and for tinkering in the console.
window.__neonDrift = { game, track, renderer };
