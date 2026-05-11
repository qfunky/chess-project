import * as api from './modules/api.js';
import * as hl from './modules/highlights.js';
import { render as renderMoves } from './modules/historyView.js';
import { EvalBar, formatEval } from './modules/evalBar.js';
import { ShapeLayer, attachRightClick } from './modules/shapes.js';
import { renderStats, renderChart, signedEval, classify } from './modules/reviewChart.js';
import * as modal from './modules/gameOverModal.js';
import { Clocks, parseTimeControl } from './modules/clocks.js';
import { PIECE_THEME, ANIM } from './modules/boardConfig.js';

// ============ State ============
let game = new Chess();
let board;
let gameMode  = localStorage.getItem('chessMode') || 'engine';
let userSide  = localStorage.getItem('chessSide') || 'white';
let autoFlip  = localStorage.getItem('chessAutoFlip') === '1';
let showEval  = localStorage.getItem('chessShowEval') === '1';
let showBest  = localStorage.getItem('chessShowBest') === '1';
let analysisAllowed = localStorage.getItem('chessAnalysisAllowed') !== '0';
let timeControl = localStorage.getItem('chessTC') || 'off';
let lastMove  = null;
let bestHint  = null;
let reviewData = null;
let viewingPly = null;
let savedToServer = false;

const savedPgn = localStorage.getItem('chessGamePgn');
if (savedPgn) game.load_pgn(savedPgn);

// ============ Elements ============
const $ = id => document.getElementById(id);
const historyEl   = $('history');
const statusEl    = $('status');
const skillSlider = $('skillLevel');
const skillOut    = $('skillValue');
const sideCard    = $('sideCard');
const undoBtn     = $('undoBtn');
const reviewBtn   = $('reviewBtn');
const analyzeBtn  = $('analyzeBtn');
const flipBtn     = $('flipBtn');
const newGameBtn  = $('newGameBtn');
const savePgnBtn  = $('savePgnBtn');
const loadPgnBtn  = $('loadPgnBtn');
const pgnFile     = $('pgnFile');
const liveLink    = $('liveLink');
const aBox        = $('analysisBox');
const aEval       = $('aEval');
const aMove       = $('aMove');
const aPv         = $('aPv');
const reviewSection = $('reviewSection');
const reviewStats   = $('reviewStats');
const evalChart     = $('evalChart');
const boardFrame    = $('boardFrame');
const boardOverlay  = $('boardOverlay');
const tcSelect      = $('tcSelect');
const liveAnalysisCard = $('liveAnalysisCard');
const clockTop      = $('clockTop');
const clockBottom   = $('clockBottom');
const clockTopLabel    = $('clockTopLabel');
const clockBottomLabel = $('clockBottomLabel');

const evalBar = new EvalBar($('evalBar'), $('evalFill'), $('evalNumber'));
const shapes = new ShapeLayer(boardOverlay, () => board.orientation());
attachRightClick(boardFrame, shapes);

const clocks = new Clocks({
    whiteEl: clockBottom, blackEl: clockTop,
    onTimeout: loser => handleTimeout(loser),
});

// Restore UI state
tcSelect.value = timeControl;
applyAnalysisAllowed();
evalBar.setEnabled(showEval && analysisAllowed);

// ============ Helpers ============
function saveLocal() { localStorage.setItem('chessGamePgn', game.pgn()); }

function setStatus(text, color) {
    statusEl.innerHTML = `<span class="dot" style="background:${color || '#34c759'}"></span>${text}`;
}

function refreshStatus() {
    if (game.game_over()) { setStatus('Game over', '#ff3b30'); return; }
    const turnName = game.turn() === 'w' ? 'White' : 'Black';
    if (gameMode === 'friend') setStatus(`${turnName} to move`);
    else if (game.turn()[0] === userSide[0]) setStatus(`Your move — ${turnName}`);
    else setStatus('Engine to move', '#98989d');
}

function refreshHighlights() {
    hl.clearAll();
    shapes.clear('system');
    if (viewingPly !== null) return;
    if (lastMove) hl.last(lastMove.from, lastMove.to);
    if (showBest && bestHint && analysisAllowed) shapes.setBestMove(bestHint);
}

function applyAnalysisAllowed() {
    liveAnalysisCard.style.opacity = analysisAllowed ? '' : '0.45';
    liveAnalysisCard.style.pointerEvents = analysisAllowed ? '' : 'none';
    if (!analysisAllowed) {
        showEval = false; showBest = false; bestHint = null;
        aBox.classList.remove('visible');
        evalBar.setEnabled(false);
    } else {
        evalBar.setEnabled(showEval);
    }
}

function applyClockLabels() {
    // The bottom clock is the user's perspective
    const myColor = (gameMode === 'engine') ? userSide : (board && board.orientation()) || 'white';
    clockBottomLabel.textContent = myColor === 'white' ? 'White' : 'Black';
    clockTopLabel.textContent    = myColor === 'white' ? 'Black' : 'White';
    // Reassign clock elements to colors
    clocks.whiteEl = myColor === 'white' ? clockBottom : clockTop;
    clocks.blackEl = myColor === 'white' ? clockTop    : clockBottom;
    clocks.whiteTimeEl = clocks.whiteEl.querySelector('.time');
    clocks.blackTimeEl = clocks.blackEl.querySelector('.time');
}

function applyTimeControl() {
    const tc = parseTimeControl(timeControl);
    if (tc) { clocks.enable(tc.initial, tc.increment); applyClockLabels(); }
    else clocks.disable();
}

function updateModeUI() {
    sideCard.style.display = gameMode === 'engine' ? '' : 'none';
    document.querySelectorAll('#modeSelect button').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === gameMode));
    reviewBtn.disabled = !(game.game_over() || game.history().length > 0);
}

function updateUndoBtn() {
    undoBtn.disabled = game.history().length === 0 || viewingPly !== null;
}

function renderHistory() {
    const cls = reviewData ? reviewData.classifications : [];
    renderMoves(historyEl, game.history(), cls, viewingPly);
    historyEl.querySelectorAll('td.mv').forEach(td => {
        td.addEventListener('click', () => jumpToPly(parseInt(td.dataset.ply)));
    });
}

function jumpToPly(ply) {
    const temp = new Chess();
    const moves = game.history();
    for (let i = 0; i <= ply && i < moves.length; i++) temp.move(moves[i]);
    viewingPly = ply;
    board.position(temp.fen());
    hl.clearAll();
    const v = temp.history({verbose:true});
    const last = v[v.length - 1];
    if (last) hl.last(last.from, last.to);
    liveLink.classList.add('visible');
    updateUndoBtn();
    renderHistory();
}

function goLive() {
    viewingPly = null;
    board.position(game.fen());
    liveLink.classList.remove('visible');
    refreshHighlights();
    updateUndoBtn();
    renderHistory();
}

// ============ Engine ============
async function requestEngineMove() {
    if (game.game_over()) { handleGameOver(); return; }
    setStatus('Thinking…', '#ff9f0a');
    try {
        const data = await api.analyze(game.fen(), parseInt(skillSlider.value));
        if (!data.move) { refreshStatus(); return; }
        const m = game.move(data.move, { sloppy: true });
        lastMove = m ? { from: m.from, to: m.to } : null;
        board.position(game.fen());
        if (analysisAllowed && showEval) evalBar.set(data.analysis);
        saveLocal();
        renderHistory(); updateUndoBtn(); refreshStatus(); refreshHighlights();
        clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
        if (analysisAllowed && (showBest || showEval)) requestHint();
        if (game.game_over()) handleGameOver();
    } catch { setStatus('Engine error', '#ff3b30'); }
}

async function requestHint({ show=false } = {}) {
    if (game.game_over() || !analysisAllowed) return;
    const data = await api.hint(game.fen());
    bestHint = data.move;
    if (showEval) evalBar.set(data.analysis);
    if (show || showBest || showEval) {
        aBox.classList.add('visible');
        aBox.classList.remove('flash'); void aBox.offsetWidth; aBox.classList.add('flash');
        aEval.textContent = formatEval(data.analysis);
        aMove.textContent = data.move || '—';
        aPv.textContent = (data.top_moves || []).map(t => t.Move).join('  ·  ');
    }
    refreshHighlights();
    return data;
}

async function runAnalyze() {
    if (!analysisAllowed) { setStatus('Analysis disabled for this game', '#ff9f0a'); return; }
    analyzeBtn.textContent = 'Analyzing…';
    analyzeBtn.disabled = true;
    try { await requestHint({ show: true }); }
    finally { analyzeBtn.textContent = 'Analyze'; analyzeBtn.disabled = false; }
}

// ============ Game end ============
function handleGameOver() {
    const outcome = modal.describeOutcome(game);
    clocks.setActive(null);
    refreshStatus();
    modal.show(outcome);
    saveFinishedGame(outcome.result);
}

function handleTimeout(loser) {
    const winner = loser === 'white' ? 'Black' : 'White';
    setStatus(`${winner} wins on time`, '#ff3b30');
    modal.show({
        icon: loser === 'white' ? '♚' : '♔',
        title: `${winner} wins on time`,
        sub: `${loser[0].toUpperCase() + loser.slice(1)} flag fell.`,
    });
    saveFinishedGame(loser === 'white' ? '0-1' : '1-0');
}

function saveFinishedGame(result) {
    if (!window.__USER__ || savedToServer || game.history().length === 0) return;
    savedToServer = true;
    api.saveGame({
        pgn: game.pgn(),
        mode: gameMode,
        color: userSide,
        opponent: gameMode === 'engine' ? `Stockfish lv ${skillSlider.value}` : 'Local friend',
        result,
    });
}

// ============ Drag ============
function onDragStart(source, piece) {
    if (viewingPly !== null) return false;
    if (game.game_over()) return false;
    if (gameMode === 'engine') {
        const ut = userSide[0];
        if (game.turn() !== ut || piece[0] !== ut) return false;
    } else {
        if (piece[0] !== game.turn()) return false;
    }
    shapes.clearUser();
    hl.legalMoves(game, source);
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    hl.clearAll();
    if (move === null) { refreshHighlights(); return 'snapback'; }
    lastMove = { from: move.from, to: move.to };
    saveLocal();
    renderHistory(); updateUndoBtn(); refreshStatus(); refreshHighlights();
    clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
    if (game.game_over()) { handleGameOver(); return; }
    if (gameMode === 'engine') setTimeout(requestEngineMove, 150);
    else {
        if (autoFlip) setTimeout(flipWithAnim, 250);
        if (analysisAllowed && (showBest || showEval)) setTimeout(requestHint, 100);
    }
}

function onSnapEnd() { board.position(game.fen()); refreshHighlights(); }

// ============ Actions ============
function newGame() {
    localStorage.removeItem('chessGamePgn');
    game.reset();
    lastMove = null; bestHint = null; reviewData = null; viewingPly = null;
    savedToServer = false;
    reviewSection.classList.remove('visible');
    shapes.clearUser(); shapes.clear('system');
    const orient = gameMode === 'engine' ? userSide : 'white';
    board.orientation(orient);
    board.position(game.fen());
    applyTimeControl();
    applyAnalysisAllowed();
    renderHistory(); updateUndoBtn(); updateModeUI(); refreshStatus(); refreshHighlights();
    liveLink.classList.remove('visible');
    aBox.classList.remove('visible');
    if (gameMode === 'engine' && userSide === 'black') setTimeout(requestEngineMove, 300);
    else if (analysisAllowed && (showBest || showEval)) requestHint();
}

function doUndo() {
    if (game.history().length === 0 || viewingPly !== null) return;
    game.undo();
    if (gameMode === 'engine' && game.history().length > 0 && game.turn()[0] !== userSide[0]) {
        game.undo();
    }
    lastMove = null;
    const v = game.history({verbose:true});
    const last = v[v.length-1];
    if (last) lastMove = { from: last.from, to: last.to };
    board.position(game.fen());
    saveLocal(); renderHistory(); updateUndoBtn(); refreshStatus(); refreshHighlights();
    clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
    if (analysisAllowed && (showBest || showEval)) requestHint();
}

function flipWithAnim() {
    boardFrame.classList.add('flipping');
    setTimeout(() => {
        board.orientation(board.orientation() === 'white' ? 'black' : 'white');
        applyClockLabels();
    }, 275);
    setTimeout(() => {
        boardFrame.classList.remove('flipping');
        shapes.render(); refreshHighlights();
    }, 600);
}

async function runReview() {
    if (!game.history().length) return;
    reviewBtn.textContent = 'Reviewing…';
    reviewBtn.disabled = true;
    const temp = new Chess();
    const moves = game.history({verbose:true});
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
            const delta = signedEval(after.eval, side) - signedEval(before.eval, side);
            const playedUci = moves[i].from + moves[i].to + (moves[i].promotion || '');
            const isBest = before.best && playedUci.startsWith(before.best.substring(0, 4));
            cls.push(classify(delta, isBest));
        }
        reviewData = { classifications: cls, evals };
        renderHistory();
        renderChart(evalChart, evals, cls);
        renderStats(reviewStats, cls);
        reviewSection.classList.add('visible');
        reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
        reviewBtn.textContent = 'Review';
        reviewBtn.disabled = false;
    }
}

function savePgnFile() {
    const pgn = game.pgn() || '*';
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'game-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.pgn';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadPgnFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const fresh = new Chess();
        if (!fresh.load_pgn(e.target.result, { sloppy: true })) {
            setStatus('Invalid PGN', '#ff3b30'); return;
        }
        game = fresh;
        board.position(game.fen());
        saveLocal(); renderHistory(); updateUndoBtn(); refreshStatus();
        hl.clearAll();
        const v = game.history({verbose:true});
        const last = v[v.length-1];
        if (last) { lastMove = {from:last.from, to:last.to}; hl.last(last.from, last.to); }
    };
    reader.readAsText(file);
}

// ============ Bindings ============
function bindSwitch(el, getter, setter) {
    const apply = () => el.classList.toggle('on', getter());
    apply();
    el.addEventListener('click', () => { setter(!getter()); apply(); });
}
bindSwitch($('autoFlipSwitch'), () => autoFlip, v => { autoFlip = v; localStorage.setItem('chessAutoFlip', v?'1':'0'); });
bindSwitch($('showEvalSwitch'), () => showEval, v => {
    if (!analysisAllowed) return;
    showEval = v;
    localStorage.setItem('chessShowEval', v?'1':'0');
    evalBar.setEnabled(v);
    if (v) requestHint(); else aBox.classList.remove('visible');
});
bindSwitch($('showBestSwitch'), () => showBest, v => {
    if (!analysisAllowed) return;
    showBest = v;
    localStorage.setItem('chessShowBest', v?'1':'0');
    if (v) requestHint(); else { bestHint = null; refreshHighlights(); }
});
bindSwitch($('analysisAllowedSwitch'), () => analysisAllowed, v => {
    analysisAllowed = v;
    localStorage.setItem('chessAnalysisAllowed', v?'1':'0');
    applyAnalysisAllowed();
});

tcSelect.addEventListener('change', () => {
    timeControl = tcSelect.value;
    localStorage.setItem('chessTC', timeControl);
});

document.querySelectorAll('#modeSelect button').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.mode === gameMode) return;
        gameMode = btn.dataset.mode;
        localStorage.setItem('chessMode', gameMode);
        updateModeUI(); newGame();
    });
});
document.querySelectorAll('#sideSelect button').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.side === userSide) return;
        userSide = btn.dataset.side;
        localStorage.setItem('chessSide', userSide);
        document.querySelectorAll('#sideSelect button').forEach(b =>
            b.classList.toggle('active', b.dataset.side === userSide));
        newGame();
    });
});
document.querySelectorAll('#sideSelect button').forEach(b =>
    b.classList.toggle('active', b.dataset.side === userSide));

skillSlider.value = localStorage.getItem('chessSkill') || skillSlider.value;
skillOut.textContent = skillSlider.value;
skillSlider.addEventListener('input', () => {
    skillOut.textContent = skillSlider.value;
    localStorage.setItem('chessSkill', skillSlider.value);
});

undoBtn.addEventListener('click', doUndo);
analyzeBtn.addEventListener('click', runAnalyze);
reviewBtn.addEventListener('click', runReview);
flipBtn.addEventListener('click', flipWithAnim);
newGameBtn.addEventListener('click', newGame);
savePgnBtn.addEventListener('click', savePgnFile);
loadPgnBtn.addEventListener('click', () => pgnFile.click());
pgnFile.addEventListener('change', e => { if (e.target.files[0]) loadPgnFile(e.target.files[0]); });
liveLink.addEventListener('click', goLive);

modal.bind(runReview, newGame);

// ============ Init ============
board = Chessboard('myBoard', {
    draggable: true,
    position: game.fen(),
    orientation: gameMode === 'engine' ? userSide : 'white',
    pieceTheme: PIECE_THEME,
    ...ANIM,
    onDragStart, onDrop, onSnapEnd
});

updateModeUI(); renderHistory(); updateUndoBtn(); refreshStatus();
applyTimeControl();

const v0 = game.history({verbose:true});
if (v0.length) {
    const l = v0[v0.length-1];
    lastMove = { from: l.from, to: l.to };
    hl.last(l.from, l.to);
    clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
}
if (!game.game_over() && gameMode === 'engine' && game.turn() !== userSide[0]) {
    setTimeout(requestEngineMove, 400);
} else if (analysisAllowed && (showBest || showEval)) {
    setTimeout(requestHint, 300);
}
if (game.game_over()) handleGameOver();
