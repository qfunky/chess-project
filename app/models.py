from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import or_, and_
from .extensions import db


class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Profile fields
    display_name = db.Column(db.String(64))
    bio          = db.Column(db.String(240))
    country      = db.Column(db.String(48))
    title        = db.Column(db.String(8))
    rating       = db.Column(db.Integer, default=1200)

    games = db.relationship("Game", backref="user", lazy="dynamic",
                            foreign_keys="Game.user_id", cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # ----- Friend helpers -----
    def friends(self):
        """List of (User, friendship_id) tuples — id lets templates wire the remove form."""
        rows = Friendship.query.filter(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == self.id, Friendship.addressee_id == self.id),
        ).all()
        out = []
        for f in rows:
            other = f.addressee if f.requester_id == self.id else f.requester
            out.append((other, f.id))
        return out

    def incoming_requests(self):
        return Friendship.query.filter_by(addressee_id=self.id, status="pending").all()

    def outgoing_requests(self):
        return Friendship.query.filter_by(requester_id=self.id, status="pending").all()

    def relation_with(self, other: "User"):
        """'self'|'friends'|'incoming'|'outgoing'|None"""
        if other is None: return None
        if other.id == self.id: return "self"
        f = Friendship.query.filter(or_(
            and_(Friendship.requester_id == self.id, Friendship.addressee_id == other.id),
            and_(Friendship.requester_id == other.id, Friendship.addressee_id == self.id),
        )).first()
        if not f: return None
        if f.status == "accepted": return "friends"
        if f.requester_id == self.id: return "outgoing"
        return "incoming"

    def stats(self):
        wins = losses = draws = 0
        for g in self.games:
            if g.result in ("1-0", "0-1"):
                won = (g.result == "1-0" and g.color == "white") or \
                      (g.result == "0-1" and g.color == "black")
                if won: wins += 1
                else:   losses += 1
            elif g.result == "1/2-1/2":
                draws += 1
        total = wins + losses + draws
        return {
            "games": total,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "win_rate": round(100 * wins / total) if total else 0,
        }


class Game(db.Model):
    __tablename__ = "games"
    id = db.Column(db.Integer, primary_key=True)
    user_id  = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    opponent = db.Column(db.String(128))
    mode     = db.Column(db.String(32))
    color    = db.Column(db.String(8))
    result   = db.Column(db.String(16))
    pgn      = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class Friendship(db.Model):
    __tablename__ = "friendships"
    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    status       = db.Column(db.String(16), default="pending", nullable=False)  # pending | accepted
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    requester = db.relationship("User", foreign_keys=[requester_id])
    addressee = db.relationship("User", foreign_keys=[addressee_id])

    __table_args__ = (db.UniqueConstraint("requester_id", "addressee_id", name="_friendship_uc"),)
