import * as api from './modules/api.js';
import * as hl from './modules/highlights.js';
import { render as renderMoves } from './modules/historyView.js';
import { EvalBar, formatEval } from './modules/evalBar.js';
import { ShapeLayer, attachRightClick } from './modules/shapes.js';
import { renderStats, renderChart, signedEval, classify } from './modules/reviewChart.js';
import * as modal from './modules/gameOverModal.js';
import { Clocks, parseTimeControl } from './modules/clocks.js';
import { PIECE_THEME, ANIM } from './modules/boardConfig.js';
import { showPicker as showPromoPicker, isPromotionMove } from './modules/promotion.js';
import { renderBoth as renderCaptured } from './modules/captured.js';
import { TotalTimer } from './modules/totalTimer.js';

// ============ State ============
let game = new Chess();
let board;
let sourceSquare = null;
let gameMode  = localStorage.getItem('chessMode') || 'engine';
let userSide  = localStorage.getItem('chessSide') || 'white';
let autoFlip  = localStorage.getItem('chessAutoFlip') === '1';
let showEval  = localStorage.getItem('chessShowEval') === '1';
let showBest  = localStorage.getItem('chessShowBest') === '1';
let analysisAllowed = localStorage.getItem('chessAnalysisAllowed') !== '0';
let analysisSide = localStorage.getItem('chessAnalysisSide') || 'both';  // both | white | black
if (!['both', 'white', 'black'].includes(analysisSide)) analysisSide = 'both';
let timeControl = localStorage.getItem('chessTC') || 'off';
let lastMove  = null;
let bestHint  = null;
let reviewData = null;
let viewingPly = null;
let explorationMoves = [];   // SAN strings — variations explored during review
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
const capturedTop      = $('capturedTop');
const capturedBottom   = $('capturedBottom');
const totalTimerEl     = $('totalTimer');
const variationBar     = $('variationBar');
const myBoardEl        = $('myBoard');

const evalBar = new EvalBar($('evalBar'), $('evalFill'), $('evalNumber'));
const shapes = new ShapeLayer(boardOverlay, () => board.orientation());
attachRightClick(boardFrame, shapes);

const clocks = new Clocks({
    whiteEl: clockBottom, blackEl: clockTop,
    onTimeout: loser => handleTimeout(loser),
});

const totalTimer = new TotalTimer(totalTimerEl);

// Skill slider — bind early so it works even if anything below crashes.
skillSlider.value = localStorage.getItem('chessSkill') || skillSlider.value;
skillOut.textContent = skillSlider.value;
skillSlider.addEventListener('input', () => {
    skillOut.textContent = skillSlider.value;
    localStorage.setItem('chessSkill', skillSlider.value);
});

// Surface any init failures in the browser console so they don't silently kill the page.
window.addEventListener('error', e => console.error('[chess] runtime error:', e.message, e.filename, e.lineno));

// Restore UI state
tcSelect.value = timeControl;
applyAnalysisAllowed();
evalBar.setEnabled(showEval && analysisAllowed);

// ============ Helpers ============
function saveLocal() { localStorage.setItem('chessGamePgn', game.pgn()); }

function setStatus(text, color) {
    const dot = statusEl.querySelector('.dot');
    const tx  = statusEl.querySelector('#statusText');
    if (dot) dot.style.background = color || '#34c759';
    if (tx)  tx.textContent = text;
    else     statusEl.innerHTML = `<span class="dot" style="background:${color||'#34c759'}"></span><span id="statusText">${text}</span><span class="total-timer-chip" id="totalTimer">0:00</span>`;
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
    if (viewingPly !== null && !inExploration()) return;
    if (lastMove) hl.last(lastMove.from, lastMove.to);
    if (showBest && bestHint && analysisAllowed && analysisSideAllows()) shapes.setBestMove(bestHint);
}

function analysisSideAllows() {
    if (analysisSide === 'both') return true;
    if (analysisSide === 'white') return game.turn() === 'w';
    if (analysisSide === 'black') return game.turn() === 'b';
    return true;
}

function refreshCaptured() {
    const dispGame = getDisplayGame();
    const userColor = gameMode === 'engine' ? userSide :
        (board && board.orientation()) || 'white';
    renderCaptured(dispGame, capturedTop, capturedBottom, userColor);
}

function inExploration() { return viewingPly !== null && explorationMoves.length > 0; }

function getDisplayGame() {
    // Returns a chess.js representing currently-shown position.
    if (viewingPly === null && explorationMoves.length === 0) return game;
    const dg = new Chess();
    const main = game.history();
    const limit = viewingPly !== null ? viewingPly + 1 : main.length;
    for (let i = 0; i < limit; i++) dg.move(main[i]);
    for (const san of explorationMoves) dg.move(san, { sloppy: true });
    return dg;
}

function syncBoardFromDisplay() {
    board.position(getDisplayGame().fen());
}

function renderVariationBar() {
    if (explorationMoves.length === 0) {
        variationBar.classList.remove('visible');
        variationBar.innerHTML = '';
        return;
    }
    variationBar.classList.add('visible');
    variationBar.innerHTML =
        `<span class="var-label">Variation</span>` +
        `<span class="var-line">${explorationMoves.join('  ')}</span>` +
        `<button class="var-reset" id="varResetBtn">Reset</button>`;
    $('varResetBtn').addEventListener('click', () => {
        explorationMoves = [];
        syncBoardFromDisplay();
        refreshHighlights();
        refreshCaptured();
        renderVariationBar();
    });
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
    viewingPly = ply;
    explorationMoves = [];
    syncBoardFromDisplay();
    hl.clearAll();
    const dg = getDisplayGame();
    const v = dg.history({verbose:true});
    const last = v[v.length - 1];
    if (last) hl.last(last.from, last.to);
    liveLink.classList.add('visible');
    updateUndoBtn();
    renderHistory();
    refreshCaptured();
    renderVariationBar();
}

function goLive() {
    viewingPly = null;
    explorationMoves = [];
    board.position(game.fen());
    liveLink.classList.remove('visible');
    refreshHighlights();
    updateUndoBtn();
    renderHistory();
    refreshCaptured();
    renderVariationBar();
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
        if (analysisAllowed && showEval && analysisSideAllows()) evalBar.set(data.analysis);
        saveLocal();
        totalTimer.start();
        renderHistory(); updateUndoBtn(); refreshStatus(); refreshHighlights(); refreshCaptured();
        clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
        if (analysisAllowed && (showBest || showEval) && analysisSideAllows()) requestHint();
        if (game.game_over()) handleGameOver();
    } catch { setStatus('Engine error', '#ff3b30'); }
}

async function requestHint({ show=false } = {}) {
    if (game.game_over() || !analysisAllowed) return;
    if (!show && !analysisSideAllows()) return;
    const data = await api.hint(game.fen());
    bestHint = data.move;
    if (showEval || show) evalBar.set(data.analysis);
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
    totalTimer.stop();
    refreshStatus();
    modal.show(outcome);
    saveFinishedGame(outcome.result);
}

function handleTimeout(loser) {
    const winner = loser === 'white' ? 'Black' : 'White';
    setStatus(`${winner} wins on time`, '#ff3b30');
    totalTimer.stop();
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
    if (game.game_over()) return false;

    // During review the user can drag any side to explore variations.
    if (viewingPly !== null) {
        const dg = getDisplayGame();
        if (piece[0] !== dg.turn()) return false;
        sourceSquare = null;
        shapes.clearUser();
        hl.legalMoves(dg, source);
        return;
    }

    if (gameMode === 'engine') {
        const ut = userSide[0];
        if (game.turn() !== ut || piece[0] !== ut) return false;
    } else {
        if (piece[0] !== game.turn()) return false;
    }
    sourceSquare = null;
    shapes.clearUser();
    hl.legalMoves(game, source);
}

async function promotionChoice(target, colorChar) {
    return showPromoPicker({
        boardEl: myBoardEl,
        square: target,
        color: colorChar,
        orientation: board.orientation(),
    });
}

async function handleMove(source, target) {
    // Review-mode exploration — operate on the display game, not the real one.
    if (viewingPly !== null) {
        const dg = getDisplayGame();
        let promo;
        if (isPromotionMove(dg, source, target)) {
            promo = await promotionChoice(target, dg.turn());
            if (!promo) { board.position(dg.fen()); return null; }
        }
        const m = dg.move({ from: source, to: target, promotion: promo || 'q' });
        if (!m) { board.position(dg.fen()); refreshHighlights(); return null; }
        explorationMoves.push(m.san);
        board.position(dg.fen());
        lastMove = { from: m.from, to: m.to };
        renderVariationBar();
        refreshHighlights(); refreshCaptured();
        return m;
    }

    // Real move: pick promotion piece if applicable
    let promo;
    if (isPromotionMove(game, source, target)) {
        promo = await promotionChoice(target, game.turn());
        if (!promo) { board.position(game.fen()); return null; }
    }

    const move = game.move({ from: source, to: target, promotion: promo || 'q' });
    hl.clearAll();
    if (move === null) { refreshHighlights(); return null; }
    lastMove = { from: move.from, to: move.to };
    board.position(game.fen());
    saveLocal();
    totalTimer.start();
    renderHistory(); updateUndoBtn(); refreshStatus(); refreshHighlights(); refreshCaptured();
    clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
    if (game.game_over()) { handleGameOver(); return move; }
    if (gameMode === 'engine') setTimeout(requestEngineMove, 150);
    else {
        if (autoFlip) setTimeout(flipWithAnim, 250);
        if (analysisAllowed && (showBest || showEval) && analysisSideAllows()) setTimeout(requestHint, 100);
    }
    return move;
}

function onDrop(source, target) {
    // Snap the piece back instantly; handleMove updates the board to the real position
    // (or restores it) once promotion / async logic resolves.
    handleMove(source, target);
    return 'snapback';
}

function onSnapEnd() { board.position(getDisplayGame().fen()); refreshHighlights(); }

function onSquareClick(square) {
    if (game.game_over()) return;
    // In review with no exploration started, allow exploration if user clicks any piece.
    if (viewingPly === null && gameMode === 'engine' && game.turn() !== userSide[0]) return;

    const dispGame = getDisplayGame();
    if (sourceSquare) {
        if (sourceSquare === square) {
            sourceSquare = null; refreshHighlights(); return;
        }
        handleMove(sourceSquare, square);
        sourceSquare = null;
        return;
    }
    const piece = dispGame.get(square);
    if (piece && piece.color === dispGame.turn()) {
        sourceSquare = square;
        hl.clearAll();
        if (lastMove) hl.last(lastMove.from, lastMove.to);
        hl.legalMoves(dispGame, square);
    } else {
        sourceSquare = null;
        refreshHighlights();
    }
}

// ============ Actions ============
function newGame() {
    localStorage.removeItem('chessGamePgn');
    game.reset();
    lastMove = null; bestHint = null; reviewData = null; viewingPly = null;
    explorationMoves = [];
    savedToServer = false;
    reviewSection.classList.remove('visible');
    shapes.clearUser(); shapes.clear('system');
    const orient = gameMode === 'engine' ? userSide : 'white';
    board.orientation(orient);
    board.position(game.fen());
    applyTimeControl();
    applyAnalysisAllowed();
    totalTimer.reset();
    renderHistory(); updateUndoBtn(); updateModeUI(); refreshStatus(); refreshHighlights();
    refreshCaptured(); renderVariationBar();
    liveLink.classList.remove('visible');
    aBox.classList.remove('visible');
    if (gameMode === 'engine' && userSide === 'black') setTimeout(requestEngineMove, 300);
    else if (analysisAllowed && (showBest || showEval) && analysisSideAllows()) requestHint();
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
        // Split stats per side — white moves are even plies (0, 2, …), black are odd
        const whiteCls = cls.filter((_, i) => i % 2 === 0);
        const blackCls = cls.filter((_, i) => i % 2 === 1);
        reviewStats.innerHTML = '';
        const whiteBlock = document.createElement('div'); whiteBlock.className = 'review-side';
        const blackBlock = document.createElement('div'); blackBlock.className = 'review-side';
        reviewStats.appendChild(whiteBlock);
        reviewStats.appendChild(blackBlock);
        renderStats(whiteBlock, whiteCls, 'White');
        renderStats(blackBlock, blackCls, 'Black');
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

// Analysis side selector
document.querySelectorAll('#analysisSideSelect button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.side === analysisSide);
    btn.addEventListener('click', () => {
        analysisSide = btn.dataset.side;
        localStorage.setItem('chessAnalysisSide', analysisSide);
        document.querySelectorAll('#analysisSideSelect button').forEach(b =>
            b.classList.toggle('active', b.dataset.side === analysisSide));
        if (analysisSideAllows() && analysisAllowed && (showBest || showEval)) requestHint();
        else { bestHint = null; aBox.classList.remove('visible'); evalBar.setEnabled(false); refreshHighlights(); }
    });
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

undoBtn.addEventListener('click', doUndo);
analyzeBtn.addEventListener('click', runAnalyze);
reviewBtn.addEventListener('click', runReview);
flipBtn.addEventListener('click', flipWithAnim);
newGameBtn.addEventListener('click', newGame);
savePgnBtn.addEventListener('click', savePgnFile);
loadPgnBtn.addEventListener('click', () => pgnFile.click());
pgnFile.addEventListener('change', e => { if (e.target.files[0]) loadPgnFile(e.target.files[0]); });
liveLink.addEventListener('click', goLive);

// ============ Resign / Draw (solo) ============
const resignBtn = $('resignBtn');
const drawBtn = $('drawBtn');

function handleResign() {
    if (game.game_over()) return;
    if (!confirm('Resign this game?')) return;
    const loser = (gameMode === 'engine') ? userSide : (game.turn() === 'w' ? 'white' : 'black');
    const result = loser === 'white' ? '0-1' : '1-0';
    const winner = loser === 'white' ? 'Black' : 'White';
    clocks.setActive(null);
    setStatus(`${winner} wins by resignation`, '#ff3b30');
    modal.show({
        icon: '🏳️',
        title: gameMode === 'engine' ? 'You resigned' : `${winner} wins by resignation`,
        sub: 'Better luck next game.',
    });
    saveFinishedGame(result);
}

async function handleDrawOffer() {
    if (game.game_over()) return;
    if (gameMode === 'engine') {
        setStatus('Offering draw…', '#ff9f0a');
        try {
            const data = await api.hint(game.fen());
            const evaluation = data.analysis || {};
            const cp = evaluation.type === 'mate' ? 9999 : Math.abs(evaluation.value || 0);
            const accept = cp < 60 && game.history().length >= 20;
            if (accept) {
                clocks.setActive(null);
                setStatus('Draw agreed', '#34c759');
                modal.show({ icon: '½', title: 'Draw agreed', sub: 'Engine accepted your offer.' });
                saveFinishedGame('1/2-1/2');
            } else {
                setStatus('Engine declined the draw', '#ff9f0a');
                setTimeout(refreshStatus, 2500);
            }
        } catch {
            setStatus('Engine error', '#ff3b30');
        }
    } else {
        if (confirm("Agree to a draw? (Both players' consent)")) {
            clocks.setActive(null);
            setStatus('Draw agreed', '#34c759');
            modal.show({ icon: '½', title: 'Draw agreed' });
            saveFinishedGame('1/2-1/2');
        }
    }
}

resignBtn.addEventListener('click', handleResign);
drawBtn.addEventListener('click', handleDrawOffer);

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

// Ход по клику через делегирование (более отзывчиво для мобильных)
const boardEl = document.querySelector('#myBoard');
const handleSquareEvent = e => {
    const square = e.target.closest('.square-55d63')?.dataset.square;
    if (square) {
        // Предотвращаем "двойной" запуск для touch + click
        if (e.type === 'touchstart') {
            e.preventDefault(); 
            onSquareClick(square);
        } else if (e.type === 'mousedown' && e.button === 0) {
            onSquareClick(square);
        }
    }
};
boardEl.addEventListener('mousedown', handleSquareEvent);
boardEl.addEventListener('touchstart', handleSquareEvent, { passive: false });

updateModeUI(); renderHistory(); updateUndoBtn(); refreshStatus();
applyTimeControl();
refreshCaptured();
renderVariationBar();

const v0 = game.history({verbose:true});
if (v0.length) {
    const l = v0[v0.length-1];
    lastMove = { from: l.from, to: l.to };
    hl.last(l.from, l.to);
    clocks.setActive(game.turn() === 'w' ? 'white' : 'black');
    if (!game.game_over()) totalTimer.start();
}
if (!game.game_over() && gameMode === 'engine' && game.turn() !== userSide[0]) {
    setTimeout(requestEngineMove, 400);
} else if (analysisAllowed && (showBest || showEval) && analysisSideAllows()) {
    setTimeout(requestHint, 300);
}
if (game.game_over()) handleGameOver();
