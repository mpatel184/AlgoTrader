import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "trading.db")

def _db_path() -> str:
    # Resolved per call so tests (and alternate envs) can redirect via TRADING_DB_PATH.
    return os.getenv("TRADING_DB_PATH") or DB_PATH

def get_db():
    conn = sqlite3.connect(_db_path(), timeout=5.0)
    conn.row_factory = sqlite3.Row
    # WAL allows a reader and the single writer to coexist; busy_timeout makes a
    # second writer wait for the lock instead of failing with "database is locked".
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    # H7: enforce declared foreign keys (off by default in SQLite). Must be set
    # per-connection and outside a transaction — done here right after connect.
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def write_transaction(conn):
    """Run a read-modify-write atomically (C5).

    BEGIN IMMEDIATE acquires the write lock up front, so the SELECT-balance ->
    UPDATE-balance sequence in the execution core can't interleave with another
    writer (e.g. the bot scheduler and a manual order racing on the same
    portfolio). Commits on success, rolls back on error.
    """
    started = not conn.in_transaction
    if started:
        conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        if started:
            conn.commit()
    except Exception:
        if started:
            conn.rollback()
        raise

def create_tables():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS portfolios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            market TEXT NOT NULL,
            initial_balance REAL NOT NULL,
            current_balance REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL,
            quantity REAL NOT NULL,
            avg_price REAL NOT NULL,
            current_price REAL DEFAULT 0,
            stop_loss REAL,
            take_profit REAL,
            strategy TEXT,
            opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL,
            trade_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            total_value REAL NOT NULL,
            strategy TEXT,
            status TEXT DEFAULT 'open',
            close_price REAL,
            pnl REAL DEFAULT 0,
            source TEXT DEFAULT 'manual',
            bot_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS portfolio_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            value REAL NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS broker_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            broker TEXT NOT NULL,
            market TEXT NOT NULL,
            api_key TEXT,
            api_secret TEXT,
            client_id TEXT,
            is_active INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL,
            strategy TEXT NOT NULL,
            quantity REAL NOT NULL,
            sl_pct REAL DEFAULT 0.02,
            rr_ratio REAL DEFAULT 2.0,
            interval_seconds INTEGER DEFAULT 60,
            status TEXT DEFAULT 'stopped',
            last_run TIMESTAMP,
            last_signal TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS bot_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            message TEXT,
            price REAL,
            pnl REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bot_id) REFERENCES bots(id)
        );
    """)

    # ── Migrations: add columns to existing tables (CREATE IF NOT EXISTS won't) ──
    c.execute("PRAGMA table_info(trades)")
    trade_cols = {row[1] for row in c.fetchall()}
    if "source" not in trade_cols:
        c.execute("ALTER TABLE trades ADD COLUMN source TEXT DEFAULT 'manual'")
    if "bot_id" not in trade_cols:
        c.execute("ALTER TABLE trades ADD COLUMN bot_id INTEGER")
    if "position_id" not in trade_cols:
        # C4: links a trade to the position it opened/closed, so a close can be
        # matched to its specific entry lots instead of "all open rows for symbol".
        c.execute("ALTER TABLE trades ADD COLUMN position_id INTEGER")

    c.execute("PRAGMA table_info(portfolios)")
    portfolio_cols = {row[1] for row in c.fetchall()}
    if "user_id" not in portfolio_cols:
        c.execute("ALTER TABLE portfolios ADD COLUMN user_id INTEGER")

    # ── Indexes on hot filter columns (H7). After migrations so the migrated
    #    columns (position_id, user_id) exist on upgraded databases too. ──
    c.executescript("""
        CREATE INDEX IF NOT EXISTS idx_portfolios_user      ON portfolios(user_id);
        CREATE INDEX IF NOT EXISTS idx_positions_pf_symbol  ON positions(portfolio_id, symbol);
        CREATE INDEX IF NOT EXISTS idx_trades_pf_status     ON trades(portfolio_id, status);
        CREATE INDEX IF NOT EXISTS idx_trades_position      ON trades(position_id);
        CREATE INDEX IF NOT EXISTS idx_history_pf_time      ON portfolio_history(portfolio_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_bots_pf              ON bots(portfolio_id);
        CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_time    ON bot_logs(bot_id, created_at);
    """)

    # Seed the default user (C1). Owns the seeded portfolios and is the fallback
    # acting user while AUTH_REQUIRED is off. Import locally to avoid a circular
    # import (auth imports database).
    from auth import hash_password, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD
    c.execute("SELECT id FROM users WHERE email = ?", (DEFAULT_USER_EMAIL,))
    row = c.fetchone()
    if row:
        default_user_id = row[0]
    else:
        c.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)",
                  (DEFAULT_USER_EMAIL, hash_password(DEFAULT_USER_PASSWORD)))
        default_user_id = c.lastrowid

    # Seed default portfolios (owned by the default user)
    c.execute("SELECT COUNT(*) FROM portfolios")
    if c.fetchone()[0] == 0:
        c.execute("""INSERT INTO portfolios (name, market, initial_balance, current_balance, user_id)
            VALUES
            ('Indian Market Portfolio', 'indian', 500000, 500000, ?),
            ('Crypto Portfolio', 'crypto', 10000, 10000, ?)""",
                  (default_user_id, default_user_id))
        # Seed initial history
        c.execute("""INSERT INTO portfolio_history (portfolio_id, value) VALUES (1, 500000), (2, 10000)""")

    # Backfill any pre-existing portfolios that predate the user_id column.
    c.execute("UPDATE portfolios SET user_id = ? WHERE user_id IS NULL", (default_user_id,))

    conn.commit()
    conn.close()
