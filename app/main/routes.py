from flask import Blueprint, render_template

bp = Blueprint("main", __name__, template_folder="../templates/main")


@bp.route("/")
def index():
    return render_template("main/index.html")


@bp.route("/play")
def play():
    return render_template("main/play.html")
