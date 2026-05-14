from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from ..extensions import db
from ..models import User, GameInvite
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


def _live_invites(invites):
    """Drop invites whose rooms no longer exist."""
    return [i for i in invites if rooms.get_room(i.room_code)]


@bp.route("/")
@login_required
def lobby():
    incoming = _live_invites(
        GameInvite.query.filter_by(to_user_id=current_user.id)
                        .order_by(GameInvite.created_at.desc()).all()
    )
    outgoing = _live_invites(
        GameInvite.query.filter_by(from_user_id=current_user.id)
                        .order_by(GameInvite.created_at.desc()).all()
    )
    friends = [u for u, _ in current_user.friends()]
    return render_template(
        "multiplayer/lobby.html",
        incoming=incoming, outgoing=outgoing, friends=friends,
    )


@bp.route("/create", methods=["POST"])
@login_required
def create():
    tc = _parse_tc(request.form.get("time_control"))
    analysis = request.form.get("analysis_allowed") == "on"
    room = rooms.create_room(current_user.username, time_control=tc,
                             analysis_allowed=analysis)
    return redirect(url_for("mp.room", code=room.code))


@bp.route("/invite", methods=["POST"])
@login_required
def invite():
    username = (request.form.get("username") or "").strip().lstrip("@")
    target = User.query.filter_by(username=username).first()
    if not target or target.id == current_user.id:
        flash("Friend not found.")
        return redirect(url_for("mp.lobby"))

    rel = current_user.relation_with(target)
    if rel != "friends":
        flash("You can only invite friends.")
        return redirect(url_for("mp.lobby"))

    tc_raw = request.form.get("time_control") or "5+0"
    tc = _parse_tc(tc_raw)
    analysis = request.form.get("analysis_allowed") != "off"

    room = rooms.create_room(current_user.username, time_control=tc,
                             analysis_allowed=analysis)
    db.session.add(GameInvite(
        from_user_id=current_user.id, to_user_id=target.id,
        room_code=room.code, time_control=tc_raw, analysis_allowed=analysis,
    ))
    db.session.commit()
    flash(f"Invite sent to @{target.username}.")
    return redirect(url_for("mp.room", code=room.code))


@bp.route("/invite/<int:iid>/accept", methods=["POST"])
@login_required
def accept_invite(iid):
    inv = db.session.get(GameInvite, iid)
    if not inv or inv.to_user_id != current_user.id:
        abort(404)
    code = inv.room_code
    db.session.delete(inv)
    db.session.commit()
    return redirect(url_for("mp.room", code=code))


@bp.route("/invite/<int:iid>/decline", methods=["POST"])
@login_required
def decline_invite(iid):
    inv = db.session.get(GameInvite, iid)
    if not inv or current_user.id not in (inv.to_user_id, inv.from_user_id):
        abort(404)
    db.session.delete(inv)
    db.session.commit()
    return redirect(url_for("mp.lobby"))


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
