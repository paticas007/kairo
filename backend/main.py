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

from datetime import date

try:
    from backend.database import get_connection, create_tables
except ImportError:
    from database import get_connection, create_tables


app = FastAPI(title="KAIRO API", version="1.0.0")

create_tables()


# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), b"kairo_salt", 100000
    ).hex()


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


# ============================================================
# MODELOS
# ============================================================

class TeacherCreate(BaseModel):
    name: str
    surname: str
    email: str
    password: str
    center: str


class StudentCreate(BaseModel):
    name: str
    surname: str
    email: str
    password: str
    course: str
    center: str


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
        INSERT INTO teachers (name, surname, email, password, center)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            data.name.strip(), data.surname.strip(), data.email.lower().strip(),
            hash_password(data.password), data.center.strip()
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
        INSERT INTO students (name, surname, email, password, course, center)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            data.name.strip(), data.surname.strip(), data.email.lower().strip(),
            hash_password(data.password), data.course.strip(), data.center.strip()
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

    plan = []

    for class_item in classes:
        class_id = class_item["id"]
        subject = class_item["subject"]

        tasks = connection.execute(
            """
            SELECT * FROM tasks t
            WHERE t.class_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM task_completions tc
                WHERE tc.task_id = t.id AND tc.student_id = ?
            )
            """,
            (class_id, student_id)
        ).fetchall()

        for task in tasks:
            days_left = calculate_days_left(task["due_date"])
            if days_left <= 14:
                plan.append({
                    "type": "task", "id": task["id"], "title": task["title"],
                    "description": task["description"], "subject": subject,
                    "date": task["due_date"], "days_left": days_left,
                    "priority": task["priority"], "mandatory": bool(task["mandatory"])
                })

        exams = connection.execute(
            "SELECT * FROM exams WHERE class_id = ?", (class_id,)
        ).fetchall()

        for exam in exams:
            days_left = calculate_days_left(exam["exam_date"])
            if 0 <= days_left <= 10:
                plan.append({
                    "type": "exam_preparation", "id": exam["id"],
                    "title": f"Preparar: {exam['title']}", "description": exam["description"],
                    "subject": subject, "date": exam["exam_date"], "days_left": days_left,
                    "priority": exam["importance"], "mandatory": False
                })

        projects = connection.execute(
            "SELECT * FROM projects WHERE class_id = ?", (class_id,)
        ).fetchall()

        for project in projects:
            days_left = calculate_days_left(project["due_date"])
            if days_left <= 21:
                plan.append({
                    "type": "project", "id": project["id"], "title": project["title"],
                    "description": project["description"], "subject": subject,
                    "date": project["due_date"], "days_left": days_left,
                    "priority": project["priority"], "mandatory": True
                })

    connection.close()

    priority_order = {"alta": 0, "high": 0, "media": 1, "medium": 1, "baja": 2, "low": 2}
    plan.sort(key=lambda item: (item["days_left"], priority_order.get(str(item["priority"]).lower(), 1)))

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
