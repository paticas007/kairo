// ============================================================
// KAIRO - FRONTEND
// ============================================================

let selectedRole = null;
let currentUser = null;
let currentToken = localStorage.getItem("kairo_token");
let teacherClasses = [];
let teacherActivitiesCache = [];
let studentPlanCache = [];
let categoryRowCounter = 0;

document.addEventListener("DOMContentLoaded", function () {
  initializeKairo();
});

function initializeKairo() {

  const registerForm = document.getElementById("register-form");
  if (registerForm) registerForm.addEventListener("submit", handleRegister);

  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  const teacherLogout = document.getElementById("teacher-logout-btn");
  if (teacherLogout) teacherLogout.addEventListener("click", handleLogout);

  const studentLogout = document.getElementById("student-logout-btn");
  if (studentLogout) studentLogout.addEventListener("click", handleLogout);

  const createClassForm = document.getElementById("create-class-form");
  if (createClassForm) createClassForm.addEventListener("submit", handleCreateClass);

  const activityForm = document.getElementById("create-activity-form");
  if (activityForm) activityForm.addEventListener("submit", handleCreateActivity);

  const joinForm = document.getElementById("join-class-form");
  if (joinForm) joinForm.addEventListener("submit", handleJoinClass);

  const progressSelect = document.getElementById("progress-class");
  if (progressSelect) progressSelect.addEventListener("change", handleProgressClassChange);

  const addCategoryBtn = document.getElementById("add-category-btn");
  if (addCategoryBtn) addCategoryBtn.addEventListener("click", () => addCategoryRow());

  const activityClassSelect = document.getElementById("activity-class");
  if (activityClassSelect) activityClassSelect.addEventListener("change", handleActivityClassChange);

  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const shell = btn.closest(".shell");
      const role = shell && shell.id === "teacher-shell" ? "teacher" : "student";
      setActiveView(role, btn.dataset.view);
    });
  });

  initChoiceGroups();
  resetCategoryRows();

  const todayText = new Date().toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long"
  });
  const teacherToday = document.getElementById("teacher-today");
  if (teacherToday) teacherToday.textContent = todayText;
  const studentToday = document.getElementById("student-today");
  if (studentToday) studentToday.textContent = todayText;

  restoreSession();
}

// ============================================================
// NAVEGACIÓN ENTRE VISTAS
// ============================================================

function setActiveView(role, viewName) {
  const shellId = role === "teacher" ? "teacher-shell" : "student-shell";
  const shell = document.getElementById(shellId);
  if (!shell) return;

  shell.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  shell.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("hidden", view.id !== `${role}-view-${viewName}`);
  });
}

// ============================================================
// SELECTORES DE TIPO / PRIORIDAD
// ============================================================

function initChoiceGroups() {
  document.querySelectorAll(".choice-group").forEach(group => {
    const targetId = group.dataset.target;
    const hiddenInput = document.getElementById(targetId);
    if (!hiddenInput) return;

    group.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".choice-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        hiddenInput.value = btn.dataset.value;

        if (targetId === "activity-type") {
          toggleMandatoryVisibility(btn.dataset.value);
        }
      });
    });
  });
}

function toggleMandatoryVisibility(type) {
  const row = document.getElementById("mandatory-row");
  if (row) row.classList.toggle("hidden", type !== "task");
}

// ============================================================
// BLOQUEO DE BOTONES MIENTRAS SE GUARDA   <-- NUEVO
// ============================================================

function lockButton(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "Procesando...";
  }
  return button;
}

function unlockButton(button) {
  if (button) {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }
}

// ============================================================
// CATEGORÍAS DE EVALUACIÓN
// ============================================================

function addCategoryRow(name = "", percentage = "") {
  categoryRowCounter++;
  const rowId = `category-row-${categoryRowCounter}`;

  const container = document.getElementById("category-rows");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "category-row";
  row.id = rowId;
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.marginBottom = "8px";

  row.innerHTML = `
    <input type="text" class="category-name" placeholder="Ej: Pruebas periódicas" value="${name}" style="flex: 2;">
    <input type="number" class="category-percentage" placeholder="%" min="0" max="100" value="${percentage}" style="flex: 1;">
    <button type="button" class="secondary-btn danger-btn" onclick="removeCategoryRow('${rowId}')">✕</button>
  `;

  container.appendChild(row);

  row.querySelector(".category-percentage").addEventListener("input", updateCategoryTotal);

  updateCategoryTotal();
}

function removeCategoryRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  updateCategoryTotal();
}
window.removeCategoryRow = removeCategoryRow;

function updateCategoryTotal() {
  const percentageInputs = document.querySelectorAll(".category-percentage");
  let total = 0;
  percentageInputs.forEach(input => {
    total += Number(input.value) || 0;
  });

  const totalLabel = document.getElementById("category-total");
  if (totalLabel) {
    totalLabel.textContent = `Total: ${total}%`;
    totalLabel.style.color = total === 100 ? "var(--success)" : "var(--danger)";
  }
}

function getCategoriesFromForm() {
  const rows = document.querySelectorAll("#category-rows .category-row");
  const categories = [];
  rows.forEach(row => {
    const name = row.querySelector(".category-name").value.trim();
    const percentage = Number(row.querySelector(".category-percentage").value) || 0;
    if (name) {
      categories.push({ name, percentage });
    }
  });
  return categories;
}

function resetCategoryRows() {
  const container = document.getElementById("category-rows");
  if (container) container.innerHTML = "";
  addCategoryRow();
}

// ============================================================
// API
// ============================================================

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Ha ocurrido un error.");
  return data;
}

// ============================================================
// ROL Y AUTENTICACIÓN
// ============================================================

function selectRole(role) {
  selectedRole = role;
  document.getElementById("role-section")?.classList.add("hidden");
  document.getElementById("auth-section")?.classList.remove("hidden");
  showLogin();
}
window.selectRole = selectRole;

function backToRoles() {
  document.getElementById("auth-section")?.classList.add("hidden");
  document.getElementById("role-section")?.classList.remove("hidden");
  selectedRole = null;
}
window.backToRoles = backToRoles;

function showLogin() {
  document.getElementById("login-container")?.classList.remove("hidden");
  document.getElementById("register-container")?.classList.add("hidden");
}
window.showLogin = showLogin;

function showRegister() {
  document.getElementById("login-container")?.classList.add("hidden");
  document.getElementById("register-container")?.classList.remove("hidden");
}
window.showRegister = showRegister;

async function handleRegister(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const data = {
    name: document.getElementById("register-name")?.value.trim(),
    surname: document.getElementById("register-surname")?.value.trim(),
    email: document.getElementById("register-email")?.value.trim(),
    password: document.getElementById("register-password")?.value,
    course: document.getElementById("register-course")?.value.trim(),
    center: document.getElementById("register-center")?.value.trim()
  };

  try {
    if (!data.name || !data.surname || !data.email || !data.password || !data.center) {
      alert("Rellena todos los campos.");
      return;
    }

    if (selectedRole === "teacher") {
      await api("/api/teachers", { method: "POST", body: JSON.stringify(data) });
    } else if (selectedRole === "student") {
      await api("/api/students", { method: "POST", body: JSON.stringify(data) });
    } else {
      alert("Selecciona primero tu rol.");
      return;
    }

    alert("Cuenta creada correctamente.");
    event.target.reset();
    showLogin();

  } catch (error) {
    alert(error.message);
  } finally {
    unlockButton(submitButton);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const email = document.getElementById("login-email")?.value.trim();
  const password = document.getElementById("login-password")?.value;

  if (!selectedRole) {
    alert("Selecciona primero si eres estudiante o profesor.");
    unlockButton(submitButton);
    return;
  }

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password, role: selectedRole })
    });

    localStorage.setItem("kairo_token", result.token);
    currentToken = result.token;
    await restoreSession();

  } catch (error) {
    alert(error.message);
  } finally {
    unlockButton(submitButton);
  }
}

async function restoreSession() {
  if (!currentToken) return;

  try {
    const result = await api(`/api/auth/me/${currentToken}`);
    currentUser = result.user;
    selectedRole = result.role;

    document.getElementById("pre-login-topbar")?.classList.add("hidden");
    document.getElementById("role-section")?.classList.add("hidden");
    document.getElementById("auth-section")?.classList.add("hidden");

    document.body.classList.remove("role-teacher", "role-student");
    document.body.classList.add(selectedRole === "teacher" ? "role-teacher" : "role-student");

    const teacherShell = document.getElementById("teacher-shell");
    const studentShell = document.getElementById("student-shell");

    if (selectedRole === "teacher") {
      teacherShell?.classList.remove("hidden");
      studentShell?.classList.add("hidden");
      await loadTeacherDashboard();
    } else {
      studentShell?.classList.remove("hidden");
      teacherShell?.classList.add("hidden");
      await loadStudentDashboard();
    }

  } catch (error) {
    console.error("[KAIRO] Sesión no válida, se pide login de nuevo:", error);
    localStorage.removeItem("kairo_token");
    currentToken = null;
  }
}

async function handleLogout() {
  try {
    if (currentToken) {
      await api(`/api/auth/logout/${currentToken}`, { method: "DELETE" });
    }
  } catch (error) {
    console.error(error);
  }

  localStorage.removeItem("kairo_token");
  currentToken = null;
  currentUser = null;
  selectedRole = null;
  location.reload();
}

// ============================================================
// DASHBOARD PROFESOR
// ============================================================

async function loadTeacherDashboard() {
  const welcome = document.getElementById("teacher-welcome");
  if (welcome) welcome.textContent = `Bienvenido, ${currentUser.name}.`;

  teacherClasses = await api(`/api/teachers/${currentUser.id}/classes`);

  renderTeacherClasses();
  updateClassSelectors();
  await loadTeacherActivities();
}

function renderTeacherClasses() {
  const container = document.getElementById("teacher-classes");
  if (!container) return;

  container.innerHTML = "";

  if (teacherClasses.length === 0) {
    container.innerHTML = "<p>Aún no tienes clases.</p>";
    return;
  }

  teacherClasses.forEach(classItem => {
    const card = document.createElement("div");
    card.className = "class-card";
    card.innerHTML = `
      <h4>${classItem.course} ${classItem.group_name} — ${classItem.subject}</h4>
      <span class="class-code">Código: ${classItem.code}</span>
      <div class="class-card-actions">
        <button type="button" class="secondary-btn" onclick="focusClassInTasks(${classItem.id})">Ver actividades</button>
        <button type="button" class="secondary-btn danger-btn" onclick="deleteClass(${classItem.id})">🗑️ Eliminar clase</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function focusClassInTasks(classId) {
  setActiveView("teacher", "tasks");
  const select = document.getElementById("activity-class");
  if (select) {
    select.value = String(classId);
    handleActivityClassChange({ target: select });
  }
}
window.focusClassInTasks = focusClassInTasks;

async function deleteClass(classId) {
  const confirmed = confirm(
    "¿Seguro que quieres eliminar esta clase?\n\n" +
    "Se borrarán también sus tareas, exámenes, proyectos y los alumnos unidos. " +
    "Esta acción no se puede deshacer."
  );

  if (!confirmed) return;

  try {
    await api(`/api/classes/${classId}?teacher_id=${currentUser.id}`, {
      method: "DELETE"
    });

    await loadTeacherDashboard();

  } catch (error) {
    alert(error.message);
  }
}
window.deleteClass = deleteClass;

function updateClassSelectors() {
  const activitySelect = document.getElementById("activity-class");
  const progressSelect = document.getElementById("progress-class");

  [activitySelect, progressSelect].forEach(select => {
    if (!select) return;
    select.innerHTML = `<option value="">Selecciona una clase</option>`;
    teacherClasses.forEach(classItem => {
      const option = document.createElement("option");
      option.value = classItem.id;
      option.textContent = `${classItem.course} ${classItem.group_name} — ${classItem.subject}`;
      select.appendChild(option);
    });
  });
}

async function handleCreateClass(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  try {
    const course = document.getElementById("class-course")?.value.trim();
    const groupName = document.getElementById("class-group")?.value.trim();
    const subject = document.getElementById("class-subject")?.value.trim();

    if (!course || !groupName || !subject) {
      alert("Rellena todos los campos de la clase.");
      return;
    }

    const categories = getCategoriesFromForm();

    if (categories.length === 0) {
      alert("Añade al menos una categoría de evaluación.");
      return;
    }

    const total = categories.reduce((sum, cat) => sum + cat.percentage, 0);

    if (Math.abs(total - 100) > 0.01) {
      alert(`Los porcentajes deben sumar exactamente 100%. Ahora mismo suman ${total}%.`);
      return;
    }

    const result = await api("/api/classes", {
      method: "POST",
      body: JSON.stringify({ teacher_id: currentUser.id, course, group_name: groupName, subject })
    });

    await api(`/api/classes/${result.id}/evaluation-categories`, {
      method: "POST",
      body: JSON.stringify({ categories })
    });

    alert(`Clase creada correctamente.\n\nCódigo: ${result.code}`);
    event.target.reset();
    resetCategoryRows();
    document.getElementById("modal-create-class")?.close();

    await loadTeacherDashboard();

  } catch (error) {
    alert(error.message);
  } finally {
    unlockButton(submitButton);
  }
}

async function handleActivityClassChange(event) {
  const classId = event.target.value;
  const categorySelect = document.getElementById("activity-category");
  if (!categorySelect) return;

  categorySelect.innerHTML = `<option value="">Sin categoría de evaluación</option>`;

  if (!classId) return;

  try {
    const categories = await api(`/api/classes/${classId}/evaluation-categories`);
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = `${category.name} (${category.percentage}%)`;
      categorySelect.appendChild(option);
    });
  } catch (error) {
    console.error("No se pudieron cargar las categorías:", error);
  }
}

async function handleCreateActivity(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const classSelect = document.getElementById("activity-class");
  const categorySelect = document.getElementById("activity-category");
  const type = document.getElementById("activity-type")?.value;
  const title = document.getElementById("activity-title")?.value.trim();
  const description = document.getElementById("activity-description")?.value.trim();
  const date = document.getElementById("activity-date")?.value;
  const priority = document.getElementById("activity-priority")?.value;
  const mandatory = document.getElementById("activity-mandatory")?.checked ?? true;

  if (!classSelect || !classSelect.value) {
    alert("Selecciona una clase.");
    unlockButton(submitButton);
    return;
  }
  if (!title || !date) {
    alert("Introduce un título y una fecha.");
    unlockButton(submitButton);
    return;
  }

  const classId = Number(classSelect.value);
  const categoryId = categorySelect && categorySelect.value ? Number(categorySelect.value) : null;

  try {
    if (type === "task") {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, category_id: categoryId, title, description, due_date: date, priority, mandatory })
      });
    } else if (type === "exam") {
      await api("/api/exams", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, category_id: categoryId, title, description, exam_date: date, importance: priority })
      });
    } else if (type === "project") {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, category_id: categoryId, title, description, due_date: date, priority })
      });
    } else {
      alert("Selecciona el tipo de actividad.");
      return;
    }

    alert("Actividad creada correctamente.");
    event.target.reset();
    toggleMandatoryVisibility("task");
    document.getElementById("modal-create-activity")?.close();

    await loadTeacherActivities();

  } catch (error) {
    alert(error.message);
  } finally {
    unlockButton(submitButton);
  }
}

async function loadTeacherActivities() {
  const container = document.getElementById("teacher-activities");
  const dashboardContainer = document.getElementById("teacher-activities-dashboard");

  try {
    const activities = await api(`/api/teachers/${currentUser.id}/activities`);
    teacherActivitiesCache = activities;

    updateTeacherMetrics(activities);

    const render = (target, list, emptyText) => {
      if (!target) return;
      target.innerHTML = "";
      if (list.length === 0) {
        target.innerHTML = `<p>${emptyText}</p>`;
        return;
      }
      list.forEach(activity => {
        const element = document.createElement("div");
        element.className = `plan-item priority-${(activity.priority || "media").toLowerCase()}`;

        let typeLabel = "TAREA";
        if (activity.type === "exam") typeLabel = "EXAMEN";
        else if (activity.type === "project") typeLabel = "PROYECTO";

        const categoryLabel = activity.category_name ? ` · ${activity.category_name}` : "";

        element.innerHTML = `
          <div class="plan-title">${typeLabel} · ${activity.title}</div>
          <div class="plan-meta">${activity.course} ${activity.group_name} · ${activity.subject}${categoryLabel} · ${activity.activity_date}</div>
          <button type="button" class="secondary-btn danger-btn" onclick="deleteActivity('${activity.type}', ${activity.id})">🗑️ Eliminar</button>
        `;
        target.appendChild(element);
      });
    };

    render(container, activities, "Aún no has creado actividades.");
    render(dashboardContainer, activities.slice(0, 5), "Aún no has creado actividades.");

  } catch (error) {
    console.error("Error cargando actividades:", error);
  }
}

async function deleteActivity(type, id) {
  const confirmed = confirm("¿Seguro que quieres eliminar esta actividad? Esta acción no se puede deshacer.");
  if (!confirmed) return;

  const endpoints = {
    task: `/api/tasks/${id}`,
    exam: `/api/exams/${id}`,
    project: `/api/projects/${id}`
  };

  try {
    await api(`${endpoints[type]}?teacher_id=${currentUser.id}`, { method: "DELETE" });
    await loadTeacherActivities();
  } catch (error) {
    alert(error.message);
  }
}
window.deleteActivity = deleteActivity;

function updateTeacherMetrics(activities) {
  const setMetric = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setMetric("metric-classes", teacherClasses.length);
  setMetric("metric-tasks", activities.filter(a => a.type === "task").length);
  setMetric("metric-exams", activities.filter(a => a.type === "exam").length);
  setMetric("metric-projects", activities.filter(a => a.type === "project").length);
}

// ============================================================
// SEGUIMIENTO DE TAREAS
// ============================================================

async function handleProgressClassChange(event) {
  const classId = event.target.value;
  const container = document.getElementById("progress-tasks");
  if (!container) return;

  container.innerHTML = "";
  if (!classId) return;

  try {
    const tasks = await api(`/api/classes/${classId}/tasks`);

    if (tasks.length === 0) {
      container.innerHTML = "<p>Esta clase todavía no tiene tareas.</p>";
      return;
    }

    tasks.forEach(task => {
      const item = document.createElement("div");
      item.className = "plan-item";
      item.innerHTML = `
        <div class="plan-title">${task.title}</div>
        <div class="plan-meta">Entrega: ${task.due_date}</div>
        <button type="button" class="secondary-btn" onclick="loadTaskProgress(${classId}, ${task.id})">Ver quién la ha hecho</button>
        <div id="progress-result-${task.id}"></div>
      `;
      container.appendChild(item);
    });

  } catch (error) {
    console.error("Error cargando tareas para seguimiento:", error);
    container.innerHTML = "<p>No se pudieron cargar las tareas de esta clase.</p>";
  }
}

async function loadTaskProgress(classId, taskId) {
  const resultContainer = document.getElementById(`progress-result-${taskId}`);
  if (!resultContainer) return;

  resultContainer.innerHTML = "<p>Cargando...</p>";

  try {
    const students = await api(`/api/classes/${classId}/tasks/${taskId}/progress`);

    if (students.length === 0) {
      resultContainer.innerHTML = "<p>Esta clase todavía no tiene alumnos.</p>";
      return;
    }

    resultContainer.innerHTML = students.map(student => `
      <div class="progress-row">${student.completed ? "✅" : "⬜"} ${student.name} ${student.surname}</div>
    `).join("");

  } catch (error) {
    console.error("Error cargando el seguimiento:", error);
    resultContainer.innerHTML = "<p>No se pudo cargar el seguimiento.</p>";
  }
}
window.loadTaskProgress = loadTaskProgress;

// ============================================================
// DASHBOARD ALUMNO
// ============================================================

async function loadStudentDashboard() {
  const welcome = document.getElementById("student-welcome");
  if (welcome) welcome.textContent = `Hola, ${currentUser.name}.`;

  await loadStudentClasses();
  await loadStudentPlan();

  startAutoRefresh();
}

let planRefreshInterval = null;

function startAutoRefresh() {
  if (planRefreshInterval) {
    clearInterval(planRefreshInterval);
  }

  planRefreshInterval = setInterval(() => {
    if (currentUser && selectedRole === "student") {
      loadStudentPlan();
    }
  }, 20000);
}

async function loadStudentClasses() {
  const classes = await api(`/api/students/${currentUser.id}/classes`);
  const container = document.getElementById("student-classes");

  const metricClasses = document.getElementById("metric-student-classes");
  if (metricClasses) metricClasses.textContent = classes.length;

  if (!container) return;
  container.innerHTML = "";

  if (classes.length === 0) {
    container.innerHTML = "<p>Aún no perteneces a ninguna clase.</p>";
    return;
  }

  classes.forEach(classItem => {
    const card = document.createElement("div");
    card.className = "class-card";
    card.innerHTML = `
      <h4>${classItem.course} ${classItem.group_name} — ${classItem.subject}</h4>
      <p>Profesor: ${classItem.teacher_name} ${classItem.teacher_surname}</p>
    `;
    container.appendChild(card);
  });
}

async function handleJoinClass(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const code = document.getElementById("join-code")?.value.trim().toUpperCase();
  if (!code) {
    alert("Introduce el código de la clase.");
    unlockButton(submitButton);
    return;
  }

  try {
    await api("/api/classes/join", {
      method: "POST",
      body: JSON.stringify({ student_id: currentUser.id, code })
    });

    alert("Te has unido a la clase correctamente.");
    event.target.reset();
    document.getElementById("modal-join-class")?.close();

    await loadStudentDashboard();

  } catch (error) {
    alert(error.message);
  } finally {
    unlockButton(submitButton);
  }
}

async function markTaskComplete(taskId) {
  try {
    await api(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({ student_id: currentUser.id })
    });
    await loadStudentPlan();
  } catch (error) {
    alert(error.message);
  }
}
window.markTaskComplete = markTaskComplete;

async function loadStudentPlan() {
  const container = document.getElementById("student-plan");
  const previewContainer = document.getElementById("student-plan-preview");

  if (container) container.innerHTML = "<p>KAIRO está pensando...</p>";

  try {
    const result = await api(`/api/students/${currentUser.id}/plan`);
    studentPlanCache = result.plan || [];

    updateStudentMetrics(studentPlanCache);

    const emptyHtml = `
      <div class="plan-item">
        <div class="plan-title">No hay nada que organizar.</div>
        <div class="plan-meta">Cuando tus profesores introduzcan tareas, exámenes o proyectos, KAIRO construirá tu plan.</div>
      </div>
    `;

    const renderList = (target, items) => {
      if (!target) return;
      target.innerHTML = "";

      if (items.length === 0) {
        target.innerHTML = emptyHtml;
        return;
      }

      items.forEach(item => {
        const element = document.createElement("div");
        element.className = `plan-item priority-${(item.priority || "media").toLowerCase()}`;

        const label = item.mandatory ? "🔴 OBLIGATORIO" : "🟢 RECOMENDADO";

        let typeLabel = "TAREA";
        if (item.type === "exam_preparation") typeLabel = "PREPARACIÓN DE EXAMEN";
        else if (item.type === "project") typeLabel = "PROYECTO";

        const doneButton = item.type === "task"
          ? `<button type="button" class="secondary-btn" onclick="markTaskComplete(${item.id})">✅ Marcar como hecha</button>`
          : "";

        element.innerHTML = `
          <div class="plan-title">${label} · ${typeLabel}<br>${item.title}</div>
          <div class="plan-meta">${item.subject} · ${formatDays(item.days_left)} · Importancia: ${item.priority}</div>
          ${doneButton}
        `;
        target.appendChild(element);
      });
    };

    renderList(container, studentPlanCache);
    renderList(previewContainer, studentPlanCache.slice(0, 4));

  } catch (error) {
    console.error("Error generando el plan:", error);
    const errorHtml = `
      <div class="plan-item">
        <div class="plan-title">No se ha podido generar el plan de KAIRO.</div>
        <div class="plan-meta">Comprueba que el servidor de KAIRO está funcionando.</div>
      </div>
    `;
    if (container) container.innerHTML = errorHtml;
    if (previewContainer) previewContainer.innerHTML = errorHtml;
  }
}

function updateStudentMetrics(plan) {
  const setMetric = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setMetric("metric-student-pending", plan.length);
  setMetric("metric-student-exams", plan.filter(item => item.type === "exam_preparation").length);
}

function formatDays(days) {
  if (days < 0) return "ATRASADO";
  if (days === 0) return "HOY";
  if (days === 1) return "MAÑANA";
  return `En ${days} días`;
}
