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
        const wA = viewingPly === i ? ' active' : '';
        const bA = viewingPly === i + 1 ? ' active' : '';
        html += `<tr>
            <td class="num">${n}.</td>
            <td class="mv ${wc ? 'cls-' + wc : ''}${wA}" data-ply="${i}">${w}</td>
            ${b ? `<td class="mv ${bc ? 'cls-' + bc : ''}${bA}" data-ply="${i + 1}">${b}</td>` : '<td></td>'}
        </tr>`;
    }
    html += '</tbody></table>';
    historyEl.innerHTML = html;
    if (viewingPly === null) historyEl.scrollTop = historyEl.scrollHeight;
}
