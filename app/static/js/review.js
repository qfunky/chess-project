import * as api from './modules/api.js';
import * as hl from './modules/highlights.js';
import { render as renderMoves } from './modules/historyView.js';
import { EvalBar } from './modules/evalBar.js';
import { renderStats, renderChart, signedEval, classify } from './modules/reviewChart.js';
import { PIECE_THEME, ANIM } from './modules/boardConfig.js';

const game = new Chess();
game.load_pgn(window.__GAME_PGN__ || '', { sloppy: true });

const allMoves = game.history();
let ply = allMoves.length - 1;            // start at end
let reviewClass = [];

const board = Chessboard('myBoard', {
    draggable: false,
    position: 'start',
    pieceTheme: PIECE_THEME,
    ...ANIM,
});

const historyEl = document.getElementById('history');
const reviewBtn = document.getElementById('reviewBtn');
const reviewSection = document.getElementById('reviewSection');
const reviewStats = document.getElementById('reviewStats');
const evalChart = document.getElementById('evalChart');
const evalBar = new EvalBar(document.getElementById('evalBar'), document.getElementById('evalFill'), document.getElementById('evalNumber'));
evalBar.setEnabled(true);

function goTo(p) {
    ply = Math.max(-1, Math.min(allMoves.length - 1, p));
    const temp = new Chess();
    for (let i = 0; i <= ply; i++) temp.move(allMoves[i]);
    board.position(temp.fen());
    hl.clearAll();
    const v = temp.history({verbose:true});
    const last = v[v.length-1];
    if (last) hl.last(last.from, last.to);
    renderHistory();
}

function renderHistory() {
    renderMoves(historyEl, allMoves, reviewClass, ply >= 0 ? ply : null);
    historyEl.querySelectorAll('td.mv').forEach(td => {
        td.addEventListener('click', () => goTo(parseInt(td.dataset.ply)));
    });
}

document.getElementById('firstBtn').addEventListener('click', () => goTo(-1));
document.getElementById('prevBtn').addEventListener('click',  () => goTo(ply - 1));
document.getElementById('nextBtn').addEventListener('click',  () => goTo(ply + 1));
document.getElementById('lastBtn').addEventListener('click',  () => goTo(allMoves.length - 1));

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  goTo(ply - 1);
    if (e.key === 'ArrowRight') goTo(ply + 1);
    if (e.key === 'Home')       goTo(-1);
    if (e.key === 'End')        goTo(allMoves.length - 1);
});

reviewBtn.addEventListener('click', async () => {
    reviewBtn.textContent = 'Reviewing…'; reviewBtn.disabled = true;
    const moves = game.history({verbose:true});
    const temp = new Chess();
    const fens = [temp.fen()];
    moves.forEach(m => { temp.move({from:m.from,to:m.to,promotion:m.promotion||'q'}); fens.push(temp.fen()); });
    try {
        const data = await api.review(fens);
        const positions = data.positions;
        const evals = positions.map(p => p.eval);
        const cls = [];
        for (let i = 0; i < moves.length; i++) {
            const before = positions[i], after = positions[i + 1];
            const side = moves[i].color;
            const evB = signedEval(before.eval, side);
            const evA = signedEval(after.eval, side);
            const delta = evA - evB;
            const playedUci = moves[i].from + moves[i].to + (moves[i].promotion || '');
            const isBest = before.best && playedUci.startsWith(before.best.substring(0, 4));
            cls.push(classify(delta, isBest));
        }
        reviewClass = cls;
        renderChart(evalChart, evals, cls);
        renderStats(reviewStats, cls);
        reviewSection.classList.add('visible');
        renderHistory();
    } finally {
        reviewBtn.textContent = 'Run engine review';
        reviewBtn.disabled = false;
    }
});

goTo(allMoves.length - 1);
