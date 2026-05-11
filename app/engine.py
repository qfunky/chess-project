import threading
from flask import current_app
from stockfish import Stockfish

_lock = threading.Lock()
_play = None
_analyzer = None


def _path():
    return current_app.config["STOCKFISH_PATH"]


def play_engine():
    global _play
    if _play is None:
        _play = Stockfish(path=_path())
    return _play


def analyzer_engine():
    global _analyzer
    if _analyzer is None:
        _analyzer = Stockfish(path=_path())
        _analyzer.set_depth(15)
    return _analyzer


def fresh_engine(depth=12):
    eng = Stockfish(path=_path())
    eng.set_depth(depth)
    return eng


def with_lock(fn):
    def wrapper(*a, **kw):
        with _lock:
            return fn(*a, **kw)
    return wrapper
