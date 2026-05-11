import threading
import time
from flask import request
from flask_login import current_user
from flask_socketio import join_room, leave_room, emit
from ..extensions import socketio, db
from ..models import Game, User
from . import rooms


def _start_ticker():
    """Background thread that enforces clock flag-falls."""
    def run():
        while True:
            socketio.sleep(1.0)
            for code, room in list(rooms.all_rooms().items()):
                if room.tick():
                    socketio.emit("state", room.state(), to=code)
                    _persist_game(room)
    socketio.start_background_task(run)


_ticker_started = False
def _ensure_ticker():
    global _ticker_started
    if not _ticker_started:
        _ticker_started = True
        _start_ticker()


@socketio.on("join")
def on_join(data):
    _ensure_ticker()
    code = (data or {}).get("code", "").upper()
    room = rooms.get_room(code)
    if not room:
        emit("error", {"msg": "Room not found"}); return
    if not current_user.is_authenticated:
        emit("error", {"msg": "Login required"}); return

    seat = room.join(request.sid, current_user.username)
    join_room(code)
    # Personal state with seat assignment
    emit("state", {**room.state(), "you": seat}, to=request.sid)
    # Broadcast updated state (player list / online flags) to everyone in room
    emit("state", room.state(), to=code, include_self=False)


@socketio.on("move")
def on_move(data):
    code = (data or {}).get("code", "").upper()
    uci  = (data or {}).get("uci", "")
    room = rooms.get_room(code)
    if not room or not current_user.is_authenticated:
        return
    seat = room.color_of_user(current_user.username)
    if seat in (None, "spectator"):
        emit("error", {"msg": "Spectators can't move"}); return
    turn = "white" if room.board.turn else "black"
    if seat != turn:
        emit("error", {"msg": "Not your turn"}); return
    if not room.apply_move(uci):
        emit("error", {"msg": "Illegal move"}); return

    emit("state", room.state(), to=code)
    if room.over:
        _persist_game(room)


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    for code, room in list(rooms.all_rooms().items()):
        c = room.disconnect(sid)
        if c is not None or sid in room.spectators:
            emit("state", room.state(), to=code)
            leave_room(code)


def _persist_game(room):
    pgn = " ".join(room.pgn_moves)
    for color, username in room.seats.items():
        user = User.query.filter_by(username=username).first()
        if not user:
            continue
        opp_color = "black" if color == "white" else "white"
        opp_name = room.seats.get(opp_color, "Unknown")
        db.session.add(Game(
            user_id=user.id,
            opponent=opp_name,
            mode="multiplayer",
            color=color,
            result=room.result,
            pgn=pgn,
        ))
    db.session.commit()
