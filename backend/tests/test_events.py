"""Tests for the live event bus + WebSocket (M3)."""
import asyncio

from services.events import ConnectionManager


class _FakeWS:
    def __init__(self):
        self.sent = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, msg):
        self.sent.append(msg)


def test_broadcast_delivers_to_connections():
    async def run():
        mgr = ConnectionManager()
        a, b = _FakeWS(), _FakeWS()
        await mgr.connect(a)
        await mgr.connect(b)
        await mgr._broadcast({"type": "portfolio_update", "portfolio_id": 1})
        return a.sent, b.sent
    a_sent, b_sent = asyncio.run(run())
    assert a_sent == b_sent == [{"type": "portfolio_update", "portfolio_id": 1}]


def test_broadcast_drops_dead_socket():
    async def run():
        mgr = ConnectionManager()
        good = _FakeWS()

        class Dead(_FakeWS):
            async def send_json(self, msg):
                raise RuntimeError("closed")

        dead = Dead()
        await mgr.connect(good)
        await mgr.connect(dead)
        await mgr._broadcast({"type": "x"})
        return good.sent, mgr._connections
    good_sent, conns = asyncio.run(run())
    assert good_sent == [{"type": "x"}]
    assert len(conns) == 1            # dead socket pruned


def test_publish_is_noop_without_loop_or_listeners():
    mgr = ConnectionManager()
    # No loop set, no connections -> must not raise.
    mgr.publish("portfolio_update", portfolio_id=1)


def test_ws_endpoint_connects_and_receives(client):
    """End-to-end: a manual buy publishes a portfolio_update the socket receives."""
    with client.websocket_connect("/ws") as ws:
        # Make the server-side fill price deterministic (no network).
        import services.pricing as pricing
        orig = pricing.get_live_price
        pricing.get_live_price = lambda symbol, market: 100.0
        try:
            r = client.post("/api/trading/buy", json={
                "portfolio_id": 1, "symbol": "RELIANCE.NS", "market": "indian", "quantity": 1})
            assert r.status_code == 200
            msg = ws.receive_json()
            assert msg["type"] == "portfolio_update"
            assert msg["portfolio_id"] == 1
        finally:
            pricing.get_live_price = orig
