"""Centralized logging configuration.

Idiomatic Python logging: modules call ``logging.getLogger(__name__)`` and never
configure handlers themselves; this module owns configuration and is invoked once
at app startup (``main.startup_event``).

Behavior vs. the old ``print``/``traceback.print_exc`` calls is preserved — output
still goes to the console — but now with levels, logger names, and timestamps, plus
an opt-in rotating file handler.

Environment:
  LOG_LEVEL  console/file level (default INFO)
  LOG_DIR    if set, also write rotating logs to ``<LOG_DIR>/algotrader.log``
"""
import logging
import os
from logging.handlers import RotatingFileHandler

_CONFIGURED = False

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str | None = None, log_dir: str | None = None) -> None:
    """Configure the root logger once. Safe to call multiple times (idempotent)."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    level_name = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    log_level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(log_level)

    formatter = logging.Formatter(_FORMAT, datefmt=_DATEFMT)

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)

    log_dir = log_dir or os.getenv("LOG_DIR")
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            os.path.join(log_dir, "algotrader.log"),
            maxBytes=5_000_000, backupCount=3, encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

    # Align uvicorn's loggers with our level without hijacking their handlers.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(log_level)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Convenience accessor so callers can avoid importing ``logging`` directly."""
    return logging.getLogger(name)
