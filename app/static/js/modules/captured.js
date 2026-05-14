import { PIECE_THEME } from './boardConfig.js';

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const SORT_RANK = { q: 5, r: 4, b: 3, n: 2, p: 1 };

/** Returns piece types (lowercase) captured by `byColor` ('w' or 'b'). */
function capturedBy(game, byColor) {
    return game.history({ verbose: true })
        .filter(m => m.color === byColor && m.captured)
        .map(m => m.captured);
}

function materialValue(arr) {
    return arr.reduce((s, p) => s + (VALUES[p] || 0), 0);
}

/** Render the tray for one side. byColor is 'w' or 'b'. */
export function renderTray(container, game, byColor) {
    if (!container) return;
    const mine   = capturedBy(game, byColor);
    const theirs = capturedBy(game, byColor === 'w' ? 'b' : 'w');
    const diff   = materialValue(mine) - materialValue(theirs);

    mine.sort((a, b) => (SORT_RANK[b] || 0) - (SORT_RANK[a] || 0));

    // Captured pieces are the opposite color (you take theirs).
    // data-shows drives the contrasting tray frame in CSS.
    const oppColor = byColor === 'w' ? 'b' : 'w';
    container.dataset.shows = oppColor;

    container.innerHTML = '';
    mine.forEach(p => {
        const img = document.createElement('img');
        img.className = 'cap-piece';
        img.src = PIECE_THEME.replace('{piece}', oppColor + p.toUpperCase());
        img.alt = p;
        container.appendChild(img);
    });
    if (diff > 0) {
        const tag = document.createElement('span');
        tag.className = 'cap-diff';
        tag.textContent = '+' + diff;
        container.appendChild(tag);
    }
}

/** Convenience: render both trays at once. */
export function renderBoth(game, topEl, bottomEl, userColor) {
    // bottom = user side
    const bottomColor = userColor === 'black' ? 'b' : 'w';
    const topColor    = bottomColor === 'w' ? 'b' : 'w';
    renderTray(bottomEl, game, bottomColor);
    renderTray(topEl,    game, topColor);
}
