"""Tests for the auth seam (C1). The `client` fixture lives in conftest.py."""


def test_password_hash_roundtrip():
    import auth
    h = auth.hash_password("hunter2")
    assert h != "hunter2"
    assert auth.verify_password("hunter2", h)
    assert not auth.verify_password("wrong", h)


def test_login_with_default_user(client):
    import auth
    res = client.post("/api/auth/login", json={
        "email": auth.DEFAULT_USER_EMAIL, "password": auth.DEFAULT_USER_PASSWORD})
    assert res.status_code == 200
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == auth.DEFAULT_USER_EMAIL


def test_login_bad_password(client):
    import auth
    res = client.post("/api/auth/login", json={
        "email": auth.DEFAULT_USER_EMAIL, "password": "nope"})
    assert res.status_code == 401


def test_me_without_token_resolves_default_user(client):
    """AUTH_REQUIRED off → no token still works (preserves current no-login UX)."""
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    import auth
    assert res.json()["email"] == auth.DEFAULT_USER_EMAIL


def test_me_with_token(client):
    import auth
    login = client.post("/api/auth/login", json={
        "email": auth.DEFAULT_USER_EMAIL, "password": auth.DEFAULT_USER_PASSWORD}).json()
    res = client.get("/api/auth/me",
                     headers={"Authorization": f"Bearer {login['access_token']}"})
    assert res.status_code == 200
    assert res.json()["email"] == auth.DEFAULT_USER_EMAIL


def test_auth_required_rejects_missing_token(client, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_existing_endpoints_still_open_without_token(client):
    """Sanity: a pre-existing endpoint keeps working with no auth header."""
    res = client.get("/health")
    assert res.status_code == 200


def test_migration_backfills_legacy_portfolios(tmp_path, monkeypatch):
    """Upgrade path: a pre-C1 DB (no users table, no portfolios.user_id) must
    migrate cleanly and backfill ownership to the seeded default user."""
    import sqlite3
    db_file = tmp_path / "legacy.db"
    # Simulate the old schema + a seeded portfolio with no user_id.
    conn = sqlite3.connect(db_file)
    conn.executescript("""
        CREATE TABLE portfolios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, market TEXT,
            initial_balance REAL, current_balance REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO portfolios (name, market, initial_balance, current_balance)
            VALUES ('Legacy', 'indian', 500000, 500000);
    """)
    conn.commit()
    conn.close()

    monkeypatch.setenv("TRADING_DB_PATH", str(db_file))
    import database
    database.create_tables()  # should add users + user_id and backfill

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    cols = {r[1] for r in conn.execute("PRAGMA table_info(portfolios)")}
    assert "user_id" in cols
    legacy = conn.execute("SELECT user_id FROM portfolios WHERE name = 'Legacy'").fetchone()
    default_user = conn.execute("SELECT id FROM users").fetchone()
    assert legacy["user_id"] == default_user["id"]  # ownership backfilled
    conn.close()
