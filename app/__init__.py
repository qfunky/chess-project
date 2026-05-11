import os
from pathlib import Path
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
from .config import Config
from .extensions import db, login_manager, socketio


def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_class)

    # Honor X-Forwarded-* headers from reverse proxy (Caddy / nginx).
    # x_prefix=1 reads X-Forwarded-Prefix so url_for() generates correct URLs
    # when the app is mounted under a sub-path (e.g. /chess).
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1, x_prefix=1, x_for=1)

    # Ensure data dir exists for SQLite
    data_dir = Path(app.root_path).parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    login_manager.init_app(app)

    if app.config.get("REDIS_URL"):
        socketio.init_app(app, message_queue=app.config["REDIS_URL"])
    else:
        socketio.init_app(app)

    from .models import User  # noqa: F401  (registers tables)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    # Blueprints
    from .main.routes      import bp as main_bp
    from .auth.routes      import bp as auth_bp
    from .games.routes     import bp as games_bp
    from .multiplayer.routes import bp as mp_bp
    from .api.routes       import bp as api_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp,  url_prefix="/auth")
    app.register_blueprint(games_bp, url_prefix="/games")
    app.register_blueprint(mp_bp,    url_prefix="/multiplayer")
    app.register_blueprint(api_bp,   url_prefix="/api")

    # SocketIO event handlers (registers on import)
    from .multiplayer import events  # noqa: F401

    with app.app_context():
        db.create_all()

    return app
