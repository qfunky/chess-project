from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from ..extensions import db
from ..models import User, Friendship

bp = Blueprint("friends", __name__, template_folder="../templates/friends")


@bp.route("/")
@login_required
def list_friends():
    return render_template(
        "friends/list.html",
        friends=current_user.friends(),
        incoming=current_user.incoming_requests(),
        outgoing=current_user.outgoing_requests(),
    )


@bp.route("/request", methods=["POST"])
@login_required
def send_request():
    raw = (request.form.get("username") or "").strip().lstrip("@")
    if not raw:
        flash("Enter a username.")
        return redirect(url_for("friends.list_friends"))
    target = User.query.filter_by(username=raw).first()
    if not target:
        flash(f"No user named @{raw}.")
        return redirect(url_for("friends.list_friends"))
    if target.id == current_user.id:
        flash("You can't add yourself.")
        return redirect(url_for("friends.list_friends"))
    rel = current_user.relation_with(target)
    if rel in ("friends", "outgoing"):
        flash("Already connected." if rel == "friends" else "Request already sent.")
        return redirect(url_for("friends.list_friends"))
    if rel == "incoming":
        # auto-accept: shortcut when the other side already invited
        f = Friendship.query.filter_by(requester_id=target.id, addressee_id=current_user.id).first()
        f.status = "accepted"
        db.session.commit()
        flash(f"You and @{target.username} are now friends.")
        return redirect(url_for("friends.list_friends"))
    db.session.add(Friendship(requester_id=current_user.id, addressee_id=target.id, status="pending"))
    db.session.commit()
    flash(f"Friend request sent to @{target.username}.")
    return redirect(url_for("friends.list_friends"))


def _owned(fid):
    f = db.session.get(Friendship, fid)
    if not f or current_user.id not in (f.requester_id, f.addressee_id):
        abort(404)
    return f


@bp.route("/<int:fid>/accept", methods=["POST"])
@login_required
def accept(fid):
    f = _owned(fid)
    if f.addressee_id != current_user.id or f.status != "pending":
        abort(400)
    f.status = "accepted"
    db.session.commit()
    return redirect(url_for("friends.list_friends"))


@bp.route("/<int:fid>/decline", methods=["POST"])
@login_required
def decline(fid):
    f = _owned(fid)
    if f.status != "pending":
        abort(400)
    db.session.delete(f)
    db.session.commit()
    return redirect(url_for("friends.list_friends"))


@bp.route("/<int:fid>/remove", methods=["POST"])
@login_required
def remove(fid):
    f = _owned(fid)
    db.session.delete(f)
    db.session.commit()
    return redirect(url_for("friends.list_friends"))
