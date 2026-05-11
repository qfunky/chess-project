export function formatEval(a) {
    if (!a) return '0.00';
    if (a.type === 'mate') return 'M' + Math.abs(a.value);
    const v = a.value / 100;
    return (v >= 0 ? '+' : '') + v.toFixed(2);
}

export function evalToPercent(a) {
    if (!a) return 50;
    if (a.type === 'mate') return a.value > 0 ? 98 : 2;
    const c = Math.max(-10, Math.min(10, a.value / 100));
    return 50 + c * 4.5;
}

export class EvalBar {
    constructor(bar, fill, number) {
        this.bar = bar; this.fill = fill; this.number = number;
        this.enabled = false;
    }
    setEnabled(v) {
        this.enabled = v;
        this.bar.style.opacity = v ? 1 : 0.15;
    }
    set(a) {
        if (!this.enabled) return;
        const pct = evalToPercent(a);
        this.fill.style.height = pct + '%';
        this.number.textContent = formatEval(a);
        this.bar.classList.toggle('advantage-black', pct < 50);
    }
}
