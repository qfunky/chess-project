from flask import Blueprint, request, jsonify, current_app
from stockfish import Stockfish
from ..engine import play_engine, analyzer_engine, fresh_engine, _lock

bp = Blueprint("api", __name__)


@bp.route("/analyze", methods=["POST"])
def analyze_position():
    data = request.get_json() or {}
    fen = data.get("fen")
    skill = int(data.get("skill_level", 10))
    with _lock:
        eng = play_engine()
        eng.update_engine_parameters({"Skill Level": skill})
        eng.set_fen_position(fen)
        best = eng.get_best_move()
        evaluation = eng.get_evaluation()
    return jsonify({"move": best, "analysis": evaluation})


@bp.route("/hint", methods=["POST"])
def hint():
    data = request.get_json() or {}
    fen = data.get("fen")
    with _lock:
        eng = analyzer_engine()
        eng.set_fen_position(fen)
        best = eng.get_best_move()
        evaluation = eng.get_evaluation()
        top = eng.get_top_moves(3)
    return jsonify({"move": best, "analysis": evaluation, "top_moves": top})


@bp.route("/review", methods=["POST"])
def review():
    data = request.get_json() or {}
    fens = data.get("fens", [])
    eng = fresh_engine(depth=12)
    results = []
    for fen in fens:
        eng.set_fen_position(fen)
        results.append({"best": eng.get_best_move(), "eval": eng.get_evaluation()})
    return jsonify({"positions": results})
