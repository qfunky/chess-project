/* Clock display + optional client-side ticking.
   For server-authoritative clocks (multiplayer), call sync() with server times.
   For solo, call start() and the clock ticks down locally. */

const LOW_MS = 10_000;

function fmt(ms) {
    if (ms == null || ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m >= 10) return `${m}:${s.toString().padStart(2, '0')}`;
    // Sub-10 minutes — show tenths under 10s
    if (total < 10) {
        const tenths = Math.floor((ms % 1000) / 100);
        return `${total}.${tenths}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export class Clocks {
    /** @param {{whiteEl: HTMLElement, blackEl: HTMLElement, onTimeout: (loser:'white'|'black')=>void}} cfg */
    constructor(cfg) {
        this.whiteEl = cfg.whiteEl;
        this.blackEl = cfg.blackEl;
        this.whiteTimeEl = cfg.whiteEl.querySelector('.time');
        this.blackTimeEl = cfg.blackEl.querySelector('.time');
        this.onTimeout = cfg.onTimeout || (() => {});
        this.enabled = false;
        this.active = null;        // 'white' | 'black' | null
        this.white = 0;
        this.black = 0;
        this.increment = 0;
        this.lastTick = null;
        this._raf = null;
    }

    enable(initialSec, incrementSec) {
        this.enabled = true;
        this.increment = (incrementSec || 0) * 1000;
        this.white = initialSec * 1000;
        this.black = initialSec * 1000;
        this.active = null;
        this.lastTick = null;
        this._render();
        this.whiteEl.style.display = '';
        this.blackEl.style.display = '';
    }

    disable() {
        this.enabled = false;
        this._stop();
        this.whiteEl.style.display = 'none';
        this.blackEl.style.display = 'none';
    }

    /** Tell clock whose turn it is. Pass null to pause. */
    setActive(color) {
        if (!this.enabled) return;
        // Add increment for the player who just moved
        if (this.active && color !== this.active && this.active !== color) {
            this[this.active] += this.increment;
        }
        this.active = color;
        this.lastTick = performance.now();
        this._render();
        if (color) this._start(); else this._stop();
    }

    /** Server-authoritative sync: replace times and active player. */
    sync({ white_ms, black_ms, active, server_ts }) {
        if (!this.enabled) return;
        this.white = white_ms;
        this.black = black_ms;
        this.active = active;
        // Use local time as anchor — small drift acceptable
        this.lastTick = performance.now();
        this._render();
        if (active) this._start(); else this._stop();
    }

    _start() {
        this._stop();
        const tick = (t) => {
            if (!this.active) return;
            const dt = t - this.lastTick;
            this.lastTick = t;
            this[this.active] -= dt;
            if (this[this.active] <= 0) {
                this[this.active] = 0;
                this._render();
                const loser = this.active;
                this.setActive(null);
                this.onTimeout(loser);
                return;
            }
            this._render();
            this._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
    }

    _stop() {
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    }

    _render() {
        this.whiteTimeEl.textContent = fmt(this.white);
        this.blackTimeEl.textContent = fmt(this.black);
        this.whiteEl.classList.toggle('active', this.active === 'white');
        this.blackEl.classList.toggle('active', this.active === 'black');
        this.whiteEl.classList.toggle('low', this.white < LOW_MS);
        this.blackEl.classList.toggle('low', this.black < LOW_MS);
    }
}

export function parseTimeControl(value) {
    // value like "5+0", "10+5", "off"
    if (!value || value === 'off') return null;
    const [mins, inc] = value.split('+').map(n => parseInt(n, 10));
    return { initial: mins * 60, increment: inc || 0 };
}
