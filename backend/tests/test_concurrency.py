"""Concurrency test for atomic balance updates (C5).

Two writers race to buy into the same portfolio that only has enough cash for
one order. With BEGIN IMMEDIATE + busy_timeout, the second writer waits for the
first to commit, re-reads the (now-zero) balance, and is correctly rejected —
so the portfolio can never be overspent.
"""
import threading

import database
from services import execution


def test_racing_buys_cannot_overspend(temp_db):
    # Leave exactly enough for ONE order of 10 @ 100 = 1000.
    conn = database.get_db()
    conn.execute("UPDATE portfolios SET current_balance = 1000 WHERE id = 1")
    conn.commit()
    conn.close()

    results = []
    barrier = threading.Barrier(2)

    def attempt():
        barrier.wait()  # maximize the chance both hit the lock together
        c = database.get_db()
        try:
            with database.write_transaction(c):
                execution.execute_buy(
                    c, portfolio_id=1, symbol="RELIANCE.NS", market="indian",
                    quantity=10, price=100.0)
            results.append("ok")
        except execution.InsufficientFunds:
            results.append("rejected")
        finally:
            c.close()

    threads = [threading.Thread(target=attempt) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == ["ok", "rejected"]   # exactly one succeeded

    conn = database.get_db()
    bal = conn.execute("SELECT current_balance FROM portfolios WHERE id = 1").fetchone()[0]
    conn.close()
    assert bal == 0      # never negative; not double-spent
