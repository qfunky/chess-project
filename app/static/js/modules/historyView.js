import { ANNOTATIONS } from './reviewChart.js';

export function render(historyEl, moves, classifications, viewingPly) {
    if (moves.length === 0) {
        historyEl.innerHTML = '<div class="empty">No moves yet.</div>';
        return;
    }
    let html = '<table><thead><tr><th></th><th>White</th><th>Black</th></tr></thead><tbody>';
    for (let i = 0; i < moves.length; i += 2) {
        const n  = (i / 2) + 1;
        const w  = moves[i] || '';
        const b  = moves[i + 1] || '';
        const wc = classifications[i] || '';
        const bc = classifications[i + 1] || '';
        const wAnnot = wc ? (ANNOTATIONS[wc] || '') : '';
        const bAnnot = bc ? (ANNOTATIONS[bc] || '') : '';
        const wA = viewingPly === i ? ' active' : '';
        const bA = viewingPly === i + 1 ? ' active' : '';
        html += `<tr>
            <td class="num">${n}.</td>
            <td class="mv ${wc ? 'cls-' + wc : ''}${wA}" data-ply="${i}">${w}${wAnnot ? `<span class="annot">${wAnnot}</span>` : ''}</td>
            ${b ? `<td class="mv ${bc ? 'cls-' + bc : ''}${bA}" data-ply="${i + 1}">${b}${bAnnot ? `<span class="annot">${bAnnot}</span>` : ''}</td>` : '<td></td>'}
        </tr>`;
    }
    html += '</tbody></table>';
    historyEl.innerHTML = html;
    if (viewingPly === null) historyEl.scrollTop = historyEl.scrollHeight;
}

export function renderVariation(container, variationMoves) {
    if (!container) return;
    if (!variationMoves || variationMoves.length === 0) {
        container.innerHTML = '';
        container.classList.remove('visible');
        return;
    }
    container.classList.add('visible');
    const pretty = variationMoves.map((m, i) => {
        // Pair as 1. a 1...b 2. a 2...b
        return m;
    }).join(' ');
    container.innerHTML = `<span class="var-label">Variation:</span> <span class="var-line">${pretty}</span><button class="var-reset" id="varReset">Reset</button>`;
}
