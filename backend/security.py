"""Symmetric encryption for secrets at rest (C2).

Broker API keys/secrets must never be stored in plaintext (the SQLite file is a
single-file exfiltration target). This module wraps Fernet (AES-128-CBC + HMAC)
with a single app key.

Key resolution order:
  1. ``BROKER_SECRET_KEY`` env var (REQUIRED in production) — a urlsafe base64
     32-byte Fernet key.
  2. Dev fallback: a key auto-generated once and persisted to ``backend/.secret_key``
     (gitignored). A warning is logged so this is never silently relied on in prod.

Rotating the key invalidates previously stored ciphertext; with zero or few broker
rows that is acceptable today. A versioned/multi-key scheme can come later if needed.
"""
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_KEY_FILE = os.path.join(os.path.dirname(__file__), ".secret_key")
_fernet: Fernet | None = None


def _load_or_create_key() -> bytes:
    env_key = os.getenv("BROKER_SECRET_KEY")
    if env_key:
        return env_key.encode()

    # Dev fallback — persist a generated key so restarts can still decrypt.
    if os.path.exists(_KEY_FILE):
        with open(_KEY_FILE, "rb") as fh:
            return fh.read().strip()

    key = Fernet.generate_key()
    with open(_KEY_FILE, "wb") as fh:
        fh.write(key)
    logger.warning(
        "BROKER_SECRET_KEY not set; generated a development key at %s. "
        "Set BROKER_SECRET_KEY in the environment for production.", _KEY_FILE,
    )
    return key


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())
    return _fernet


def dev_secret_material() -> str:
    """Persisted dev key material, reusable by other modules (e.g. JWT signing)
    as a fallback when their own env secret is unset. Production should set the
    relevant env var instead of relying on this."""
    return _load_or_create_key().decode()


def encrypt(plaintext: str | None) -> str | None:
    """Encrypt a secret for storage. Passes through None/empty unchanged."""
    if not plaintext:
        return plaintext
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str | None) -> str | None:
    """Decrypt a stored secret. Returns the input unchanged if it is not valid
    ciphertext (e.g. a legacy plaintext row), so reads never hard-fail."""
    if not token:
        return token
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        logger.warning("Stored secret is not decryptable with the current key "
                       "(legacy plaintext or rotated key); returning as-is.")
        return token
