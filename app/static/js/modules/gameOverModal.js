export function show(opts) {
    const modal = document.getElementById('gameOverModal');
    if (!modal) return;
    document.getElementById('modalIcon').textContent  = opts.icon  || '♚';
    document.getElementById('modalTitle').textContent = opts.title || 'Game over';
    document.getElementById('modalSub').textContent   = opts.sub   || '';
    modal.classList.add('visible');
}
export function hide() {
    const modal = document.getElementById('gameOverModal');
    if (modal) modal.classList.remove('visible');
}
export function bind(onReview, onNew) {
    const modal = document.getElementById('gameOverModal');
    if (!modal) return;
    const close = document.getElementById('modalClose');
    const review = document.getElementById('modalReview');
    const ng = document.getElementById('modalNew');
    if (close)  close.addEventListener('click', hide);
    if (review && onReview) review.addEventListener('click', () => { hide(); onReview(); });
    if (ng && onNew)        ng.addEventListener('click',     () => { hide(); onNew(); });
    modal.addEventListener('click', e => { if (e.target === modal) hide(); });
}

export function describeOutcome(game) {
    if (game.in_checkmate()) {
        const loser  = game.turn() === 'w' ? 'White' : 'Black';
        const winner = loser === 'White' ? 'Black' : 'White';
        return {
            icon: winner === 'White' ? '♔' : '♚',
            title: `${winner} wins by checkmate`,
            sub: `${loser} is mated.`,
            result: winner === 'White' ? '1-0' : '0-1',
        };
    }
    if (game.in_stalemate()) {
        return { icon: '½', title: 'Stalemate', sub: 'No legal moves but no check.', result: '1/2-1/2' };
    }
    if (game.in_threefold_repetition()) {
        return { icon: '½', title: 'Draw — threefold repetition', sub: 'Same position thrice.', result: '1/2-1/2' };
    }
    if (game.insufficient_material()) {
        return { icon: '½', title: 'Draw — insufficient material', sub: 'Not enough pieces to mate.', result: '1/2-1/2' };
    }
    if (game.in_draw()) {
        return { icon: '½', title: 'Draw', sub: 'Fifty-move rule.', result: '1/2-1/2' };
    }
    return { icon: '♚', title: 'Game over', sub: '', result: '*' };
}
