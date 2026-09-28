import hashlib
import hmac
import secrets
import time

from app.db import connect

ITERATIONS = 600_000
SESSION_SECONDS = 8 * 60 * 60


def pin_hash(pin, salt=None):
    salt = salt or secrets.token_hex(16)
    value = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f"{salt}:{value}"


def configure_pin(path, pin=None):
    """Return a generated PIN once; keep only its salted hash on disk."""
    with connect(path) as db:
        row = db.execute("SELECT value FROM settings WHERE key='teacher_pin'").fetchone()
        if pin is not None and (not pin.isascii() or not pin.isdigit() or not 6 <= len(pin) <= 12):
            raise ValueError("CARD_APP_TEACHER_PIN must contain 6–12 digits.")
        if row and pin is None:
            return None
        generated = None
        if pin is None:
            pin = generated = f"{secrets.randbelow(100_000_000):08d}"
        if row and hmac.compare_digest(pin_hash(pin, row[0].split(":")[0]), row[0]):
            return None
        db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('teacher_pin',?)", (pin_hash(pin),))
        db.execute("DELETE FROM teacher_sessions")
        return generated


def verify_pin(path, pin):
    with connect(path) as db:
        stored = db.execute("SELECT value FROM settings WHERE key='teacher_pin'").fetchone()[0]
    return hmac.compare_digest(pin_hash(pin, stored.split(":")[0]), stored)


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(path):
    token = secrets.token_urlsafe(32)
    with connect(path) as db:
        db.execute("DELETE FROM teacher_sessions WHERE expires_at<=?", (int(time.time()),))
        db.execute("INSERT INTO teacher_sessions VALUES(?,?)", (digest(token), int(time.time()) + SESSION_SECONDS))
    return token


def authenticated(path, token):
    if not token or len(token) > 100:
        return False
    with connect(path) as db:
        return db.execute("SELECT 1 FROM teacher_sessions WHERE token_hash=? AND expires_at>?",
                          (digest(token), int(time.time()))).fetchone() is not None
