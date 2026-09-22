# ============================================================
# KAIRO - BACKEND
# ============================================================

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

import hashlib
import secrets
import pathlib
import math
import os

from datetime import date, datetime

try:
    from backend.database import get_connection, create_tables
except ImportError:
    from database import get_connection, create_tables


app = FastAPI(title="KAIRO API", version="1.0.0")

create_tables()


# ============================================================
# CONSTANTES
# ============================================================

DEFAULT_CATEGORY_WEIGHT = 10.0
MAX_PLAN_WINDOW_HOURS = 24 * 30
URGENCIA_MAXIMA = 1000.0
VENTANA_CRITICA_HORAS = 48.0
CONSTANTE_EXPONENCIAL = 8.0
ADMIN_RESET_SECRET = os.environ.get("ADMIN_RESET_SECRET", "cambia-esto")
MAX_FILE_BASE64_CHARS = 6_000_000


# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), b"kairo_salt", 100000
    ).hex()


def normalize_answer(answer: str) -> str:
    return answer.strip().lower()


def generate_token() -> str:
    return secrets.token_urlsafe(48)


def generate_class_code() -> str:
    characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(characters) for _ in range(5))
        connection = get_connection()
        existing = connection.execute(
            "SELECT id FROM classes WHERE code = ?", (code,)
        ).fetchone()
        connection.close()
        if existing is None:
            return code


def calculate_days_left(target_date: str) -> int:
    try:
        target = date.fromisoformat(target_date)
        today = date.today()
        return (target - today).days
    except ValueError:
        return 9999


def calculate_hours_left(target_date_str: str) -> float:
    try:
        if len(target_date_str) == 10:
            target = datetime.fromisoformat(target_date_str + "T23:59:00")
        else:
            target = datetime.fromisoformat(target_date_str)
    except ValueError:
        return 999999.0

    now = datetime.now()
    delta = target - now
    return delta.total_seconds() / 3600


def calculate_priority_score(category_weight: float, hours_left: float) -> float:
    if hours_left <= 0:
        factor_urgencia = URGENCIA_MAXIMA
    elif hours_left < VENTANA_CRITICA_HORAS:
        factor_urgencia = math.exp(
            (VENTANA_CRITICA_HORAS - hours_left) / CONSTANTE_EXPONENCIAL
        )
    else:
        factor_urgencia = VENTANA_CRITICA_HORAS / hours_left

    return category_weight * factor_urgencia


def priority_label(hours_left: float) -> str:
    if hours_left < VENTANA_CRITICA_HORAS:
        return "alta"
    elif hours_left < 24 * 7:
        return "media"
    else:
        return "baja"


def prioritize_activities(activities: list[dict]) -> list[dict]:
    result = []

    for activity in activities:
        score = calculate_priority_score(
            activity["category_weight"],
            activity["hours_left"]
        )
        activity_with_score = dict(activity)
        activity_with_score["priority_score"] = score
        result.append(activity_with_score)

    result.sort(key=lambda item: item["priority_score"], reverse=True)

    return result


# ============================================================
# MODELOS
# ============================================================

class TeacherCreate(BaseModel):
    name: str
    surname: str
    email: str
    password: str
    center: str
    security_question: str
    security_answer: str


class StudentCreate(BaseModel):
    name: str
    surname: str
    email: str
    password: str
    course: str
    center: str
    security_question: str
    security_answer: str


class LoginData(BaseModel):
    email: str
    password: str
    role: str


class ClassCreate(BaseModel):
    teacher_id: int
    course: str
    group_name: str
    subject: str


class JoinClass(BaseModel):
    student_id: int
    code: str


class TaskCreate(BaseModel):
    class_id: int
    category_id: int | None = None
    title: str
    description: str = ""
    due_date: str
    priority: str = "media"
    mandatory: bool = True


class ExamCreate(BaseModel):
    class_id: int
    category_id: int | None = None
    title: str
    description: str = ""
    exam_date: str
    importance: str = "media"


class ProjectCreate(BaseModel):
    class_id: int
    category_id: int | None = None
    title: str
    description: str = ""
    due_date: str
    priority: str = "media"


class EvaluationCategoryItem(BaseModel):
    name: str
    percentage: float


class EvaluationCategoriesData(BaseModel):
    categories: list[EvaluationCategoryItem]


class TaskCompletionData(BaseModel):
    student_id: int


class PasswordRecoveryQuestionRequest(BaseModel):
    email: str
    role: str


class PasswordRecoveryResetRequest(BaseModel):
    email: str
    role: str
    answer: str
    new_password: str


class AdminSecretRequest(BaseModel):
    secret: str


class TaskFileSubmission(BaseModel):
    student_id: int
    file_name: str
    file_type: str
    file_data: str


class GradeSubmission(BaseModel):
    activity_type: str
    activity_id: int
    student_id: int
    grade: float


# ============================================================
# MODO EDITOR
# ============================================================

@app.post("/api/admin/login")
def admin_login(data: AdminSecretRequest):
    if data.secret != ADMIN_RESET_SECRET:
        raise HTTPException(status_code=403, detail="Clave incorrecta.")
    return {"ok": True}


@app.post("/api/admin/reset-database")
def reset_database(data: AdminSecretRequest):

    if data.secret != ADMIN_RESET_SECRET:
        raise HTTPException(status_code=403, detail="Clave incorrecta.")

    connection = get_connection()

    tables_in_order = [
        "task_submissions",
        "grades",
        "task_completions",
        "tasks",
        "exams",
        "projects",
        "evaluation_categories",
        "class_students",
        "sessions",
        "classes",
        "students",
        "teachers",
    ]

    for table_name in tables_in_order:
        try:
            connection.execute(f"DELETE FROM {table_name}")
        except Exception:
            pass

    connection.commit()
    connection.close()

    return {"message": "Base de datos reiniciada correctamente. Todas las cuentas y datos han sido borrados."}


# ============================================================
# PROFESORES
# ============================================================

@app.post("/api/teachers")
def create_teacher(data: TeacherCreate):
    connection = get_connection()
    existing = connection.execute(
        "SELECT id FROM teachers WHERE email = ?", (data.email.lower().strip(),)
    ).fetchone()
    if existing:
        connection.close()
        raise HTTPException(status_code=400, detail="Ese correo ya está registrado.")

    cursor = connection.execute(
        """
        INSERT INTO teachers
        (name, surname, email, password, center, security_question, security_answer)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.name.strip(), data.surname.strip(), data.email.lower().strip(),
            hash_password(data.password), data.center.strip(),
            data.security_question, hash_password(normalize_answer(data.security_answer))
        )
    )
    connection.commit()
    teacher_id = cursor.lastrowid
    connection.close()
    return {"message": "Profesor registrado correctamente.", "id": teacher_id}


# ============================================================
# ALUMNOS
# ============================================================

@app.post("/api/students")
def create_student(data: StudentCreate):
    connection = get_connection()
    existing = connection.execute(
        "SELECT id FROM students WHERE email = ?", (data.email.lower().strip(),)
    ).fetchone()
    if existing:
        connection.close()
        raise HTTPException(status_code=400, detail="Ese correo ya está registrado.")

    cursor = connection.execute(
        """
        INSERT INTO students
        (name, surname, email, password, course, center, security_question, security_answer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.name.strip(), data.surname.strip(), data.email.lower().strip(),
            hash_password(data.password), data.course.strip(), data.center.strip(),
            data.security_question, hash_password(normalize_answer(data.security_answer))
        )
    )
    connection.commit()
    student_id = cursor.lastrowid
    connection.close()
    return {"message": "Alumno registrado correctamente.", "id": student_id}


# ============================================================
# LOGIN
# ============================================================

@app.post("/api/login")
def login(data: LoginData):
    role = data.role.lower().strip()
    if role not in ["teacher", "student"]:
        raise HTTPException(status_code=400, detail="Rol no válido.")

    connection = get_connection()
    table = "teachers" if role == "teacher" else "students"

    user = connection.execute(
        f"SELECT * FROM {table} WHERE email = ?", (data.email.lower().strip(),)
    ).fetchone()

    if not user:
        connection.close()
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")

    if user["password"] != hash_password(data.password):
        connection.close()
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")

    token = generate_token()
    connection.execute(
        "INSERT INTO sessions (token, role, user_id) VALUES (?, ?, ?)",
        (token, role, user["id"])
    )
    connection.commit()
    connection.close()
    return {"token": token, "role": role}


# ============================================================
# RECUPERACIÓN DE CONTRASEÑA
# ============================================================

@app.post("/api/password-recovery/question")
def get_security_question(data: PasswordRecoveryQuestionRequest):
    role = data.role.lower().strip()
    if role not in ["teacher", "student"]:
        raise HTTPException(status_code=400, detail="Rol no válido.")

    connection = get_connection()
    table = "teachers" if role == "teacher" else "students"

    user = connection.execute(
        f"SELECT security_question FROM {table} WHERE email = ?",
        (data.email.lower().strip(),)
    ).fetchone()

    connection.close()

    if not user or not user["security_question"]:
        raise HTTPException(
            status_code=404,
            detail="No se encontró esa cuenta, o no tiene pregunta de seguridad configurada."
        )

    return {"question": user["security_question"]}


@app.post("/api/password-recovery/reset")
def reset_password(data: PasswordRecoveryResetRequest):
    role = data.role.lower().strip()
    if role not in ["teacher", "student"]:
        raise HTTPException(status_code=400, detail="Rol no válido.")

    connection = get_connection()
    table = "teachers" if role == "teacher" else "students"

    user = connection.execute(
        f"SELECT * FROM {table} WHERE email = ?", (data.email.lower().strip(),)
    ).fetchone()

    if not user:
        connection.close()
        raise HTTPException(status_code=404, detail="No se encontró esa cuenta.")

    if user["security_answer"] != hash_password(normalize_answer(data.answer)):
        connection.close()
        raise HTTPException(status_code=401, detail="La respuesta no es correcta.")

    connection.execute(
        f"UPDATE {table} SET password = ? WHERE id = ?",
        (hash_password(data.new_password), user["id"])
    )
    connection.commit()
    connection.close()

    return {"message": "Contraseña actualizada correctamente."}


# ============================================================
# RESTAURAR SESIÓN
# ============================================================

@app.get("/api/auth/me/{token}")
def get_current_user(token: str):
    connection = get_connection()
    session = connection.execute(
        "SELECT * FROM sessions WHERE token = ?", (token,)
    ).fetchone()

    if not session:
        connection.close()
        raise HTTPException(status_code=401, detail="Sesión no válida.")

    table = "teachers" if session["role"] == "teacher" else "students"
    user = connection.execute(
        f"SELECT * FROM {table} WHERE id = ?", (session["user_id"],)
    ).fetchone()
    connection.close()

    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado.")

    user_data = dict(user)
    user_data.pop("password", None)
    user_data.pop("security_answer", None)
    return {"role": session["role"], "user": user_data}


# ============================================================
# LOGOUT
# ============================================================

@app.delete("/api/auth/logout/{token}")
def logout(token: str):
    connection = get_connection()
    connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
    connection.commit()
    connection.close()
    return {"message": "Sesión cerrada."}


# ============================================================
# CREAR CLASE
# ============================================================

@app.post("/api/classes")
def create_class(data: ClassCreate):
    connection = get_connection()
    teacher = connection.execute(
        "SELECT id FROM teachers WHERE id = ?", (data.teacher_id,)
    ).fetchone()

    if not teacher:
        connection.close()
        raise HTTPException(status_code=404, detail="Profesor no encontrado.")

    code = generate_class_code()
    cursor = connection.execute(
        """
        INSERT INTO classes (teacher_id, course, group_name, subject, code)
        VALUES (?, ?, ?, ?, ?)
        """,
        (data.teacher_id, data.course.strip(), data.group_name.strip(), data.subject.strip(), code)
    )
    connection.commit()
    class_id = cursor.lastrowid
    connection.close()
    return {"message": "Clase creada correctamente.", "id": class_id, "code": code}


# ============================================================
# BORRAR CLASE
# ============================================================

@app.delete("/api/classes/{class_id}")
def delete_class(class_id: int, teacher_id: int):
    connection = get_connection()
    class_item = connection.execute(
        "SELECT * FROM classes WHERE id = ?", (class_id,)
    ).fetchone()

    if not class_item:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    if class_item["teacher_id"] != teacher_id:
        connection.close()
        raise HTTPException(status_code=403, detail="No tienes permiso para borrar esta clase.")

    connection.execute("DELETE FROM classes WHERE id = ?", (class_id,))
    connection.commit()
    connection.close()
    return {"message": "Clase eliminada correctamente."}


# ============================================================
# CLASES DEL PROFESOR
# ============================================================

@app.get("/api/teachers/{teacher_id}/classes")
def get_teacher_classes(teacher_id: int):
    connection = get_connection()
    classes = connection.execute(
        """
        SELECT id, teacher_id, course, group_name, subject, code
        FROM classes WHERE teacher_id = ?
        ORDER BY course, group_name, subject
        """,
        (teacher_id,)
    ).fetchall()
    connection.close()
    return [dict(row) for row in classes]


# ============================================================
# CATEGORÍAS DE EVALUACIÓN
# ============================================================

@app.post("/api/classes/{class_id}/evaluation-categories")
def save_evaluation_categories(class_id: int, data: EvaluationCategoriesData):

    total = sum(category.percentage for category in data.categories)

    if abs(total - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Los porcentajes deben sumar exactamente 100% (ahora mismo suman {total}%)."
        )

    connection = get_connection()

    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    connection.execute(
        "DELETE FROM evaluation_categories WHERE class_id = ?", (class_id,)
    )

    for category in data.categories:
        connection.execute(
            "INSERT INTO evaluation_categories (class_id, name, percentage) VALUES (?, ?, ?)",
            (class_id, category.name.strip(), category.percentage)
        )

    connection.commit()
    connection.close()

    return {"message": "Categorías de evaluación guardadas correctamente."}


@app.get("/api/classes/{class_id}/evaluation-categories")
def get_evaluation_categories(class_id: int):
    connection = get_connection()

    categories = connection.execute(
        "SELECT * FROM evaluation_categories WHERE class_id = ? ORDER BY id",
        (class_id,)
    ).fetchall()

    connection.close()

    return [dict(row) for row in categories]


# ============================================================
# COMPAÑEROS Y PROFESOR DE UNA CLASE   <-- NUEVO
# ============================================================

@app.get("/api/classes/{class_id}/roster")
def get_class_roster(class_id: int):
    connection = get_connection()

    class_item = connection.execute(
        """
        SELECT classes.id, classes.course, classes.group_name, classes.subject, classes.code,
               teachers.name AS teacher_name, teachers.surname AS teacher_surname
        FROM classes
        INNER JOIN teachers ON classes.teacher_id = teachers.id
        WHERE classes.id = ?
        """,
        (class_id,)
    ).fetchone()

    if not class_item:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    students = connection.execute(
        """
        SELECT s.id, s.name, s.surname
        FROM class_students cs
        INNER JOIN students s ON s.id = cs.student_id
        WHERE cs.class_id = ?
        ORDER BY s.surname, s.name
        """,
        (class_id,)
    ).fetchall()

    connection.close()

    return {
        "class": {
            "id": class_item["id"],
            "course": class_item["course"],
            "group_name": class_item["group_name"],
            "subject": class_item["subject"],
            "code": class_item["code"]
        },
        "teacher": {
            "name": class_item["teacher_name"],
            "surname": class_item["teacher_surname"]
        },
        "students": [dict(s) for s in students]
    }


# ============================================================
# VISTA DE UNA CLASE PARA UN ALUMNO   <-- NUEVO
# ============================================================

@app.get("/api/classes/{class_id}/student-view")
def get_class_student_view(class_id: int, student_id: int):
    connection = get_connection()

    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    tasks = connection.execute(
        """
        SELECT tasks.*, evaluation_categories.name AS category_name,
               CASE WHEN task_completions.student_id IS NOT NULL THEN 1 ELSE 0 END AS completed,
               CASE WHEN task_submissions.student_id IS NOT NULL THEN 1 ELSE 0 END AS has_submission
        FROM tasks
        LEFT JOIN evaluation_categories ON tasks.category_id = evaluation_categories.id
        LEFT JOIN task_completions
            ON task_completions.task_id = tasks.id AND task_completions.student_id = ?
        LEFT JOIN task_submissions
            ON task_submissions.task_id = tasks.id AND task_submissions.student_id = ?
        WHERE tasks.class_id = ?
        ORDER BY tasks.due_date
        """,
        (student_id, student_id, class_id)
    ).fetchall()

    exams = connection.execute(
        """
        SELECT exams.*, evaluation_categories.name AS category_name
        FROM exams
        LEFT JOIN evaluation_categories ON exams.category_id = evaluation_categories.id
        WHERE exams.class_id = ?
        ORDER BY exams.exam_date
        """,
        (class_id,)
    ).fetchall()

    projects = connection.execute(
        """
        SELECT projects.*, evaluation_categories.name AS category_name
        FROM projects
        LEFT JOIN evaluation_categories ON projects.category_id = evaluation_categories.id
        WHERE projects.class_id = ?
        ORDER BY projects.due_date
        """,
        (class_id,)
    ).fetchall()

    connection.close()

    return {
        "tasks": [dict(t) for t in tasks],
        "exams": [dict(e) for e in exams],
        "projects": [dict(p) for p in projects]
    }


# ============================================================
# UNIR ALUMNO A CLASE
# ============================================================

@app.post("/api/classes/join")
def join_class(data: JoinClass):
    connection = get_connection()
    class_item = connection.execute(
        "SELECT * FROM classes WHERE code = ?", (data.code.upper().strip(),)
    ).fetchone()

    if not class_item:
        connection.close()
        raise HTTPException(status_code=404, detail="No existe ninguna clase con ese código.")

    student = connection.execute(
        "SELECT id FROM students WHERE id = ?", (data.student_id,)
    ).fetchone()

    if not student:
        connection.close()
        raise HTTPException(status_code=404, detail="Alumno no encontrado.")

    already_joined = connection.execute(
        "SELECT * FROM class_students WHERE class_id = ? AND student_id = ?",
        (class_item["id"], data.student_id)
    ).fetchone()

    if already_joined:
        connection.close()
        raise HTTPException(status_code=400, detail="Ya perteneces a esta clase.")

    connection.execute(
        "INSERT INTO class_students (class_id, student_id) VALUES (?, ?)",
        (class_item["id"], data.student_id)
    )
    connection.commit()
    connection.close()
    return {"message": "Te has unido correctamente a la clase."}


# ============================================================
# CLASES DEL ALUMNO
# ============================================================

@app.get("/api/students/{student_id}/classes")
def get_student_classes(student_id: int):
    connection = get_connection()
    classes = connection.execute(
        """
        SELECT c.id, c.course, c.group_name, c.subject, c.code,
               t.name AS teacher_name, t.surname AS teacher_surname
        FROM classes c
        INNER JOIN class_students cs ON c.id = cs.class_id
        INNER JOIN teachers t ON c.teacher_id = t.id
        WHERE cs.student_id = ?
        ORDER BY c.course, c.group_name, c.subject
        """,
        (student_id,)
    ).fetchall()
    connection.close()
    return [dict(row) for row in classes]


# ============================================================
# TAREAS
# ============================================================

@app.post("/api/tasks")
def create_task(data: TaskCreate):
    connection = get_connection()
    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (data.class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    cursor = connection.execute(
        """
        INSERT INTO tasks (class_id, category_id, title, description, due_date, priority, mandatory)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.class_id, data.category_id, data.title.strip(), data.description.strip(),
            data.due_date, data.priority, 1 if data.mandatory else 0
        )
    )
    connection.commit()
    task_id = cursor.lastrowid
    connection.close()
    return {"message": "Tarea creada correctamente.", "id": task_id}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, teacher_id: int):
    connection = get_connection()
    task = connection.execute(
        """
        SELECT tasks.id, classes.teacher_id
        FROM tasks INNER JOIN classes ON tasks.class_id = classes.id
        WHERE tasks.id = ?
        """,
        (task_id,)
    ).fetchone()

    if not task:
        connection.close()
        raise HTTPException(status_code=404, detail="La tarea no existe.")

    if task["teacher_id"] != teacher_id:
        connection.close()
        raise HTTPException(status_code=403, detail="No tienes permiso para borrar esta tarea.")

    connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    connection.commit()
    connection.close()
    return {"message": "Tarea eliminada correctamente."}


@app.post("/api/tasks/{task_id}/complete")
def complete_task(task_id: int, data: TaskCompletionData):
    connection = get_connection()
    task_exists = connection.execute(
        "SELECT id FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()

    if not task_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La tarea no existe.")

    connection.execute(
        "INSERT OR IGNORE INTO task_completions (task_id, student_id) VALUES (?, ?)",
        (task_id, data.student_id)
    )
    connection.commit()
    connection.close()
    return {"message": "Tarea marcada como completada."}


@app.get("/api/classes/{class_id}/tasks/{task_id}/progress")
def get_task_progress(class_id: int, task_id: int):
    connection = get_connection()
    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    task_exists = connection.execute(
        "SELECT id FROM tasks WHERE id = ? AND class_id = ?", (task_id, class_id)
    ).fetchone()

    if not task_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="Esa tarea no pertenece a esta clase.")

    students = connection.execute(
        """
        SELECT s.id, s.name, s.surname,
               CASE WHEN tc.student_id IS NOT NULL THEN 1 ELSE 0 END AS completed
        FROM class_students cs
        INNER JOIN students s ON s.id = cs.student_id
        LEFT JOIN task_completions tc ON tc.task_id = ? AND tc.student_id = s.id
        WHERE cs.class_id = ?
        ORDER BY s.surname, s.name
        """,
        (task_id, class_id)
    ).fetchall()
    connection.close()
    return [dict(row) for row in students]


# ============================================================
# ENTREGA DE ARCHIVOS
# ============================================================

@app.post("/api/tasks/{task_id}/submit")
def submit_task_file(task_id: int, data: TaskFileSubmission):

    if len(data.file_data) > MAX_FILE_BASE64_CHARS:
        raise HTTPException(
            status_code=400,
            detail="El archivo es demasiado grande. El máximo son unos 4 MB."
        )

    connection = get_connection()

    task_exists = connection.execute(
        "SELECT id FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()

    if not task_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La tarea no existe.")

    connection.execute(
        """
        INSERT INTO task_submissions (task_id, student_id, file_name, file_type, file_data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id, student_id) DO UPDATE SET
            file_name = excluded.file_name,
            file_type = excluded.file_type,
            file_data = excluded.file_data,
            submitted_at = CURRENT_TIMESTAMP
        """,
        (task_id, data.student_id, data.file_name, data.file_type, data.file_data)
    )

    connection.execute(
        "INSERT OR IGNORE INTO task_completions (task_id, student_id) VALUES (?, ?)",
        (task_id, data.student_id)
    )

    connection.commit()
    connection.close()

    return {"message": "Archivo entregado correctamente."}


@app.get("/api/tasks/{task_id}/submissions/{student_id}/file")
def get_submission_file(task_id: int, student_id: int):
    connection = get_connection()

    submission = connection.execute(
        "SELECT * FROM task_submissions WHERE task_id = ? AND student_id = ?",
        (task_id, student_id)
    ).fetchone()

    connection.close()

    if not submission:
        raise HTTPException(status_code=404, detail="No hay ningún archivo entregado.")

    return {
        "file_name": submission["file_name"],
        "file_type": submission["file_type"],
        "file_data": submission["file_data"]
    }


# ============================================================
# NOTAS
# ============================================================

@app.post("/api/grades")
def set_grade(data: GradeSubmission):

    if data.activity_type not in ["task", "exam", "project"]:
        raise HTTPException(status_code=400, detail="Tipo de actividad no válido.")

    if data.grade < 0 or data.grade > 10:
        raise HTTPException(status_code=400, detail="La nota debe estar entre 0 y 10.")

    connection = get_connection()

    connection.execute(
        """
        INSERT INTO grades (activity_type, activity_id, student_id, grade)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(activity_type, activity_id, student_id) DO UPDATE SET
            grade = excluded.grade,
            graded_at = CURRENT_TIMESTAMP
        """,
        (data.activity_type, data.activity_id, data.student_id, data.grade)
    )

    connection.commit()
    connection.close()

    return {"message": "Nota guardada correctamente."}


@app.get("/api/classes/{class_id}/gradebook")
def get_gradebook(class_id: int):

    connection = get_connection()

    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    students = connection.execute(
        """
        SELECT s.id, s.name, s.surname
        FROM class_students cs
        INNER JOIN students s ON s.id = cs.student_id
        WHERE cs.class_id = ?
        ORDER BY s.surname, s.name
        """,
        (class_id,)
    ).fetchall()

    tasks = connection.execute(
        "SELECT id, title, category_id FROM tasks WHERE class_id = ? ORDER BY due_date",
        (class_id,)
    ).fetchall()

    exams = connection.execute(
        "SELECT id, title, category_id FROM exams WHERE class_id = ? ORDER BY exam_date",
        (class_id,)
    ).fetchall()

    projects = connection.execute(
        "SELECT id, title, category_id FROM projects WHERE class_id = ? ORDER BY due_date",
        (class_id,)
    ).fetchall()

    activities = []
    activities.extend({"type": "task", **dict(t)} for t in tasks)
    activities.extend({"type": "exam", **dict(e)} for e in exams)
    activities.extend({"type": "project", **dict(p)} for p in projects)

    grades_map = {}

    for activity_type, id_list in [
        ("task", [t["id"] for t in tasks]),
        ("exam", [e["id"] for e in exams]),
        ("project", [p["id"] for p in projects]),
    ]:
        if not id_list:
            continue
        placeholders = ",".join("?" * len(id_list))
        rows = connection.execute(
            f"SELECT activity_id, student_id, grade FROM grades "
            f"WHERE activity_type = ? AND activity_id IN ({placeholders})",
            (activity_type, *id_list)
        ).fetchall()
        for row in rows:
            key = f"{activity_type}-{row['activity_id']}-{row['student_id']}"
            grades_map[key] = row["grade"]

    submissions_map = set()
    if tasks:
        task_ids = [t["id"] for t in tasks]
        placeholders = ",".join("?" * len(task_ids))
        rows = connection.execute(
            f"SELECT task_id, student_id FROM task_submissions WHERE task_id IN ({placeholders})",
            tuple(task_ids)
        ).fetchall()
        for row in rows:
            submissions_map.add(f"{row['task_id']}-{row['student_id']}")

    connection.close()

    rows_out = []
    for student in students:
        grades = {}
        for activity in activities:
            column_key = f"{activity['type']}-{activity['id']}"
            grade_key = f"{activity['type']}-{activity['id']}-{student['id']}"
            has_file = (
                activity["type"] == "task"
                and f"{activity['id']}-{student['id']}" in submissions_map
            )
            grades[column_key] = {
                "grade": grades_map.get(grade_key),
                "has_file": has_file
            }
        rows_out.append({
            "student_id": student["id"],
            "name": student["name"],
            "surname": student["surname"],
            "grades": grades
        })

    return {"activities": activities, "students": rows_out}


@app.get("/api/students/{student_id}/grades")
def get_student_grades(student_id: int):

    connection = get_connection()

    classes = connection.execute(
        """
        SELECT c.id, c.course, c.group_name, c.subject
        FROM classes c
        INNER JOIN class_students cs ON c.id = cs.class_id
        WHERE cs.student_id = ?
        """,
        (student_id,)
    ).fetchall()

    result = []

    for class_item in classes:
        class_id = class_item["id"]

        categories = connection.execute(
            "SELECT id, name, percentage FROM evaluation_categories WHERE class_id = ?",
            (class_id,)
        ).fetchall()

        category_data = []

        for category in categories:
            category_id = category["id"]
            activity_grades = []

            for activity_type, table in [("task", "tasks"), ("exam", "exams"), ("project", "projects")]:
                items = connection.execute(
                    f"SELECT id, title FROM {table} WHERE class_id = ? AND category_id = ?",
                    (class_id, category_id)
                ).fetchall()

                for item in items:
                    grade_row = connection.execute(
                        "SELECT grade FROM grades WHERE activity_type = ? AND activity_id = ? AND student_id = ?",
                        (activity_type, item["id"], student_id)
                    ).fetchone()

                    activity_grades.append({
                        "title": item["title"],
                        "type": activity_type,
                        "grade": grade_row["grade"] if grade_row else None
                    })

            graded_values = [a["grade"] for a in activity_grades if a["grade"] is not None]
            category_average = sum(graded_values) / len(graded_values) if graded_values else None

            category_data.append({
                "name": category["name"],
                "percentage": category["percentage"],
                "activities": activity_grades,
                "average": category_average
            })

        graded_categories = [c for c in category_data if c["average"] is not None]
        weight_sum = sum(c["percentage"] for c in graded_categories)

        if graded_categories and weight_sum > 0:
            current_average = sum(c["average"] * c["percentage"] for c in graded_categories) / weight_sum
        else:
            current_average = None

        if current_average is not None and category_data:
            projected_average = sum(
                (c["average"] if c["average"] is not None else current_average) * c["percentage"]
                for c in category_data
            ) / 100
        else:
            projected_average = None

        result.append({
            "class_id": class_id,
            "course": class_item["course"],
            "group_name": class_item["group_name"],
            "subject": class_item["subject"],
            "categories": category_data,
            "current_average": current_average,
            "projected_average": projected_average
        })

    connection.close()

    return result


# ============================================================
# EXÁMENES
# ============================================================

@app.post("/api/exams")
def create_exam(data: ExamCreate):
    connection = get_connection()
    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (data.class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    cursor = connection.execute(
        """
        INSERT INTO exams (class_id, category_id, title, description, exam_date, importance)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (data.class_id, data.category_id, data.title.strip(), data.description.strip(), data.exam_date, data.importance)
    )
    connection.commit()
    exam_id = cursor.lastrowid
    connection.close()
    return {"message": "Examen creado correctamente.", "id": exam_id}


@app.delete("/api/exams/{exam_id}")
def delete_exam(exam_id: int, teacher_id: int):
    connection = get_connection()
    exam = connection.execute(
        """
        SELECT exams.id, classes.teacher_id
        FROM exams INNER JOIN classes ON exams.class_id = classes.id
        WHERE exams.id = ?
        """,
        (exam_id,)
    ).fetchone()

    if not exam:
        connection.close()
        raise HTTPException(status_code=404, detail="El examen no existe.")

    if exam["teacher_id"] != teacher_id:
        connection.close()
        raise HTTPException(status_code=403, detail="No tienes permiso para borrar este examen.")

    connection.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
    connection.commit()
    connection.close()
    return {"message": "Examen eliminado correctamente."}


# ============================================================
# PROYECTOS
# ============================================================

@app.post("/api/projects")
def create_project(data: ProjectCreate):
    connection = get_connection()
    class_exists = connection.execute(
        "SELECT id FROM classes WHERE id = ?", (data.class_id,)
    ).fetchone()

    if not class_exists:
        connection.close()
        raise HTTPException(status_code=404, detail="La clase no existe.")

    cursor = connection.execute(
        """
        INSERT INTO projects (class_id, category_id, title, description, due_date, priority)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (data.class_id, data.category_id, data.title.strip(), data.description.strip(), data.due_date, data.priority)
    )
    connection.commit()
    project_id = cursor.lastrowid
    connection.close()
    return {"message": "Proyecto creado correctamente.", "id": project_id}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, teacher_id: int):
    connection = get_connection()
    project = connection.execute(
        """
        SELECT projects.id, classes.teacher_id
        FROM projects INNER JOIN classes ON projects.class_id = classes.id
        WHERE projects.id = ?
        """,
        (project_id,)
    ).fetchone()

    if not project:
        connection.close()
        raise HTTPException(status_code=404, detail="El proyecto no existe.")

    if project["teacher_id"] != teacher_id:
        connection.close()
        raise HTTPException(status_code=403, detail="No tienes permiso para borrar este proyecto.")

    connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    connection.commit()
    connection.close()
    return {"message": "Proyecto eliminado correctamente."}


# ============================================================
# LISTAS POR CLASE
# ============================================================

@app.get("/api/classes/{class_id}/tasks")
def get_class_tasks(class_id: int):
    connection = get_connection()
    tasks = connection.execute(
        "SELECT * FROM tasks WHERE class_id = ? ORDER BY due_date ASC", (class_id,)
    ).fetchall()
    connection.close()
    return [dict(row) for row in tasks]


@app.get("/api/classes/{class_id}/exams")
def get_class_exams(class_id: int):
    connection = get_connection()
    exams = connection.execute(
        "SELECT * FROM exams WHERE class_id = ? ORDER BY exam_date ASC", (class_id,)
    ).fetchall()
    connection.close()
    return [dict(row) for row in exams]


@app.get("/api/classes/{class_id}/projects")
def get_class_projects(class_id: int):
    connection = get_connection()
    projects = connection.execute(
        "SELECT * FROM projects WHERE class_id = ? ORDER BY due_date ASC", (class_id,)
    ).fetchall()
    connection.close()
    return [dict(row) for row in projects]


# ============================================================
# ACTIVIDADES DEL PROFESOR
# ============================================================

@app.get("/api/teachers/{teacher_id}/activities")
def get_teacher_activities(teacher_id: int):
    connection = get_connection()

    tasks = connection.execute(
        """
        SELECT 'task' AS type, tasks.id, tasks.title, tasks.description,
               tasks.due_date AS activity_date, tasks.priority, tasks.mandatory,
               classes.course, classes.group_name, classes.subject,
               evaluation_categories.name AS category_name
        FROM tasks
        INNER JOIN classes ON tasks.class_id = classes.id
        LEFT JOIN evaluation_categories ON tasks.category_id = evaluation_categories.id
        WHERE classes.teacher_id = ?
        """,
        (teacher_id,)
    ).fetchall()

    exams = connection.execute(
        """
        SELECT 'exam' AS type, exams.id, exams.title, exams.description,
               exams.exam_date AS activity_date, exams.importance AS priority, 1 AS mandatory,
               classes.course, classes.group_name, classes.subject,
               evaluation_categories.name AS category_name
        FROM exams
        INNER JOIN classes ON exams.class_id = classes.id
        LEFT JOIN evaluation_categories ON exams.category_id = evaluation_categories.id
        WHERE classes.teacher_id = ?
        """,
        (teacher_id,)
    ).fetchall()

    projects = connection.execute(
        """
        SELECT 'project' AS type, projects.id, projects.title, projects.description,
               projects.due_date AS activity_date, projects.priority, 1 AS mandatory,
               classes.course, classes.group_name, classes.subject,
               evaluation_categories.name AS category_name
        FROM projects
        INNER JOIN classes ON projects.class_id = classes.id
        LEFT JOIN evaluation_categories ON projects.category_id = evaluation_categories.id
        WHERE classes.teacher_id = ?
        """,
        (teacher_id,)
    ).fetchall()

    connection.close()

    activities = []
    activities.extend(dict(row) for row in tasks)
    activities.extend(dict(row) for row in exams)
    activities.extend(dict(row) for row in projects)
    activities.sort(key=lambda item: item["activity_date"])

    return activities


# ============================================================
# PLAN DIARIO
# ============================================================

@app.get("/api/students/{student_id}/plan")
def get_student_plan(student_id: int):
    connection = get_connection()

    classes = connection.execute(
        """
        SELECT c.id, c.subject FROM classes c
        INNER JOIN class_students cs ON c.id = cs.class_id
        WHERE cs.student_id = ?
        """,
        (student_id,)
    ).fetchall()

    raw_activities = []

    for class_item in classes:
        class_id = class_item["id"]
        subject = class_item["subject"]

        tasks = connection.execute(
            """
            SELECT t.*, ec.percentage AS category_weight
            FROM tasks t
            LEFT JOIN evaluation_categories ec ON t.category_id = ec.id
            WHERE t.class_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM task_completions tc
                WHERE tc.task_id = t.id AND tc.student_id = ?
            )
            """,
            (class_id, student_id)
        ).fetchall()

        for task in tasks:
            hours_left = calculate_hours_left(task["due_date"])
            if hours_left > MAX_PLAN_WINDOW_HOURS:
                continue

            weight = task["category_weight"]
            if weight is None:
                weight = DEFAULT_CATEGORY_WEIGHT

            raw_activities.append({
                "type": "task", "id": task["id"], "title": task["title"],
                "description": task["description"], "subject": subject,
                "date": task["due_date"], "days_left": calculate_days_left(task["due_date"]),
                "hours_left": hours_left, "category_weight": weight,
                "priority": priority_label(hours_left),
                "mandatory": bool(task["mandatory"])
            })

        exams = connection.execute(
            """
            SELECT e.*, ec.percentage AS category_weight
            FROM exams e
            LEFT JOIN evaluation_categories ec ON e.category_id = ec.id
            WHERE e.class_id = ?
            """,
            (class_id,)
        ).fetchall()

        for exam in exams:
            hours_left = calculate_hours_left(exam["exam_date"])
            if hours_left > MAX_PLAN_WINDOW_HOURS:
                continue

            weight = exam["category_weight"]
            if weight is None:
                weight = DEFAULT_CATEGORY_WEIGHT

            raw_activities.append({
                "type": "exam_preparation", "id": exam["id"],
                "title": f"Preparar: {exam['title']}", "description": exam["description"],
                "subject": subject, "date": exam["exam_date"],
                "days_left": calculate_days_left(exam["exam_date"]),
                "hours_left": hours_left, "category_weight": weight,
                "priority": priority_label(hours_left),
                "mandatory": False
            })

        projects = connection.execute(
            """
            SELECT p.*, ec.percentage AS category_weight
            FROM projects p
            LEFT JOIN evaluation_categories ec ON p.category_id = ec.id
            WHERE p.class_id = ?
            """,
            (class_id,)
        ).fetchall()

        for project in projects:
            hours_left = calculate_hours_left(project["due_date"])
            if hours_left > MAX_PLAN_WINDOW_HOURS:
                continue

            weight = project["category_weight"]
            if weight is None:
                weight = DEFAULT_CATEGORY_WEIGHT

            raw_activities.append({
                "type": "project", "id": project["id"], "title": project["title"],
                "description": project["description"], "subject": subject,
                "date": project["due_date"], "days_left": calculate_days_left(project["due_date"]),
                "hours_left": hours_left, "category_weight": weight,
                "priority": priority_label(hours_left),
                "mandatory": True
            })

    connection.close()

    plan = prioritize_activities(raw_activities)

    return {"plan": plan}


# ============================================================
# SERVIR FRONTEND
# ============================================================

BASE_DIR = pathlib.Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def serve_frontend():
    return FileResponse(str(FRONTEND_DIR / "index.html"))
