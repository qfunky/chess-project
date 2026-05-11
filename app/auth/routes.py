from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from ..extensions import db
from ..models import User

bp = Blueprint("auth", __name__, template_folder="../templates/auth")


@bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        if len(username) < 3 or len(password) < 4:
            flash("Username ≥ 3 chars, password ≥ 4 chars.")
            return render_template("auth/register.html")
        if User.query.filter_by(username=username).first():
            flash("Username already taken.")
            return render_template("auth/register.html")
        u = User(username=username)
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        login_user(u)
        return redirect(url_for("main.index"))
    return render_template("auth/register.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        u = User.query.filter_by(username=username).first()
        if not u or not u.check_password(password):
            flash("Invalid credentials.")
            return render_template("auth/login.html")
        login_user(u, remember=True)
        return redirect(request.args.get("next") or url_for("main.index"))
    return render_template("auth/login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("main.index"))
