const DRIVE_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ',
  'w', 'a', 's', 'd', 'shift'
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false, boost: false };
    this.onAction = null;
    this.bindKeyboard();
    this.bindTouch();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (DRIVE_KEYS.has(key)) event.preventDefault();
      if (event.repeat) return;
      this.keys.add(key);
      const action = this.actionFor(key);
      if (action && this.onAction) this.onAction(action, event);
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (DRIVE_KEYS.has(key)) event.preventDefault();
      this.keys.delete(key);
    }, { passive: false });

    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });
  }

  actionFor(key) {
    if (key === 'enter' || key === ' ') return 'start';
    if (key === 'escape' || key === 'p') return 'pause';
    if (key === 'm') return 'mute';
    if (key === 'r') return 'restart';
    return null;
  }

  bindTouch() {
    document.querySelectorAll('[data-control]').forEach((button) => {
      const control = button.dataset.control;
      const press = (event) => {
        event.preventDefault();
        this.touch[control] = true;
        button.classList.add('pressed');
        if (button.setPointerCapture && event.pointerId !== undefined) {
          try { button.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        }
      };
      const release = (event) => {
        if (event) event.preventDefault();
        this.touch[control] = false;
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    });
  }

  get throttle() {
    return this.keys.has('w') || this.keys.has('arrowup') || this.touch.gas ? 1 : 0;
  }

  get brake() {
    return this.keys.has('s') || this.keys.has('arrowdown') || this.touch.brake ? 1 : 0;
  }

  get steer() {
    const left = this.keys.has('a') || this.keys.has('arrowleft') || this.touch.left;
    const right = this.keys.has('d') || this.keys.has('arrowright') || this.touch.right;
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  get handbrake() {
    return this.keys.has(' ') || this.touch.drift;
  }

  get boost() {
    return this.keys.has('shift') || this.touch.boost;
  }

  clear() {
    this.keys.clear();
    for (const key of Object.keys(this.touch)) this.touch[key] = false;
    document.querySelectorAll('.touch-btn.pressed').forEach((button) => button.classList.remove('pressed'));
  }
}
