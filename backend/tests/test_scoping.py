"""Per-user data scoping tests (C1b).

Verifies that ownership checks isolate users while the default-user flow
(no token) keeps returning the seeded portfolios unchanged.
"""
import database


def _make_user_with_portfolio(email="other@algotrader.local", password="pw12345"):
    """Insert a second user + a portfolio they own. Returns (user_id, portfolio_id)."""
    import auth
    conn = database.get_db()
    c = conn.cursor()
    c.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)",
              (email, auth.hash_password(password)))
    uid = c.lastrowid
    c.execute("""INSERT INTO portfolios (name, market, initial_balance, current_balance, user_id)
                 VALUES ('Other PF', 'indian', 100000, 100000, ?)""", (uid,))
    pid = c.lastrowid
    conn.commit()
    conn.close()
    return uid, pid


def _token(client, email, password):
    return client.post("/api/auth/login",
                       json={"email": email, "password": password}).json()["access_token"]


def test_default_user_sees_only_their_portfolios(client):
    # Seeded default user owns the 2 seeded portfolios; a second user's PF must not appear.
    _make_user_with_portfolio()
    res = client.get("/api/trading/portfolios")  # no token -> default user
    assert res.status_code == 200
    markets = sorted(p["market"] for p in res.json())
    assert markets == ["crypto", "indian"]  # exactly the 2 seeded, not the other user's


def test_cannot_read_another_users_portfolio(client):
    _, other_pid = _make_user_with_portfolio()
    # Default user (no token) must not be able to read the other user's portfolio.
    res = client.get(f"/api/trading/portfolio/{other_pid}")
    assert res.status_code == 404


def test_cannot_trade_into_another_users_portfolio(client):
    _, other_pid = _make_user_with_portfolio()
    # Ownership is checked before pricing, so this 404s without needing a quote.
    res = client.post("/api/trading/buy", json={
        "portfolio_id": other_pid, "symbol": "RELIANCE.NS", "market": "indian",
        "quantity": 1, "price": 100.0})
    assert res.status_code == 404


def test_owner_can_access_with_token(client):
    uid, other_pid = _make_user_with_portfolio()
    tok = _token(client, "other@algotrader.local", "pw12345")
    res = client.get(f"/api/trading/portfolio/{other_pid}",
                     headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 200
    assert res.json()["id"] == other_pid


def test_seeded_buy_still_works_for_default_user(client, price_feed):
    # Regression: the existing no-token buy flow into a seeded portfolio is unchanged.
    price_feed.set(100.0)
    res = client.post("/api/trading/buy", json={
        "portfolio_id": 1, "symbol": "RELIANCE.NS", "market": "indian",
        "quantity": 1, "price": 100.0})
    assert res.status_code == 200
    assert res.json()["cost"] == 100.0


def test_bots_scoped_to_owner(client):
    _, other_pid = _make_user_with_portfolio()
    # Creating a bot on someone else's portfolio (as default user) is rejected.
    res = client.post("/api/bots", json={
        "portfolio_id": other_pid, "name": "x", "symbol": "RELIANCE.NS",
        "market": "indian", "strategy": "ema_crossover", "quantity": 1})
    assert res.status_code == 404
