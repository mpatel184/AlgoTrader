"""Tests for DB hardening (H7): indexes + foreign-key enforcement."""
import database


def test_expected_indexes_exist(temp_db):
    conn = database.get_db()
    names = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index'")}
    conn.close()
    for idx in ("idx_portfolios_user", "idx_positions_pf_symbol",
                "idx_trades_pf_status", "idx_trades_position",
                "idx_history_pf_time", "idx_bots_pf", "idx_bot_logs_bot_time"):
        assert idx in names, idx


def test_foreign_keys_enforced(temp_db):
    conn = database.get_db()
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    conn.close()


def test_fk_blocks_orphan_bot_log(temp_db):
    """Inserting a bot_log for a non-existent bot must be rejected now that FKs
    are enforced (bot_logs.bot_id -> bots.id)."""
    import sqlite3
    conn = database.get_db()
    try:
        raised = False
        try:
            conn.execute("INSERT INTO bot_logs (bot_id, action) VALUES (999999, 'X')")
            conn.commit()
        except sqlite3.IntegrityError:
            raised = True
        assert raised
    finally:
        conn.close()
