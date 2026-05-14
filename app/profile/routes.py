from flask import Blueprint, render_template, request, redirect, url_for, abort, flash
from flask_login import login_required, current_user
from ..extensions import db
from ..models import User, Game

bp = Blueprint("profile", __name__, template_folder="../templates/profile")


@bp.route("/")
@login_required
def me():
    return redirect(url_for("profile.view", username=current_user.username))


@bp.route("/<username>")
@login_required
def view(username):
    u = User.query.filter_by(username=username).first()
    if not u:
        abort(404)
    games = u.games.order_by(Game.created_at.desc()).limit(8).all()
    relation = current_user.relation_with(u)
    return render_template(
        "profile/view.html",
        u=u, games=games, stats=u.stats(), relation=relation,
    )


@bp.route("/edit", methods=["GET", "POST"])
@login_required
def edit():
    if request.method == "POST":
        u = current_user
        new_username = (request.form.get("username") or "").strip().lower()
        if new_username and new_username != u.username:
            taken = User.query.filter(User.username == new_username, User.id != u.id).first()
            if taken:
                flash("That username is taken.")
                return render_template("profile/edit.html", u=u)
            u.username = new_username
        u.display_name = (request.form.get("display_name") or "").strip()[:64]
        u.bio          = (request.form.get("bio") or "").strip()[:240]
        u.country      = (request.form.get("country") or "").strip()[:48]
        u.title        = (request.form.get("title") or "").strip()[:8]
        db.session.commit()
        flash("Profile updated.")
        return redirect(url_for("profile.me"))
    return render_template("profile/edit.html", u=current_user)
