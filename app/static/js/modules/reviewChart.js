const NS = 'http://www.w3.org/2000/svg';

export const ANNOTATIONS = {
    brilliant:  '!!',
    great:      '!',
    best:       '',
    excellent:  '',
    good:       '',
    inaccuracy: '?!',
    mistake:    '?',
    blunder:    '??',
};

const STAT_ORDER = [
    ['brilliant','Brilliant'],
    ['great','Great'],
    ['best','Best'],
    ['excellent','Excellent'],
    ['good','Good'],
    ['inaccuracy','Inaccuracy'],
    ['mistake','Mistake'],
    ['blunder','Blunder'],
];

export function renderStats(container, classifications, label = '') {
    const counts = Object.fromEntries(STAT_ORDER.map(([k]) => [k, 0]));
    classifications.forEach(c => counts[c] = (counts[c] || 0) + 1);
    container.innerHTML = '';
    if (label) {
        const h = document.createElement('div');
        h.className = 'review-stat-label';
        h.textContent = label;
        container.appendChild(h);
    }
    STAT_ORDER.forEach(([k, lbl]) => {
        if (!counts[k]) return;   // hide empty buckets to keep it compact
        const div = document.createElement('div');
        div.className = 'review-stat';
        div.innerHTML = `<span class="num cls-${k}">${counts[k]}</span><span class="lbl">${lbl}</span>`;
        container.appendChild(div);
    });
}

export function renderChart(svg, evals, classifications) {
    const W = 800, H = 180;
    svg.innerHTML = '';
    if (evals.length < 2) return;
    const points = evals.map((e, i) => {
        let v = e ? (e.type === 'mate' ? (e.value > 0 ? 10 : -10) : e.value/100) : 0;
        v = Math.max(-6, Math.min(6, v));
        const x = (i / (evals.length - 1)) * W;
        const y = H/2 - (v / 6) * (H/2 - 10);
        return [x, y, v];
    });
    const mid = document.createElementNS(NS, 'line');
    mid.setAttribute('x1', 0); mid.setAttribute('y1', H/2);
    mid.setAttribute('x2', W); mid.setAttribute('y2', H/2);
    mid.setAttribute('stroke', 'currentColor'); mid.setAttribute('stroke-opacity', '0.15');
    mid.setAttribute('stroke-dasharray', '2 4');
    svg.appendChild(mid);

    let d = `M 0 ${H/2} `;
    points.forEach(p => d += `L ${p[0].toFixed(1)} ${p[1].toFixed(1)} `);
    d += `L ${W} ${H/2} Z`;
    const area = document.createElementNS(NS, 'path');
    area.setAttribute('d', d); area.setAttribute('fill', 'rgba(0,113,227,0.18)');
    svg.appendChild(area);

    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', points.map(p => p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#0071e3');
    line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);

    const colors = { best:'#34c759', good:'#98989d', inaccuracy:'#d4a017', mistake:'#ff9f0a', blunder:'#ff3b30' };
    for (let i = 1; i < points.length; i++) {
        const c = colors[classifications[i - 1]] || '#98989d';
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', points[i][0]); dot.setAttribute('cy', points[i][1]);
        dot.setAttribute('r', 3.5); dot.setAttribute('fill', c);
        svg.appendChild(dot);
    }
}

export function signedEval(a, sideChar) {
    if (!a) return 0;
    const v = a.type === 'mate' ? (a.value > 0 ? 1000 : -1000) : a.value;
    return sideChar === 'w' ? v : -v;
}

/** Classify a single move from its eval delta (negative = lost cp).
 *  Optional extras: brilliant / great are detected by callers with extra context. */
export function classify(deltaCp, isBest) {
    if (isBest) return 'best';
    const loss = Math.max(0, -deltaCp);
    if (loss < 25)  return 'excellent';
    if (loss < 50)  return 'good';
    if (loss < 100) return 'inaccuracy';
    if (loss < 200) return 'mistake';
    return 'blunder';
}
