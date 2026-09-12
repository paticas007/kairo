# ============================================================
# KAIRO - BASE DE DATOS
# ============================================================

import sqlite3
import pathlib

# --------------------------------------------------------
# RUTA DE LA BASE DE DATOS
# --------------------------------------------------------

# __file__ es "dónde está este archivo database.py".
# .parent es la carpeta que lo contiene (backend/).
# .parent.parent sube un nivel más (kairo/).
# Así, kairo.db SIEMPRE se crea en kairo/kairo.db,
# arranques el programa desde donde lo arranques.
DATABASE_NAME = str(
    pathlib.Path(__file__)
    .resolve()
    .parent
    .parent
    / "kairo.db"
)


# ============================================================
# CONEXIÓN
# ============================================================

def get_connection():
    """
    Crea una conexión con la base de datos KAIRO.

    row_factory permite acceder a las columnas por nombre.
    """

    connection = sqlite3.connect(
        DATABASE_NAME,
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