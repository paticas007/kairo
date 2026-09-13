# ============================================================
# KAIRO - BASE DE DATOS
# ============================================================

import os
import pathlib

# --------------------------------------------------------
# ¿ESTAMOS EN RENDER (con Turso) O EN TU ORDENADOR (local)?
# --------------------------------------------------------

# Estas dos variables solo existirán si las has configurado
# en Render. En tu ordenador, en local, no existen — así que
# ahí seguirá usando un archivo normal, como hasta ahora.
TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

# Ruta del archivo local (se usa siempre, incluso con Turso,
# como una "copia rápida" que se mantiene sincronizada).
LOCAL_DB_PATH = str(
    pathlib.Path(__file__)
    .resolve()
    .parent
    .parent
    / "kairo.db"
)


def dict_row_factory(cursor, row):
    """
    Convierte cada fila que devuelve la base de datos en un
    diccionario normal de Python (por ejemplo {"id": 1, "name": "Ana"}),
    para poder escribir fila["nombre_columna"] en el resto del código,
    tanto si usamos SQLite normal como si usamos Turso.
    """
    columns = [description[0] for description in cursor.description]
    return dict(zip(columns, row))


# ============================================================
# CONEXIÓN
# ============================================================

if TURSO_URL and TURSO_TOKEN:

    # --------------------------------------------------------
    # MODO TURSO (para cuando esto corre en Render)
    # --------------------------------------------------------

    import libsql

    def get_connection():
        """
        Se conecta a la base de datos de Turso (en internet).
        Cada vez que abrimos una conexión, la sincronizamos
        primero, para asegurarnos de ver siempre los datos
        más recientes, aunque el servidor se haya reiniciado.
        """

        connection = libsql.connect(
            LOCAL_DB_PATH,
            sync_url=TURSO_URL,
            auth_token=TURSO_TOKEN
        )

        connection.sync()

        connection.row_factory = dict_row_factory

        # Turso puede no soportar exactamente este comando;
        # si falla, no pasa nada, simplemente lo ignoramos.
        try:
            connection.execute("PRAGMA foreign_keys = ON")
        except Exception:
            pass

        return connection

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

    cursor = connection.cursor()

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
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

create_tables()
