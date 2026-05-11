from flask import Blueprint, render_template, abort, request, jsonify
from flask_login import login_required, current_user
from ..extensions import db
from ..models import Game

bp = Blueprint("games", __name__, template_folder="../templates/games")


@bp.route("/")
@login_required
def list_games():
    games = current_user.games.order_by(Game.created_at.desc()).all()
    return render_template("games/list.html", games=games)


@bp.route("/<int:game_id>")
@login_required
def review(game_id):
    g = db.session.get(Game, game_id)
    if not g or g.user_id != current_user.id:
        abort(404)
    return render_template("games/review.html", game=g)


@bp.route("/save", methods=["POST"])
@login_required
def save_game():
    data = request.get_json() or {}
    pgn = (data.get("pgn") or "").strip()
    if not pgn:
        return jsonify({"error": "empty pgn"}), 400
    g = Game(
        user_id=current_user.id,
        opponent=data.get("opponent", "Unknown"),
        mode=data.get("mode", "engine"),
        color=data.get("color", "white"),
        result=data.get("result", "*"),
        pgn=pgn,
    )
    db.session.add(g)
    db.session.commit()
    return jsonify({"id": g.id})


@bp.route("/<int:game_id>", methods=["DELETE"])
@login_required
def delete_game(game_id):
    g = db.session.get(Game, game_id)
    if not g or g.user_id != current_user.id:
        abort(404)
    db.session.delete(g)
    db.session.commit()
    return jsonify({"ok": True})
