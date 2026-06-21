"""Tests for at-rest secret encryption (C2)."""
import security


def test_encrypt_roundtrip():
    secret = "super-secret-api-key-123"
    token = security.encrypt(secret)
    assert token != secret                # not stored as plaintext
    assert security.decrypt(token) == secret


def test_encrypt_passthrough_empty():
    assert security.encrypt("") == ""
    assert security.encrypt(None) is None
    assert security.decrypt(None) is None


def test_ciphertext_is_not_plaintext_substring():
    secret = "ABCDEF-keymaterial"
    token = security.encrypt(secret)
    assert secret not in token


def test_decrypt_legacy_plaintext_does_not_raise():
    # Legacy/plaintext rows must not hard-fail on read.
    assert security.decrypt("not-a-fernet-token") == "not-a-fernet-token"
