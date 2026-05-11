export function clearAll() {
    $('#myBoard .square-55d63').removeClass(
        'highlight-legal highlight-legal-capture highlight-last highlight-active'
    );
}
export function last(from, to) {
    $('#myBoard .square-' + from).addClass('highlight-last');
    $('#myBoard .square-' + to).addClass('highlight-last');
}
export function legalMoves(game, square) {
    const moves = game.moves({ square, verbose: true });
    $('#myBoard .square-' + square).addClass('highlight-active');
    moves.forEach(m => {
        const cap = m.flags.includes('c') || m.flags.includes('e');
        $('#myBoard .square-' + m.to).addClass(cap ? 'highlight-legal-capture' : 'highlight-legal');
    });
}
