import * as api from './modules/api.js';
import * as hl from './modules/highlights.js';
import { render as renderMoves } from './modules/historyView.js';
import { ShapeLayer, attachRightClick } from './modules/shapes.js';
import { EvalBar, formatEval } from './modules/evalBar.js';
import * as modal from './modules/gameOverModal.js';
import { Clocks } from './modules/clocks.js';
import { PIECE_THEME, ANIM } from './modules/boardConfig.js';
import { showPicker as showPromoPicker, isPromotionMove } from './modules/promotion.js';
import { renderBoth as renderCaptured } from './modules/captured.js';
import { TotalTimer } from './modules/totalTimer.js';

const code = window.__ROOM__;
const game = new Chess();
let sourceSquare = null;
let myColor = null;             // 'white' | 'black' | 'spectator'
let lastMove = null;
let serverEnded = null;
let analysisAllowed = false;
let showEval = false;
let showBest = false;
let bestHint = null;
let pendingOptimisticMove = null;

const socket = io({
    path: (window.__BASE__ || '') + '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
});

const $ = id => document.getElementById(id);
const statusEl   = $('status');
const historyEl  = $('history');
const whiteName  = $('whiteName');
const blackName  = $('blackName');
const whiteRow   = $('whiteRow');
const blackRow   = $('blackRow');
const boardFrame = $('boardFrame');
const boardOverlay = $('boardOverlay');
const myBoardEl    = $('myBoard');
const capturedTop  = $('capturedTop');
const capturedBot  = $('capturedBottom');
const totalTimerEl = $('totalTimer');
const totalTimer   = new TotalTimer(totalTimerEl);
const liveCard   = $('liveAnalysisCard');
const aBox       = $('analysisBox');
const aEval      = $('aEval');
const aMove      = $('aMove');
const aPv        = $('aPv');
const evalBarEl  = $('evalBar');
const clockTop   = $('clockTop');
const clockBot   = $('clockBottom');
const clockTopLabel = $('clockTopLabel');
const clockBotLabel = $('clockBottomLabel');
const shareInput = $('shareInput');

shareInput.value = window.location.href;

let board;
let shapes;
const evalBar = new EvalBar(evalBarEl, $('evalFill'), $('evalNumber'));
const clocks = new Clocks({
    whiteEl: clockBot, blackEl: clockTop,
    onTimeout: () => { /* server is authoritative — display only */ },
});

// ============ UI helpers ============
function setStatus(text, color) {
    const dot = statusEl.querySelector('.dot');
    const tx  = statusEl.querySelector('#statusText');
    if (dot) dot.style.background = color || '#34c759';
    if (tx)  tx.textContent = text;
    else     statusEl.innerHTML = `<span class="dot" style="background:${color||'#34c759'}"></span><span id="statusText">${text}</span><span class="total-timer-chip" id="totalTimer">0:00</span>`;
}

function refreshHighlights() {
    hl.clearAll();
    shapes.clear('system');
    if (lastMove) hl.last(lastMove.from, lastMove.to);
    if (showBest && bestHint && analysisAllowed) shapes.setBestMove(bestHint);
}

function setPlayer(rowEl, nameEl, username, online, isYou) {
    nameEl.textContent = username || '— waiting —';
    rowEl.classList.toggle('you', !!isYou);
    rowEl.classList.toggle('offline', !!username && !online);
    rowEl.classList.toggle('empty', !username);
}

function applyClockLabels() {
    const meBottom = (myColor === 'black') ? 'black' : 'white';
    clockBotLabel.textContent = meBottom === 'white' ? 'White' : 'Black';
    clockTopLabel.textContent = meBottom === 'white' ? 'Black' : 'White';
    clocks.whiteEl = meBottom === 'white' ? clockBot : clockTop;
    clocks.blackEl = meBottom === 'white' ? clockTop : clockBot;
    clocks.whiteTimeEl = clocks.whiteEl.querySelector('.time');
    clocks.blackTimeEl = clocks.blackEl.querySelector('.time');
}

// ============ Drag / move ============
function onDragStart(source, piece) {
    if (game.game_over() || serverEnded) return false;
    if (!myColor || myColor === 'spectator') return false;
    const t = game.turn();
    if ((myColor === 'white' && t !== 'w') || (myColor === 'black' && t !== 'b')) return false;
    if (piece[0] !== t) return false;
    sourceSquare = null;
    shapes.clearUser();
    hl.legalMoves(game, source);
}

async function handleMove(source, target) {
    let promo;
    if (isPromotionMove(game, source, target)) {
        promo = await showPromoPicker({
            boardEl: myBoardEl,
            square: target,
            color: game.turn(),
            orientation: board.orientation(),
        });
        if (!promo) { board.position(game.fen()); return null; }
    }
    const move = game.move({ from: source, to: target, promotion: promo || 'q' });
    if (move === null) { refreshHighlights(); board.position(game.fen()); return null; }
    // Send to server (authoritative), then revert local so the broadcast wins
    const uci = move.from + move.to + (move.promotion || '');
    pendingOptimisticMove = uci;
    socket.emit('move', { code, uci });
    game.undo();
    hl.clearAll();
    return move;
}

function onDrop(source, target) {
    handleMove(source, target);
    return 'snapback';
}

function onSnapEnd() { board.position(game.fen()); refreshHighlights(); }

function onSquareClick(square) {
    if (game.game_over() || serverEnded || !myColor || myColor === 'spectator') return;
    const t = game.turn();
    if ((myColor === 'white' && t !== 'w') || (myColor === 'black' && t !== 'b')) return;

    if (sourceSquare) {
        if (sourceSquare === square) {
            sourceSquare = null; refreshHighlights(); return;
        }
        const move = handleMove(sourceSquare, square);
        if (move) {
            sourceSquare = null;
            return;
        }
    }

    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
        sourceSquare = square;
        hl.clearAll();
        if (lastMove) hl.last(lastMove.from, lastMove.to);
        hl.legalMoves(game, square);
    } else {
        sourceSquare = null;
        refreshHighlights();
    }
}

// ============ Server state application ============
function applyServerState(state) {
    game.load(state.fen);

    // History display via PGN re-parse
    const fresh = new Chess();
    if (state.pgn) {
        fresh.load_pgn(state.pgn, { sloppy: true });
        renderMoves(historyEl, fresh.history(), [], null);
        const v = fresh.history({verbose:true});
        const last = v[v.length-1];
        lastMove = last ? { from: last.from, to: last.to } : null;
    } else {
        renderMoves(historyEl, [], [], null);
        lastMove = null;
    }

    board.position(state.fen);
    refreshHighlights();

    // Captured pieces — derived from PGN-replay (game has only current FEN)
    const userColor = myColor === 'black' ? 'black' : 'white';
    renderCaptured(fresh, capturedTop, capturedBot, userColor);

    // Total timer — start once the first move happens, stop on game over
    if (state.over) totalTimer.stop();
    else if (state.pgn) totalTimer.start();

    // Players + online state
    setPlayer(whiteRow, whiteName, state.players.white, state.online && state.online.white, myColor === 'white');
    setPlayer(blackRow, blackName, state.players.black, state.online && state.online.black, myColor === 'black');

    // Time control
    if (state.tc) {
        if (!clocks.enabled) clocks.enable(state.tc.initial, state.tc.increment);
        applyClockLabels();
        clocks.sync({
            white_ms: state.times.white,
            black_ms: state.times.black,
            active: state.last_move_at == null ? null : state.turn,
            server_ts: state.server_ts,
        });
    } else {
        clocks.disable();
    }

    // Analysis permission
    analysisAllowed = !!state.analysis_allowed;
    liveCard.style.display = analysisAllowed ? '' : 'none';
    if (!analysisAllowed) {
        showEval = false; showBest = false; bestHint = null;
        aBox.classList.remove('visible');
        evalBar.setEnabled(false);
        evalBarEl.style.display = 'none';
    }

    // Draw-offer banner
    applyDrawBanner(state);

    // Game over
    if (state.over && state.ended && !serverEnded) {
        serverEnded = state.ended;
        showEnded(state);
        return;
    }

    if (!state.over) {
        const turn = state.turn === 'white' ? 'White' : 'Black';
        if (myColor === state.turn) setStatus(`Your move — ${turn}`);
        else if (myColor === 'spectator') setStatus(`${turn} to move (spectating)`, '#98989d');
        else {
            const opp = state.turn === 'white' ? state.players.white : state.players.black;
            const oppOnline = state.online && state.online[state.turn];
            setStatus(oppOnline ? `Waiting for ${turn}` : `Opponent disconnected — waiting…`, oppOnline ? '#98989d' : '#ff9f0a');
        }
    }

    // Re-fetch hint if live analysis is on
    if (analysisAllowed && (showEval || showBest)) requestHint();
}

function showEnded(state) {
    const ended = state.ended;
    let title = 'Game over', sub = '', icon = '♚';
    if (ended.kind === 'checkmate') {
        const winner = ended.winner;
        title = `${winner[0].toUpperCase() + winner.slice(1)} wins by checkmate`;
        sub = state.result;
        icon = winner === 'white' ? '♔' : '♚';
    } else if (ended.kind === 'timeout') {
        const winner = ended.loser === 'white' ? 'Black' : 'White';
        title = `${winner} wins on time`;
        sub = `${ended.loser[0].toUpperCase() + ended.loser.slice(1)} flag fell.`;
        icon = ended.loser === 'white' ? '♚' : '♔';
    } else if (ended.kind === 'resignation') {
        const winner = ended.loser === 'white' ? 'Black' : 'White';
        title = `${winner} wins by resignation`;
        sub = `${ended.loser[0].toUpperCase() + ended.loser.slice(1)} resigned.`;
        icon = '🏳️';
    } else if (ended.kind === 'stalemate') { title = 'Stalemate'; icon = '½'; }
    else { title = 'Draw'; sub = ended.reason || ''; icon = '½'; }
    setStatus(title, '#ff3b30');
    modal.show({ title, sub, icon });
}

// ============ Live analysis ============
async function requestHint() {
    if (!analysisAllowed) return;
    const data = await api.hint(game.fen());
    bestHint = data.move;
    if (showEval) { evalBar.setEnabled(true); evalBarEl.style.display = ''; evalBar.set(data.analysis); }
    if (showEval || showBest) {
        aBox.classList.add('visible');
        aEval.textContent = formatEval(data.analysis);
        aMove.textContent = data.move || '—';
        aPv.textContent = (data.top_moves || []).map(t => t.Move).join('  ·  ');
    }
    refreshHighlights();
}

function bindSwitch(el, getter, setter) {
    const apply = () => el.classList.toggle('on', getter());
    apply();
    el.addEventListener('click', () => { setter(!getter()); apply(); });
}
bindSwitch($('showEvalSwitch'), () => showEval, v => {
    if (!analysisAllowed) return;
    showEval = v;
    if (v) requestHint();
    else { evalBar.setEnabled(false); evalBarEl.style.display = 'none'; aBox.classList.remove('visible'); }
});
bindSwitch($('showBestSwitch'), () => showBest, v => {
    if (!analysisAllowed) return;
    showBest = v;
    if (v) requestHint();
    else { bestHint = null; refreshHighlights(); }
});

// ============ Wire up ============
board = Chessboard('myBoard', {
    draggable: true,
    position: 'start',
    pieceTheme: PIECE_THEME,
    ...ANIM,
    onDragStart, onDrop, onSnapEnd
});

// Ход по клику через делегирование
const boardEl = document.querySelector('#myBoard');
const handleSquareEvent = e => {
    const square = e.target.closest('.square-55d63')?.dataset.square;
    if (square) {
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

shapes = new ShapeLayer(boardOverlay, () => board.orientation());
attachRightClick(boardFrame, shapes);
modal.bind(null, null);

socket.on('connect', () => {
    setStatus('Connected, joining…', '#ff9f0a');
    socket.emit('join', { code });
});
socket.on('disconnect', () => setStatus('Disconnected — reconnecting…', '#ff3b30'));
socket.on('connect_error', () => setStatus('Connection error — retrying…', '#ff3b30'));
socket.on('error', e => setStatus(e && e.msg ? e.msg : 'Error', '#ff3b30'));

socket.on('state', state => {
    if (state.you) {
        myColor = state.you;
        board.orientation(myColor === 'black' ? 'black' : 'white');
    }
    applyServerState(state);
});

const copyBtn = $('copyBtn');
copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(window.location.href);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => copyBtn.textContent = 'Copy link', 1500);
});

// ============ Resign / Draw ============
const resignBtn = $('resignBtn');
const drawBtn   = $('drawBtn');
const drawBanner   = $('drawBanner');
const drawBannerTx = $('drawBannerText');
const drawAccept   = $('drawAcceptBtn');
const drawDecline  = $('drawDeclineBtn');

resignBtn.addEventListener('click', () => {
    if (!myColor || myColor === 'spectator') return;
    if (!confirm('Resign this game?')) return;
    socket.emit('resign', { code });
});

drawBtn.addEventListener('click', () => {
    if (!myColor || myColor === 'spectator') return;
    socket.emit('draw_offer', { code });
    drawBtn.textContent = 'Offer sent…';
    setTimeout(() => drawBtn.textContent = '½ Draw', 2000);
});

drawAccept.addEventListener('click',  () => socket.emit('draw_accept',  { code }));
drawDecline.addEventListener('click', () => socket.emit('draw_decline', { code }));

function applyDrawBanner(state) {
    if (!state.pending_draw || state.over) {
        drawBanner.style.display = 'none';
        return;
    }
    if (state.pending_draw === myColor) {
        drawBannerTx.textContent = 'Draw offer pending…';
        drawAccept.style.display  = 'none';
        drawDecline.style.display = 'inline-flex';
        drawDecline.textContent = 'Withdraw';
    } else {
        drawBannerTx.textContent = 'Opponent offers a draw.';
        drawAccept.style.display  = 'inline-flex';
        drawDecline.style.display = 'inline-flex';
        drawDecline.textContent = 'Decline';
    }
    drawBanner.style.display = '';
}
