import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable, List, Optional, Tuple
from contextlib import contextmanager

DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "analyses.db"

SCHEMA_SQL = '''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS analyses (
	id TEXT PRIMARY KEY,
	name TEXT,
	created_at TEXT,
	status TEXT,
	total_comments INTEGER,
	sentiment_counts TEXT,
	sentiment_model TEXT,
	meta TEXT
);
CREATE TABLE IF NOT EXISTS comments (
	id TEXT PRIMARY KEY,
	analysis_id TEXT,
	original_text TEXT,
	cleaned_text TEXT,
	sentiment_label TEXT,
	sentiment_score REAL,
	summary TEXT,
	summary_status TEXT,
	summary_model TEXT,
	created_at TEXT,
	external_file TEXT,
	FOREIGN KEY(analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT,
	level TEXT,
	message TEXT,
	context TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_analysis_id ON comments(analysis_id);
'''


def init_db() -> None:
	DATA_DIR.mkdir(parents=True, exist_ok=True)
	conn = sqlite3.connect(DB_PATH)
	try:
		conn.executescript(SCHEMA_SQL)
		# Add summary_model column if it doesn't exist (migration)
		try:
			conn.execute("ALTER TABLE comments ADD COLUMN summary_model TEXT")
		except sqlite3.OperationalError:
			pass  # Column already exists
		# Add sentiment_model column if it doesn't exist (migration)
		try:
			conn.execute("ALTER TABLE analyses ADD COLUMN sentiment_model TEXT")
		except sqlite3.OperationalError:
			pass  # Column already exists
		conn.commit()
	finally:
		conn.close()


@contextmanager

def get_conn() -> Iterable[sqlite3.Connection]:
	conn = sqlite3.connect(DB_PATH)
	conn.row_factory = sqlite3.Row
	try:
		yield conn
		conn.commit()
	except Exception:
		conn.rollback()
		raise
	finally:
		conn.close()


def execute(query: str, params: Tuple[Any, ...] = ()) -> None:
	with get_conn() as conn:
		conn.execute(query, params)


def executemany(query: str, params_seq: Iterable[Tuple[Any, ...]]) -> None:
	with get_conn() as conn:
		conn.executemany(query, params_seq)


def fetchone(query: str, params: Tuple[Any, ...] = ()) -> Optional[sqlite3.Row]:
	with get_conn() as conn:
		cur = conn.execute(query, params)
		row = cur.fetchone()
		return row


def fetchall(query: str, params: Tuple[Any, ...] = ()) -> List[sqlite3.Row]:
	with get_conn() as conn:
		cur = conn.execute(query, params)
		rows = cur.fetchall()
		return rows
