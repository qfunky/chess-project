from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from .extensions import db


class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    games = db.relationship("Game", backref="user", lazy="dynamic",
                            foreign_keys="Game.user_id", cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Game(db.Model):
    __tablename__ = "games"
    id = db.Column(db.Integer, primary_key=True)
    user_id  = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    opponent = db.Column(db.String(128))                 # "Stockfish 12" / opponent's username
    mode     = db.Column(db.String(32))                  # engine | friend | multiplayer
    color    = db.Column(db.String(8))                   # white | black
    result   = db.Column(db.String(16))                  # 1-0 | 0-1 | 1/2-1/2 | *
    pgn      = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
