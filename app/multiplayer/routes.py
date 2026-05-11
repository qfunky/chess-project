from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from . import rooms

bp = Blueprint("mp", __name__, template_folder="../templates/multiplayer")


def _parse_tc(value):
    if not value or value == "off":
        return None
    try:
        mins, inc = value.split("+")
        return {"initial": int(mins) * 60, "increment": int(inc)}
    except Exception:
        return None


@bp.route("/")
@login_required
def lobby():
    return render_template("multiplayer/lobby.html")


@bp.route("/create", methods=["POST"])
@login_required
def create():
    tc = _parse_tc(request.form.get("time_control"))
    analysis = request.form.get("analysis_allowed") == "on"
    room = rooms.create_room(current_user.username, time_control=tc,
                             analysis_allowed=analysis)
    return redirect(url_for("mp.room", code=room.code))


@bp.route("/join", methods=["POST"])
@login_required
def join():
    code = (request.form.get("code") or "").strip().upper()
    if not code or not rooms.get_room(code):
        flash("Room not found.")
        return redirect(url_for("mp.lobby"))
    return redirect(url_for("mp.room", code=code))


@bp.route("/<code>")
@login_required
def room(code):
    code = code.upper()
    r = rooms.get_room(code)
    if not r:
        abort(404)
    return render_template("multiplayer/room.html", code=code, state=r.state())
