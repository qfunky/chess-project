/** Total elapsed game time. Starts on first move, stops on game over. */
export class TotalTimer {
    constructor(displayEl) {
        this.el = displayEl;
        this.startedAt = null;
        this.frozenMs = 0;     // accumulated when paused
        this._tick = null;
        this._render(0);
    }

    start() {
        if (this.startedAt) return;
        this.startedAt = performance.now();
        this._tick = setInterval(() => this._render(this._elapsed()), 1000);
    }

    stop() {
        if (this._tick) { clearInterval(this._tick); this._tick = null; }
        this.frozenMs = this._elapsed();
        this.startedAt = null;
        this._render(this.frozenMs);
    }

    reset() {
        this.stop();
        this.frozenMs = 0;
        this.startedAt = null;
        this._render(0);
    }

    _elapsed() {
        if (!this.startedAt) return this.frozenMs;
        return this.frozenMs + (performance.now() - this.startedAt);
    }

    _render(ms) {
        if (!this.el) return;
        const total = Math.floor(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = n => n.toString().padStart(2, '0');
        this.el.textContent = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }
}
