# ============================================================
# KAIRO - BASE DE DATOS
# ============================================================

import os
import pathlib
import time

TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

LOCAL_DB_PATH = str(
    pathlib.Path(__file__)
    .resolve()
    .parent
    .parent
    / "kairo.db"
)


def dict_row_factory(cursor_description, row):
    columns = [description[0] for description in cursor_description]
    return dict(zip(columns, row))


if TURSO_URL and TURSO_TOKEN:

    import libsql

    # --------------------------------------------------------
    # Solo sincronizamos con internet como máximo una vez
    # cada 5 segundos, en vez de en cada conexión. Los datos
    # que se escriben siempre van directos a Turso igualmente
    # (esto solo afecta a la rapidez de las lecturas).
    # --------------------------------------------------------

    _last_sync_time = 0
    _SYNC_INTERVAL_SECONDS = 5

    def _maybe_sync(raw_connection):
        global _last_sync_time
        now = time.time()
        if now - _last_sync_time > _SYNC_INTERVAL_SECONDS:
            raw_connection.sync()
            _last_sync_time = now

    class DictCursorWrapper:

        def __init__(self, raw_cursor):
            self._raw = raw_cursor

        def execute(self, sql, params=None):
            if params is None:
                self._raw.execute(sql)
            else:
                self._raw.execute(sql, params)
            return self

        def fetchone(self):
            row = self._raw.fetchone()
            if row is None:
                return None
            return dict_row_factory(self._raw.description, row)

        def fetchall(self):
            rows = self._raw.fetchall()
            return [
                dict_row_factory(self._raw.description, row)
                for row in rows
            ]

        @property
        def lastrowid(self):
            return self._raw.lastrowid

    class DictConnectionWrapper:

        def __init__(self, raw_connection):
            self._raw = raw_connection

        def execute(self, sql, params=None):
            if params is None:
                raw_cursor = self._raw.execute(sql)
            else:
                raw_cursor = self._raw.execute(sql, params)
            return DictCursorWrapper(raw_cursor)

        def commit(self):
            self._raw.commit()

        def close(self):
            self._raw.close()

    def get_connection():

        raw_connection = libsql.connect(
            LOCAL_DB_PATH,
            sync_url=TURSO_URL,
            auth_token=TURSO_TOKEN
        )

        _maybe_sync(raw_connection)

        try:
            raw_connection.execute("PRAGMA foreign_keys = ON")
        except Exception:
            pass

        return DictConnectionWrapper(raw_connection)

else:

    import sqlite3

    def get_connection():

        connection = sqlite3.connect(
            LOCAL_DB_PATH,
            timeout=10
        )

        connection.row_factory = sqlite3.Row

        connection.execute("PRAGMA foreign_keys = ON")

        return connection


def create_tables():

    connection = get_connection()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            surname TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            center TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            surname TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            course TEXT NOT NULL,
            center TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            course TEXT NOT NULL,
            group_name TEXT NOT NULL,
            subject TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id)
                REFERENCES teachers(id)
                ON DELETE CASCADE
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS class_students (
            class_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (class_id, student_id),
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE,
            FOREIGN KEY (student_id)
                REFERENCES students(id)
                ON DELETE CASCADE
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS evaluation_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            percentage REAL NOT NULL,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_date TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'media',
            mandatory INTEGER NOT NULL DEFAULT 1,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE,
            FOREIGN KEY (category_id)
                REFERENCES evaluation_categories(id)
                ON DELETE SET NULL
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS task_completions (
            task_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (task_id, student_id),
            FOREIGN KEY (task_id)
                REFERENCES tasks(id)
                ON DELETE CASCADE,
            FOREIGN KEY (student_id)
                REFERENCES students(id)
                ON DELETE CASCADE
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            exam_date TEXT NOT NULL,
            importance TEXT NOT NULL DEFAULT 'media',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE,
            FOREIGN KEY (category_id)
                REFERENCES evaluation_categories(id)
                ON DELETE SET NULL
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_date TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'media',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE,
            FOREIGN KEY (category_id)
                REFERENCES evaluation_categories(id)
                ON DELETE SET NULL
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --------------------------------------------------------
    # "PARCHES" PARA TABLAS QUE YA EXISTÍAN DE ANTES
    # --------------------------------------------------------

    # Si la tabla ya existía sin la columna category_id (como
    # es tu caso ahora mismo), la añadimos aquí. Si ya la
    # tiene, esto fallará silenciosamente y no pasa nada.

    for table_name in ["tasks", "exams", "projects"]:
        try:
            connection.execute(
                f"ALTER TABLE {table_name} ADD COLUMN category_id INTEGER"
            )
        except Exception:
            pass

    connection.commit()
    connection.close()


create_tables()
