import * as api from './modules/api.js';
import * as hl from './modules/highlights.js';
import { render as renderMoves } from './modules/historyView.js';
import { ShapeLayer, attachRightClick } from './modules/shapes.js';
import { EvalBar, formatEval } from './modules/evalBar.js';
import * as modal from './modules/gameOverModal.js';
import { Clocks } from './modules/clocks.js';
import { PIECE_THEME, ANIM } from './modules/boardConfig.js';

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
    statusEl.innerHTML = `<span class="dot" style="background:${color || '#34c759'}"></span>${text}`;
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

function handleMove(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) { refreshHighlights(); return null; }
    
    // В мультиплеере мы делаем ход оптимистично и тут же откатываем, 
    // либо просто отправляем на сервер. Здесь мы полагаемся на ответ сервера.
    const uci = move.from + move.to + (move.promotion || '');
    pendingOptimisticMove = uci;
    socket.emit('move', { code, uci });
    game.undo(); 
    hl.clearAll();
    return move;
}

function onDrop(source, target) {
    const move = handleMove(source, target);
    if (move === null) return 'snapback';
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
