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
// SELECTORES DE TIPO / PRIORIDAD (botones en vez de <select>)
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
// CATEGORÍAS DE EVALUACIÓN (en el formulario de crear clase)
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
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("login-email")?.value.trim();
  const password = document.getElementById("login-password")?.value;

  if (!selectedRole) {
    alert("Selecciona primero si eres estudiante o profesor.");
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
  if (select) select.value = String(classId);
  handleActivityClassChange({ target: select });
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
  }
}

// ============================================================
// CATEGORÍA EN EL FORMULARIO DE ACTIVIDAD
// ============================================================

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

  const classSelect = document.getElementById("activity-class");
  const categorySelect = document.getElementById("activity-category");
  const type = document.getElementById("activity-type")?.value;
  const title = document.getElementById("activity-title")?.value.trim();
  const description = document.getElementById("activity-description")?.value.trim();
  const date = document.getElementById("activity-date")?.value;
  const priority = document.getElementById("activity-priority")?.value;
  const mandatory = document.getElementById("activity-mandatory"
