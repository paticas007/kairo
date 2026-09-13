# ============================================================
# KAIRO - BASE DE DATOS
# ============================================================

import os
import pathlib

# --------------------------------------------------------
# ¿ESTAMOS EN RENDER (con Turso) O EN TU ORDENADOR (local)?
# --------------------------------------------------------

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
    """
    Convierte una fila (una tupla simple) en un diccionario
    normal de Python, usando los nombres de columna que trae
    la consulta. Así podemos escribir fila["nombre_columna"]
    tanto si venimos de SQLite normal como de Turso.
    """
    columns = [description[0] for description in cursor_description]
    return dict(zip(columns, row))


# ============================================================
# CONEXIÓN
# ============================================================

if TURSO_URL and TURSO_TOKEN:

    # --------------------------------------------------------
    # MODO TURSO (para cuando esto corre en Render)
    # --------------------------------------------------------

    import libsql

    class DictCursorWrapper:
        """
        Envuelve un cursor de Turso para que, al pedir los
        resultados, nos los devuelva como diccionarios en vez
        de tuplas sueltas — sin necesitar la propiedad
        'row_factory' que Turso no tiene.
        """

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
        """
        Envuelve la conexión de Turso entera, para que se use
        exactamente igual que una conexión normal de SQLite
        desde el resto del código (main.py no se entera de
        que por dentro es distinto).
        """

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
        """
        Se conecta a la base de datos de Turso (en internet).
        La sincronizamos primero, para ver siempre los datos
        más recientes, aunque el servidor se haya reiniciado.
        """

        raw_connection = libsql.connect(
            LOCAL_DB_PATH,
            sync_url=TURSO_URL,
            auth_token=TURSO_TOKEN
        )

        raw_connection.sync()

        try:
            raw_connection.execute("PRAGMA foreign_keys = ON")
        except Exception:
            pass

        return DictConnectionWrapper(raw_connection)

else:

    # --------------------------------------------------------
    # MODO LOCAL (para cuando lo pruebas en tu ordenador)
    # --------------------------------------------------------

    import sqlite3

    def get_connection():
        """
        Se conecta al archivo kairo.db normal, como hasta ahora.
        """

        connection = sqlite3.connect(
            LOCAL_DB_PATH,
            timeout=10
        )

        connection.row_factory = sqlite3.Row

        connection.execute("PRAGMA foreign_keys = ON")

        return connection


# ============================================================
# CREAR TABLAS
# ============================================================

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
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_date TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'media',
            mandatory INTEGER NOT NULL DEFAULT 1,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE
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
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            exam_date TEXT NOT NULL,
            importance TEXT NOT NULL DEFAULT 'media',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_date TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'media',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE
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

    connection.execute("""
        CREATE TABLE IF NOT EXISTS evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL UNIQUE,
            exams REAL DEFAULT 0,
            tasks REAL DEFAULT 0,
            notebook REAL DEFAULT 0,
            projects REAL DEFAULT 0,
            participation REAL DEFAULT 0,
            FOREIGN KEY (class_id)
                REFERENCES classes(id)
                ON DELETE CASCADE
        )
    """)

    connection.commit()
    connection.close()


create_tables()
