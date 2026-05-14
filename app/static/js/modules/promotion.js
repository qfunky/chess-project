import { PIECE_THEME } from './boardConfig.js';

const PIECES = ['q', 'r', 'b', 'n'];

export function isPromotionMove(game, from, to) {
    const moves = game.moves({ square: from, verbose: true });
    return moves.some(m => m.to === to && m.flags.includes('p'));
}

/** Returns a Promise<string|null> — piece letter chosen, or null on cancel. */
export function showPicker({ boardEl, square, color, orientation }) {
    return new Promise(resolve => {
        const rect = boardEl.getBoundingClientRect();
        const sqSize = rect.width / 8;
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1], 10) - 1;
        const col = orientation === 'white' ? file : 7 - file;
        const row = orientation === 'white' ? 7 - rank : rank;

        const backdrop = document.createElement('div');
        backdrop.className = 'promo-backdrop';

        const overlay = document.createElement('div');
        overlay.className = 'promo-overlay';
        overlay.style.left  = (rect.left + col * sqSize) + 'px';
        overlay.style.width = sqSize + 'px';

        // Stack downward from destination if it's at top of board,
        // upward (so Q sits over the destination) if at bottom.
        const stackDown = row === 0;
        overlay.style.top = stackDown
            ? (rect.top + row * sqSize) + 'px'
            : (rect.top + (row - 3) * sqSize) + 'px';

        const order = stackDown ? PIECES : [...PIECES].reverse();
        order.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'promo-option';
            btn.style.width = sqSize + 'px';
            btn.style.height = sqSize + 'px';
            const code = (color === 'w' ? 'w' : 'b') + p.toUpperCase();
            const img = document.createElement('img');
            img.src = PIECE_THEME.replace('{piece}', code);
            img.alt = p;
            btn.appendChild(img);
            btn.addEventListener('click', e => {
                e.stopPropagation();
                cleanup();
                resolve(p);
            });
            overlay.appendChild(btn);
        });

        function cleanup() {
            overlay.remove();
            backdrop.remove();
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKey);
        }
        function onResize() { cleanup(); resolve(null); }
        function onKey(e) { if (e.key === 'Escape') { cleanup(); resolve(null); } }
        backdrop.addEventListener('click', () => { cleanup(); resolve(null); });
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKey);

        document.body.appendChild(backdrop);
        document.body.appendChild(overlay);
    });
}
