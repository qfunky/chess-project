/* SVG arrow / circle overlay. Handles knight moves with L-shaped arrows. */

const NS = 'http://www.w3.org/2000/svg';

function isKnight(from, to) {
    const dx = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
    const dy = Math.abs(parseInt(from[1]) - parseInt(to[1]));
    return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
}

function markerForColor(color) {
    if (color === '#34c759') return 'ah-green';
    if (color === '#ff3b30') return 'ah-red';
    if (color === '#0071e3') return 'ah-blue';
    return 'ah-orange';
}

export class ShapeLayer {
    constructor(overlay, getOrientation) {
        this.overlay = overlay;
        this.getOrientation = getOrientation;
        this.userShapes = [];
        this.systemShapes = [];   // engine hints — render group "system"
    }

    _center(sq) {
        const file = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq[1]) - 1;
        const orient = this.getOrientation();
        const x = orient === 'white' ? file : 7 - file;
        const y = orient === 'white' ? 7 - rank : rank;
        return { x: x + 0.5, y: y + 0.5 };
    }

    _drawArrow(from, to, color, group) {
        const a = this._center(from), b = this._center(to);
        const stroke = 0.17;
        const marker = `url(#${markerForColor(color)})`;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', stroke);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('opacity', '0.88');
        path.setAttribute('marker-end', marker);
        path.dataset.group = group;

        if (isKnight(from, to)) {
            const dx = b.x - a.x, dy = b.y - a.y;
            const bend = Math.abs(dx) > Math.abs(dy)
                ? { x: b.x, y: a.y }
                : { x: a.x, y: b.y };
            // shorten last segment so head sits inside dest square
            const sx = b.x - bend.x, sy = b.y - bend.y;
            const slen = Math.hypot(sx, sy);
            const shorten = 0.35;
            const endX = b.x - (sx / slen) * shorten;
            const endY = b.y - (sy / slen) * shorten;
            path.setAttribute('d', `M ${a.x} ${a.y} L ${bend.x} ${bend.y} L ${endX} ${endY}`);
        } else {
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return;
            const shorten = 0.35;
            const endX = b.x - (dx / len) * shorten;
            const endY = b.y - (dy / len) * shorten;
            path.setAttribute('d', `M ${a.x} ${a.y} L ${endX} ${endY}`);
        }
        this.overlay.appendChild(path);
    }

    _drawCircle(square, color, group) {
        const c = this._center(square);
        const el = document.createElementNS(NS, 'circle');
        el.setAttribute('cx', c.x); el.setAttribute('cy', c.y);
        el.setAttribute('r', 0.42);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', 0.07);
        el.setAttribute('fill', 'none');
        el.setAttribute('opacity', 0.85);
        el.dataset.group = group;
        this.overlay.appendChild(el);
    }

    clear(group) {
        this.overlay.querySelectorAll(`[data-group="${group}"]`).forEach(n => n.remove());
        if (group === 'user')   this.userShapes = [];
        if (group === 'system') this.systemShapes = [];
    }

    render() {
        this.overlay.querySelectorAll('[data-group="user"], [data-group="system"]').forEach(n => n.remove());
        this.userShapes.forEach(s => {
            if (s.type === 'arrow') this._drawArrow(s.from, s.to, s.color, 'user');
            else                    this._drawCircle(s.square, s.color, 'user');
        });
        this.systemShapes.forEach(s => {
            if (s.type === 'arrow') this._drawArrow(s.from, s.to, s.color, 'system');
            else                    this._drawCircle(s.square, s.color, 'system');
        });
    }

    setBestMove(uci) {
        this.systemShapes = [];
        if (uci && uci.length >= 4) {
            this.systemShapes.push({
                type: 'arrow', from: uci.slice(0, 2), to: uci.slice(2, 4), color: '#34c759'
            });
        }
        this.render();
    }

    toggleUser(shape) {
        const eq = (a, b) => a.type === b.type && a.color === b.color
            && (a.type === 'arrow' ? a.from === b.from && a.to === b.to : a.square === b.square);
        const i = this.userShapes.findIndex(s => eq(s, shape));
        if (i >= 0) this.userShapes.splice(i, 1);
        else        this.userShapes.push(shape);
        this.render();
    }

    clearUser() { this.userShapes = []; this.render(); }
}

export function attachRightClick(frameEl, layer) {
    let start = null;
    frameEl.addEventListener('contextmenu', e => e.preventDefault());
    frameEl.addEventListener('mousedown', e => {
        if (e.button === 2) {
            const el = e.target.closest('[data-square]');
            start = el ? el.getAttribute('data-square') : null;
        } else if (e.button === 0) {
            layer.clearUser();
        }
    });
    frameEl.addEventListener('mouseup', e => {
        if (e.button !== 2) return;
        const el = e.target.closest('[data-square]');
        const sq = el ? el.getAttribute('data-square') : null;
        if (!sq || !start) { start = null; return; }
        const color = e.shiftKey ? '#0071e3' : (e.altKey ? '#ff3b30' : '#ff9f0a');
        if (sq === start) layer.toggleUser({ type: 'circle', square: sq, color });
        else              layer.toggleUser({ type: 'arrow', from: start, to: sq, color });
        start = null;
    });
}
