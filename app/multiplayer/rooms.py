"""In-memory rooms. Seats are sticky by username — reconnects restore them."""
import secrets
import string
import threading
import time
import chess

_lock = threading.Lock()
_rooms: dict[str, "Room"] = {}


class Room:
    def __init__(self, code: str, creator: str, time_control=None, analysis_allowed: bool = True):
        self.code = code
        self.creator = creator
        self.board = chess.Board()
        self.pgn_moves: list[str] = []

        # Seats are persistent: username keeps its color through disconnects.
        self.seats: dict[str, str] = {}                     # color -> username
        self.sids: dict[str, str | None] = {}               # color -> sid (None if offline)
        self.last_seen: dict[str, float] = {}               # username -> ts (set on disconnect)
        self.spectators: set[str] = set()

        # Time control
        self.tc = time_control                              # {"initial":sec,"increment":sec} or None
        if time_control:
            self.times = {"white": time_control["initial"] * 1000,
                          "black": time_control["initial"] * 1000}
        else:
            self.times = {"white": None, "black": None}
        self.last_move_at = None                            # server ms when last move was played
        self.analysis_allowed = bool(analysis_allowed)

        self.over = False
        self.result = "*"
        self.ended_reason = None
        self.pending_draw = None  # color of player who offered (white|black|None)

    # ---------- Seat management ----------
    def color_of_user(self, username):
        for c, u in self.seats.items():
            if u == username:
                return c
        return None

    def color_of_sid(self, sid):
        for c, s in self.sids.items():
            if s == sid:
                return c
        return None

    def join(self, sid: str, username: str):
        """Returns seat ('white'|'black'|'spectator'). Restores seat on reconnect."""
        existing = self.color_of_user(username)
        if existing:
            self.sids[existing] = sid
            self.last_seen.pop(username, None)
            return existing
        if "white" not in self.seats:
            self.seats["white"] = username
            self.sids["white"]  = sid
            return "white"
        if "black" not in self.seats:
            self.seats["black"] = username
            self.sids["black"]  = sid
            return "black"
        self.spectators.add(sid)
        return "spectator"

    def disconnect(self, sid: str):
        for c, s in list(self.sids.items()):
            if s == sid:
                self.sids[c] = None
                self.last_seen[self.seats[c]] = time.time()
                return c
        self.spectators.discard(sid)
        return None

    def is_online(self, color):
        return self.sids.get(color) is not None

    # ---------- Game flow ----------
    def _now_ms(self):
        return int(time.time() * 1000)

    def _check_flag(self):
        """If clocks ran out, end game on time."""
        if not self.tc or self.last_move_at is None or self.over:
            return False
        active = "white" if self.board.turn else "black"
        elapsed = self._now_ms() - self.last_move_at
        remaining = (self.times[active] or 0) - elapsed
        if remaining <= 0:
            self.times[active] = 0
            self.over = True
            self.result = "0-1" if active == "white" else "1-0"
            self.ended_reason = {"kind": "timeout", "loser": active}
            return True
        return False

    def tick(self):
        """Caller may invoke periodically to enforce time-outs."""
        return self._check_flag()

    def apply_move(self, uci: str):
        if self.over:
            return False
        try:
            mv = chess.Move.from_uci(uci)
        except ValueError:
            return False
        if mv not in self.board.legal_moves:
            return False

        # Update clocks before applying move
        now = self._now_ms()
        if self.tc:
            if self.last_move_at is not None:
                mover = "white" if self.board.turn else "black"
                elapsed = now - self.last_move_at
                self.times[mover] -= elapsed
                if self.times[mover] <= 0:
                    self.times[mover] = 0
                    self.over = True
                    self.result = "0-1" if mover == "white" else "1-0"
                    self.ended_reason = {"kind": "timeout", "loser": mover}
                    return True
                self.times[mover] += self.tc["increment"] * 1000

        san = self.board.san(mv)
        self.board.push(mv)
        self.pgn_moves.append(san)
        self.last_move_at = now

        if self.board.is_game_over():
            self.over = True
            self.ended_reason = self._native_end_reason()
            outcome = self.board.outcome()
            if outcome:
                if outcome.winner is True:    self.result = "1-0"
                elif outcome.winner is False: self.result = "0-1"
                else:                          self.result = "1/2-1/2"
        return True

    def resign(self, color):
        if self.over: return False
        if color not in ("white", "black"): return False
        self.over = True
        self.result = "0-1" if color == "white" else "1-0"
        self.ended_reason = {"kind": "resignation", "loser": color}
        self.pending_draw = None
        return True

    def offer_draw(self, color):
        if self.over or color not in ("white", "black"): return False
        # If opponent already offered, accept automatically (mutual offer)
        if self.pending_draw and self.pending_draw != color:
            return self.accept_draw(color)
        self.pending_draw = color
        return True

    def accept_draw(self, color):
        if self.over: return False
        if not self.pending_draw or self.pending_draw == color: return False
        self.over = True
        self.result = "1/2-1/2"
        self.ended_reason = {"kind": "draw", "reason": "agreement"}
        self.pending_draw = None
        return True

    def decline_draw(self, color):
        if self.pending_draw and self.pending_draw != color:
            self.pending_draw = None
            return True
        return False

    def _native_end_reason(self):
        if self.board.is_checkmate():
            winner = "black" if self.board.turn == chess.WHITE else "white"
            return {"kind": "checkmate", "winner": winner}
        if self.board.is_stalemate():            return {"kind": "stalemate"}
        if self.board.is_insufficient_material(): return {"kind": "draw", "reason": "insufficient material"}
        if self.board.can_claim_threefold_repetition(): return {"kind": "draw", "reason": "threefold repetition"}
        if self.board.can_claim_fifty_moves():    return {"kind": "draw", "reason": "fifty-move rule"}
        return {"kind": "draw"}

    def state(self):
        # If we have an active clock, project remaining time for the active player
        proj = dict(self.times)
        if self.tc and self.last_move_at is not None and not self.over:
            active = "white" if self.board.turn else "black"
            elapsed = self._now_ms() - self.last_move_at
            proj[active] = max(0, (self.times[active] or 0) - elapsed)

        return {
            "code": self.code,
            "fen": self.board.fen(),
            "pgn": " ".join(self.pgn_moves),
            "turn": "white" if self.board.turn == chess.WHITE else "black",
            "players": {c: u for c, u in self.seats.items()},
            "online":  {c: self.is_online(c) for c in self.seats},
            "tc": self.tc,
            "times": proj,
            "last_move_at": self.last_move_at,
            "server_ts": self._now_ms(),
            "analysis_allowed": self.analysis_allowed,
            "pending_draw": self.pending_draw,
            "result": self.result,
            "over": self.over,
            "ended": self.ended_reason if self.over else None,
        }


def _new_code():
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if code not in _rooms:
            return code


def create_room(username, time_control=None, analysis_allowed=True):
    with _lock:
        code = _new_code()
        _rooms[code] = Room(code, username, time_control=time_control,
                            analysis_allowed=analysis_allowed)
        return _rooms[code]


def get_room(code):
    return _rooms.get(code.upper())


def drop_if_dead(code, max_age_sec=3600):
    with _lock:
        r = _rooms.get(code)
        if not r:
            return
        any_online = any(r.is_online(c) for c in r.seats)
        if not any_online and not r.spectators:
            ages = [time.time() - ts for ts in r.last_seen.values()]
            if not ages or max(ages) > max_age_sec:
                _rooms.pop(code, None)


def all_rooms():
    return _rooms
