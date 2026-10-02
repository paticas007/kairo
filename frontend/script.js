// ============================================================
// KAIRO - FRONTEND
// ============================================================

let selectedRole = null;
let currentUser = null;
let currentToken = localStorage.getItem("kairo_token");
let teacherClasses = [];
let teacherActivitiesCache = [];
let studentPlanCache = [];
let studentClassesCache = [];
let categoryRowCounter = 0;
let adminSecret = null;
let currentClassDetailId = null;
let currentTeacherActivitiesClassId = null;

let calendarDataCache = { teacher: null, student: null };
let calendarViewMonth = { teacher: new Date(), student: new Date() };
let calendarSelectedDate = { teacher: null, student: null };

const MAX_FILE_BYTES = 4.3 * 1024 * 1024;

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

  const gradebookSelect = document.getElementById("gradebook-class");
  if (gradebookSelect) gradebookSelect.addEventListener("change", handleGradebookClassChange);

  const addCategoryBtn = document.getElementById("add-category-btn");
  if (addCategoryBtn) addCategoryBtn.addEventListener("click", function () { addCategoryRow(); });

  const activityClassSelect = document.getElementById("activity-class");
  if (activityClassSelect) activityClassSelect.addEventListener("change", handleActivityClassChange);

  const recoveryFindBtn = document.getElementById("recovery-find-btn");
  if (recoveryFindBtn) recoveryFindBtn.addEventListener("click", handleFindRecoveryAccount);

  const recoveryResetForm = document.getElementById("recovery-reset-form");
  if (recoveryResetForm) recoveryResetForm.addEventListener("submit", handleResetPassword);

  const adminLoginBtn = document.getElementById("admin-login-btn");
  if (adminLoginBtn) adminLoginBtn.addEventListener("click", handleAdminLogin);

  const adminResetBtn = document.getElementById("admin-reset-btn");
  if (adminResetBtn) adminResetBtn.addEventListener("click", handleAdminResetDatabase);

  document.querySelectorAll(".nav-item[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const shell = btn.closest(".shell");
      const role = shell && shell.id === "teacher-shell" ? "teacher" : "student";
      setActiveView(role, btn.dataset.view);

      if (role === "student" && btn.dataset.view === "grades") {
        loadStudentGrades();
      }
      if (btn.dataset.view === "calendar") {
        openCalendarView(role);
      }
      if (btn.dataset.view === "workload") {
        openWorkloadView(role);
      }
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
// AVISOS FLOTANTES
// ============================================================

function showToast(message, type) {
  if (!type) type = "info";

  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(function () {
    toast.classList.add("show");
  });

  setTimeout(function () {
    toast.classList.remove("show");
    setTimeout(function () {
      toast.remove();
    }, 300);
  }, 4000);
}

// ============================================================
// CONFIRMACIÓN PROPIA
// ============================================================

function showConfirm(message) {
  return new Promise(function (resolve) {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML =
      '<div class="confirm-box">' +
        "<p>" + message + "</p>" +
        '<div class="confirm-actions">' +
          '<button type="button" class="secondary-btn" id="confirm-cancel">Cancelar</button>' +
          '<button type="button" class="primary-btn danger-btn" id="confirm-ok">Confirmar</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      overlay.classList.add("show");
    });

    function cleanup(result) {
      overlay.classList.remove("show");
      setTimeout(function () {
        overlay.remove();
      }, 200);
      resolve(result);
    }

    overlay.querySelector("#confirm-ok").addEventListener("click", function () {
      cleanup(true);
    });
    overlay.querySelector("#confirm-cancel").addEventListener("click", function () {
      cleanup(false);
    });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) cleanup(false);
    });
  });
}

// ============================================================
// MODO EDITOR
// ============================================================

async function handleAdminLogin() {
  const secretInput = document.getElementById("admin-secret-input");
  const secret = secretInput ? secretInput.value : "";

  if (!secret) {
    showToast("Escribe la clave de administrador.", "error");
    return;
  }

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ secret: secret })
    });

    adminSecret = secret;

    const step1 = document.getElementById("admin-login-step");
    const step2 = document.getElementById("admin-panel-step");
    if (step1) step1.classList.add("hidden");
    if (step2) step2.classList.remove("hidden");
    if (secretInput) secretInput.value = "";

  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleAdminResetDatabase() {
  if (!adminSecret) return;

  const confirmed = await showConfirm(
    "¿Seguro que quieres reiniciar la base de datos?\n\n" +
    "Se borrarán TODAS las cuentas, clases, tareas, exámenes y proyectos, de todos los profesores y alumnos. " +
    "Esta acción no se puede deshacer."
  );

  if (!confirmed) return;

  try {
    const result = await api("/api/admin/reset-database", {
      method: "POST",
      body: JSON.stringify({ secret: adminSecret })
    });

    showToast(result.message, "success");
    const modal = document.getElementById("modal-admin-login");
    if (modal) modal.close();

  } catch (error) {
    showToast(error.message, "error");
  }
}

// ============================================================
// NAVEGACIÓN ENTRE VISTAS
// ============================================================

function setActiveView(role, viewName) {
  const shellId = role === "teacher" ? "teacher-shell" : "student-shell";
  const shell = document.getElementById(shellId);
  if (!shell) return;

  const navItems = shell.querySelectorAll(".nav-item[data-view]");
  navItems.forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  const views = shell.querySelectorAll(".view");
  views.forEach(function (view) {
    view.classList.toggle("hidden", view.id !== (role + "-view-" + viewName));
  });
}
window.setActiveView = setActiveView;

// ============================================================
// SELECTORES DE TIPO / PRIORIDAD
// ============================================================

function initChoiceGroups() {
  const groups = document.querySelectorAll(".choice-group");
  groups.forEach(function (group) {
    const targetId = group.dataset.target;
    const hiddenInput = document.getElementById(targetId);
    if (!hiddenInput) return;

    const buttons = group.querySelectorAll(".choice-btn");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.remove("active");
        });
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
// BLOQUEO DE BOTONES MIENTRAS SE GUARDA
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

function addCategoryRow(name, percentage) {
  if (name === undefined) name = "";
  if (percentage === undefined) percentage = "";

  categoryRowCounter++;
  const rowId = "category-row-" + categoryRowCounter;

  const container = document.getElementById("category-rows");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "category-row";
  row.id = rowId;
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.marginBottom = "8px";

  row.innerHTML =
    '<input type="text" class="category-name" placeholder="Ej: Pruebas periódicas" value="' + name + '" style="flex: 2;">' +
    '<input type="number" class="category-percentage" placeholder="%" min="0" max="100" value="' + percentage + '" style="flex: 1;">' +
    '<button type="button" class="secondary-btn danger-btn" onclick="removeCategoryRow(\'' + rowId + '\')">✕</button>';

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
  percentageInputs.forEach(function (input) {
    total += Number(input.value) || 0;
  });

  const totalLabel = document.getElementById("category-total");
  if (totalLabel) {
    totalLabel.textContent = "Total: " + total + "%";
    totalLabel.style.color = total === 100 ? "var(--success)" : "var(--danger)";
  }
}

function getCategoriesFromForm() {
  const rows = document.querySelectorAll("#category-rows .category-row");
  const categories = [];
  rows.forEach(function (row) {
    const name = row.querySelector(".category-name").value.trim();
    const percentage = Number(row.querySelector(".category-percentage").value) || 0;
    if (name) {
      categories.push({ name: name, percentage: percentage });
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

async function api(url, options) {
  if (!options) options = {};

  const headers = { "Content-Type": "application/json" };
  if (options.headers) {
    for (const key in options.headers) {
      headers[key] = options.headers[key];
    }
  }

  const fetchOptions = { headers: headers };
  if (options.method) fetchOptions.method = options.method;
  if (options.body) fetchOptions.body = options.body;

  const response = await fetch(url, fetchOptions);

  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.detail || "Ha ocurrido un error.");
  }

  return data;
}

// ============================================================
// ROL Y AUTENTICACIÓN
// ============================================================

function selectRole(role) {
  selectedRole = role;

  const roleSection = document.getElementById("role-section");
  const authSection = document.getElementById("auth-section");

  if (roleSection) roleSection.classList.add("hidden");
  if (authSection) authSection.classList.remove("hidden");

  showLogin();
}
window.selectRole = selectRole;

function backToRoles() {
  const authSection = document.getElementById("auth-section");
  const roleSection = document.getElementById("role-section");

  if (authSection) authSection.classList.add("hidden");
  if (roleSection) roleSection.classList.remove("hidden");

  selectedRole = null;
}
window.backToRoles = backToRoles;

function showLogin() {
  const loginContainer = document.getElementById("login-container");
  const registerContainer = document.getElementById("register-container");

  if (loginContainer) loginContainer.classList.remove("hidden");
  if (registerContainer) registerContainer.classList.add("hidden");
}
window.showLogin = showLogin;

function showRegister() {
  const loginContainer = document.getElementById("login-container");
  const registerContainer = document.getElementById("register-container");

  if (loginContainer) loginContainer.classList.add("hidden");
  if (registerContainer) registerContainer.classList.remove("hidden");
}
window.showRegister = showRegister;

async function handleRegister(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const nameEl = document.getElementById("register-name");
  const surnameEl = document.getElementById("register-surname");
  const emailEl = document.getElementById("register-email");
  const passwordEl = document.getElementById("register-password");
  const courseEl = document.getElementById("register-course");
  const centerEl = document.getElementById("register-center");
  const questionEl = document.getElementById("register-security-question");
  const answerEl = document.getElementById("register-security-answer");

  const data = {
    name: nameEl ? nameEl.value.trim() : "",
    surname: surnameEl ? surnameEl.value.trim() : "",
    email: emailEl ? emailEl.value.trim() : "",
    password: passwordEl ? passwordEl.value : "",
    course: courseEl ? courseEl.value.trim() : "",
    center: centerEl ? centerEl.value.trim() : "",
    security_question: questionEl ? questionEl.value : "",
    security_answer: answerEl ? answerEl.value.trim() : ""
  };

  try {
    if (!data.name || !data.surname || !data.email || !data.password || !data.center) {
      showToast("Rellena todos los campos.", "error");
      return;
    }

    if (!data.security_question || !data.security_answer) {
      showToast("Elige una pregunta de seguridad y escribe tu respuesta.", "error");
      return;
    }

    if (selectedRole === "teacher") {
      await api("/api/teachers", { method: "POST", body: JSON.stringify(data) });
    } else if (selectedRole === "student") {
      await api("/api/students", { method: "POST", body: JSON.stringify(data) });
    } else {
      showToast("Selecciona primero tu rol.", "error");
      return;
    }

    showToast("Cuenta creada correctamente.", "success");
    event.target.reset();
    showLogin();

  } catch (error) {
    showToast(error.message, "error");
  } finally {
    unlockButton(submitButton);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const emailEl = document.getElementById("login-email");
  const passwordEl = document.getElementById("login-password");
  const email = emailEl ? emailEl.value.trim() : "";
  const password = passwordEl ? passwordEl.value : "";

  if (!selectedRole) {
    showToast("Selecciona primero si eres estudiante o profesor.", "error");
    unlockButton(submitButton);
    return;
  }

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password, role: selectedRole })
    });

    localStorage.setItem("kairo_token", result.token);
    currentToken = result.token;
    await restoreSession();

  } catch (error) {
    showToast(error.message, "error");
  } finally {
    unlockButton(submitButton);
  }
}

async function restoreSession() {
  if (!currentToken) return;

  try {
    const result = await api("/api/auth/me/" + currentToken);
    currentUser = result.user;
    selectedRole = result.role;

    const preTopbar = document.getElementById("pre-login-topbar");
    const roleSection = document.getElementById("role-section");
    const authSection = document.getElementById("auth-section");

    if (preTopbar) preTopbar.classList.add("hidden");
    if (roleSection) roleSection.classList.add("hidden");
    if (authSection) authSection.classList.add("hidden");

    document.body.classList.remove("role-teacher", "role-student");
    document.body.classList.add(selectedRole === "teacher" ? "role-teacher" : "role-student");

    const teacherShell = document.getElementById("teacher-shell");
    const studentShell = document.getElementById("student-shell");

    if (selectedRole === "teacher") {
      if (teacherShell) teacherShell.classList.remove("hidden");
      if (studentShell) studentShell.classList.add("hidden");
      await loadTeacherDashboard();
    } else {
      if (studentShell) studentShell.classList.remove("hidden");
      if (teacherShell) teacherShell.classList.add("hidden");
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
      await api("/api/auth/logout/" + currentToken, { method: "DELETE" });
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
// RECUPERACIÓN DE CONTRASEÑA
// ============================================================

function openPasswordRecovery() {
  const step1 = document.getElementById("recovery-step-email");
  const step2 = document.getElementById("recovery-reset-form");
  if (step1) step1.classList.remove("hidden");
  if (step2) step2.classList.add("hidden");

  const emailInput = document.getElementById("recovery-email");
  if (emailInput) emailInput.value = "";

  const modal = document.getElementById("modal-password-recovery");
  if (modal) modal.showModal();
}
window.openPasswordRecovery = openPasswordRecovery;

async function handleFindRecoveryAccount() {
  const emailEl = document.getElementById("recovery-email");
  const email = emailEl ? emailEl.value.trim() : "";

  if (!email) {
    showToast("Introduce tu correo electrónico.", "error");
    return;
  }
  if (!selectedRole) {
    showToast("Selecciona primero si eres profesor o alumno, antes de recuperar la cuenta.", "error");
    return;
  }

  try {
    const result = await api("/api/password-recovery/question", {
      method: "POST",
      body: JSON.stringify({ email: email, role: selectedRole })
    });

    const questionLabel = document.getElementById("recovery-question");
    if (questionLabel) questionLabel.textContent = result.question;

    const step1 = document.getElementById("recovery-step-email");
    const step2 = document.getElementById("recovery-reset-form");
    if (step1) step1.classList.add("hidden");
    if (step2) step2.classList.remove("hidden");

  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const emailEl = document.getElementById("recovery-email");
  const answerEl = document.getElementById("recovery-answer");
  const newPasswordEl = document.getElementById("recovery-new-password");

  const email = emailEl ? emailEl.value.trim() : "";
  const answer = answerEl ? answerEl.value : "";
  const newPassword = newPasswordEl ? newPasswordEl.value : "";

  try {
    await api("/api/password-recovery/reset", {
      method: "POST",
      body: JSON.stringify({ email: email, role: selectedRole, answer: answer, new_password: newPassword })
    });

    showToast("Contraseña actualizada. Ya puedes iniciar sesión.", "success");
    const modal = document.getElementById("modal-password-recovery");
    if (modal) modal.close();
    event.target.reset();

  } catch (error) {
    showToast(error.message, "error");
  } finally {
    unlockButton(submitButton);
  }
}

// ============================================================
// DASHBOARD PROFESOR
// ============================================================

async function loadTeacherDashboard() {
  const welcome = document.getElementById("teacher-welcome");
  if (welcome) welcome.textContent = "Bienvenido, " + currentUser.name + ".";

  teacherClasses = await api("/api/teachers/" + currentUser.id + "/classes");

  renderTeacherClasses();
  renderTeacherActivitiesClassPicker();
  updateClassSelectors();
  await loadPendingCorrections();
  await loadTeacherActivities();
}

function renderTeacherClasses() {
  const container = document.getElementById("teacher-classes");
  const dashboardContainer = document.getElementById("teacher-classes-dashboard");

  function render(target) {
    if (!target) return;
    target.innerHTML = "";

    if (teacherClasses.length === 0) {
      target.innerHTML = "<p>Aún no tienes clases.</p>";
      return;
    }

    teacherClasses.forEach(function (classItem) {
      const card = document.createElement("div");
      card.className = "class-card";
      card.innerHTML =
        "<h4>" + classItem.course + " " + classItem.group_name + " — " + classItem.subject + "</h4>" +
        '<span class="class-code">Código: ' + classItem.code + "</span>" +
        '<div class="class-card-actions">' +
          '<button type="button" class="secondary-btn" onclick="focusClassInTasks(' + classItem.id + ')">Ver actividades</button>' +
          '<button type="button" class="secondary-btn danger-btn" onclick="deleteClass(' + classItem.id + ')">🗑️ Eliminar clase</button>' +
        "</div>";
      target.appendChild(card);
    });
  }

  render(container);
  render(dashboardContainer);
}

function renderTeacherActivitiesClassPicker() {
  const container = document.getElementById("teacher-activities-class-picker");
  if (!container) return;
  container.innerHTML = "";

  if (teacherClasses.length === 0) {
    container.innerHTML = "<p>Aún no tienes clases.</p>";
    return;
  }

  teacherClasses.forEach(function (classItem) {
    const card = document.createElement("div");
    card.className = "class-card";
    card.style.cursor = "pointer";
    card.addEventListener("click", function () {
      openTeacherClassActivities(classItem.id);
    });
    card.innerHTML =
      "<h4>" + classItem.course + " " + classItem.group_name + " — " + classItem.subject + "</h4>" +
      '<span class="class-code">Código: ' + classItem.code + "</span>";
    container.appendChild(card);
  });
}

function focusClassInTasks(classId) {
  openTeacherClassActivities(classId);
}
window.focusClassInTasks = focusClassInTasks;

async function deleteClass(classId) {
  const confirmed = await showConfirm(
    "¿Seguro que quieres eliminar esta clase?\n\n" +
    "Se borrarán también sus tareas, exámenes, proyectos y los alumnos unidos. " +
    "Esta acción no se puede deshacer."
  );

  if (!confirmed) return;

  try {
    await api("/api/classes/" + classId + "?teacher_id=" + currentUser.id, {
      method: "DELETE"
    });

    await loadTeacherDashboard();

  } catch (error) {
    showToast(error.message, "error");
  }
}
window.deleteClass = deleteClass;

function updateClassSelectors() {
  const activitySelect = document.getElementById("activity-class");
  const progressSelect = document.getElementById("progress-class");
  const gradebookSelect = document.getElementById("gradebook-class");

  const selects = [activitySelect, progressSelect, gradebookSelect];

  selects.forEach(function (select) {
    if (!select) return;
    select.innerHTML = '<option value="">Selecciona una clase</option>';
    teacherClasses.forEach(function (classItem) {
      const option = document.createElement("option");
      option.value = classItem.id;
      option.textContent = classItem.course + " " + classItem.group_name + " — " + classItem.subject;
      select.appendChild(option);
    });
  });
}

async function handleCreateClass(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  try {
    const courseEl = document.getElementById("class-course");
    const groupEl = document.getElementById("class-group");
    const subjectEl = document.getElementById("class-subject");

    const course = courseEl ? courseEl.value.trim() : "";
    const groupName = groupEl ? groupEl.value.trim() : "";
    const subject = subjectEl ? subjectEl.value.trim() : "";

    if (!course || !groupName || !subject) {
      showToast("Rellena todos los campos de la clase.", "error");
      return;
    }

    const categories = getCategoriesFromForm();

    if (categories.length === 0) {
      showToast("Añade al menos una categoría de evaluación.", "error");
      return;
    }

    let total = 0;
    categories.forEach(function (cat) {
      total += cat.percentage;
    });

    if (Math.abs(total - 100) > 0.01) {
      showToast("Los porcentajes deben sumar exactamente 100%. Ahora mismo suman " + total + "%.", "error");
      return;
    }

    const result = await api("/api/classes", {
      method: "POST",
      body: JSON.stringify({ teacher_id: currentUser.id, course: course, group_name: groupName, subject: subject })
    });

    await api("/api/classes/" + result.id + "/evaluation-categories", {
      method: "POST",
      body: JSON.stringify({ categories: categories })
    });

    showToast("Clase creada correctamente.\nCódigo: " + result.code, "success");
    event.target.reset();
    resetCategoryRows();
    const modal = document.getElementById("modal-create-class");
    if (modal) modal.close();

    await loadTeacherDashboard();

  } catch (error) {
    showToast(error.message, "error");
  } finally {
    unlockButton(submitButton);
  }
}

async function handleActivityClassChange(event) {
  const classId = event.target.value;
  const categorySelect = document.getElementById("activity-category");
  if (!categorySelect) return;

  categorySelect.innerHTML = '<option value="">Sin categoría de evaluación</option>';

  if (!classId) return;

  try {
    const categories = await api("/api/classes/" + classId + "/evaluation-categories");
    categories.forEach(function (category) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name + " (" + category.percentage + "%)";
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
  const typeEl = document.getElementById("activity-type");
  const titleEl = document.getElementById("activity-title");
  const descriptionEl = document.getElementById("activity-description");
  const dateEl = document.getElementById("activity-date");
  const publishDateEl = document.getElementById("activity-publish-date");
  const priorityEl = document.getElementById("activity-priority");
  const mandatoryEl = document.getElementById("activity-mandatory");

  const type = typeEl ? typeEl.value : "";
  const title = titleEl ? titleEl.value.trim() : "";
  const description = descriptionEl ? descriptionEl.value.trim() : "";
  const date = dateEl ? dateEl.value : "";
  const publishDate = (publishDateEl && publishDateEl.value) ? publishDateEl.value : null;
  const priority = priorityEl ? priorityEl.value : "media";
  const mandatory = mandatoryEl ? mandatoryEl.checked : true;

  if (!classSelect || !classSelect.value) {
    showToast("Selecciona una clase.", "error");
    unlockButton(submitButton);
    return;
  }
  if (!title || !date) {
    showToast("Introduce un título y una fecha.", "error");
    unlockButton(submitButton);
    return;
  }

  const classId = Number(classSelect.value);
  const categoryId = categorySelect && categorySelect.value ? Number(categorySelect.value) : null;

  try {
    if (type === "task") {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, category_id: categoryId, title: title, description: description, due_date: date, priority: priority, mandatory: mandatory, publish_date: publishDate })
      });
    } else if (type === "exam") {
      await api("/api/exams", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, category_id: categoryId, title: title, description: description, exam_date: date, importance: priority, publish_date: publishDate })
      });
    } else if (type === "project") {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ class_id: classId, category_id: categoryId, title: title, description: description, due_date: date, priority: priority, publish_date: publishDate })
      });
    } else {
      showToast("Selecciona el tipo de actividad.", "error");
      return;
    }

    showToast("Actividad guardada correctamente.", "success");
    event.target.reset();
    toggleMandatoryVisibility("task");
    const modal = document.getElementById("modal-create-activity");
    if (modal) modal.close();

    await loadTeacherActivities();
    if (currentTeacherActivitiesClassId) {
      await openTeacherClassActivities(currentTeacherActivitiesClassId);
    }

  } catch (error) {
    showToast(error.message, "error");
  } finally {
    unlockButton(submitButton);
  }
}

// ============================================================
// ACTIVIDADES POR CORREGIR (dashboard profesor)
// ============================================================

async function loadPendingCorrections() {
  const container = document.getElementById("teacher-activities-dashboard");
  if (!container) return;

  container.innerHTML = "<p>Cargando...</p>";

  try {
    const pending = await api("/api/teachers/" + currentUser.id + "/pending-corrections");

    if (pending.length === 0) {
      container.innerHTML = "<p>No tienes ninguna entrega pendiente de corregir. 🎉</p>";
      return;
    }

    container.innerHTML = "";

    pending.forEach(function (item) {
      const element = document.createElement("div");
      element.className = "plan-item";
      element.innerHTML =
        '<div class="plan-title">📝 ' + item.title + "</div>" +
        '<div class="plan-meta">' + item.course + " " + item.group_name + " · " + item.subject +
          " · Entregado por " + item.name + " " + item.surname + "</div>" +
        '<button type="button" class="secondary-btn" onclick="viewSubmission(' + item.task_id + ", " + item.student_id + ')">📎 Ver entrega</button>';
      container.appendChild(element);
    });

  } catch (error) {
    console.error("Error cargando correcciones pendientes:", error);
    container.innerHTML = "<p>No se pudieron cargar las correcciones pendientes.</p>";
  }
}

// ============================================================
// MÉTRICAS DE ACTIVIDADES (Inicio)
// ============================================================

async function loadTeacherActivities() {
  try {
    const activities = await api("/api/teachers/" + currentUser.id + "/activities");
    teacherActivitiesCache = activities;
    updateTeacherMetrics(activities);
  } catch (error) {
    console.error("Error cargando actividades:", error);
  }
}

function updateTeacherMetrics(activities) {
  function setMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  setMetric("metric-classes", teacherClasses.length);
  setMetric("metric-tasks", activities.filter(function (a) { return a.type === "task"; }).length);
  setMetric("metric-exams", activities.filter(function (a) { return a.type === "exam"; }).length);
  setMetric("metric-projects", activities.filter(function (a) { return a.type === "project"; }).length);
}

// ============================================================
// ACTIVIDADES DE UNA CLASE, POR ESTADO (profesor)
// ============================================================

async function openTeacherClassActivities(classId) {
  currentTeacherActivitiesClassId = classId;
  setActiveView("teacher", "class-activities");

  const classItem = teacherClasses.find(function (c) { return c.id === classId; });
  const titleEl = document.getElementById("teacher-class-activities-title");
  if (titleEl && classItem) {
    titleEl.textContent = classItem.course + " " + classItem.group_name + " — " + classItem.subject;
  }

  const completedEl = document.getElementById("teacher-tasks-completed");
  const pendingEl = document.getElementById("teacher-tasks-pending");
  const scheduledEl = document.getElementById("teacher-scheduled");
  const examsProjectsEl = document.getElementById("teacher-exams-projects");

  [completedEl, pendingEl, scheduledEl, examsProjectsEl].forEach(function (el) {
    if (el) el.innerHTML = "<p>Cargando...</p>";
  });

  const activityClassSelect = document.getElementById("activity-class");
  if (activityClassSelect) {
    activityClassSelect.value = String(classId);
    handleActivityClassChange({ target: activityClassSelect });
  }

  try {
    const data = await api("/api/classes/" + classId + "/activities-status");

    function renderActivity(item) {
      let typeLabel = "TAREA";
      if (item.type === "exam") typeLabel = "EXAMEN";
      else if (item.type === "project") typeLabel = "PROYECTO";

      const dateField = item.type === "exam" ? item.exam_date : item.due_date;
      const categoryLabel = item.category_name ? (" · " + item.category_name) : "";

      let extra = "";
      if (item.type === "task" && item.total_students > 0) {
        extra += '<div class="plan-meta">' + item.completed_count + " de " + item.total_students + " alumnos la han hecho</div>";
      }
      if (item.publish_date) {
        extra += '<div class="plan-meta">🕓 Se publica el ' + item.publish_date + "</div>";
      }

      return (
        '<div class="plan-item">' +
          '<div class="plan-title">' + typeLabel + " · " + item.title + "</div>" +
          '<div class="plan-meta">' + dateField + categoryLabel + "</div>" +
          extra +
          '<button type="button" class="secondary-btn danger-btn" onclick="deleteActivity(\'' + item.type + "', " + item.id + ')">🗑️ Eliminar</button>' +
        "</div>"
      );
    }

    function fill(target, list, emptyText) {
      if (!target) return;
      if (list.length === 0) {
        target.innerHTML = "<p>" + emptyText + "</p>";
        return;
      }
      target.innerHTML = list.map(renderActivity).join("");
    }

    fill(completedEl, data.tasks_completed, "Ninguna tarea completada por todos todavía.");
    fill(pendingEl, data.tasks_pending, "No hay tareas pendientes.");
    fill(scheduledEl, data.scheduled, "No hay nada programado.");
    fill(examsProjectsEl, data.exams_projects, "Aún no hay exámenes ni proyectos.");

  } catch (error) {
    showToast(error.message, "error");
  }
}
window.openTeacherClassActivities = openTeacherClassActivities;

async function deleteActivity(type, id) {
  const confirmed = await showConfirm("¿Seguro que quieres eliminar esta actividad? Esta acción no se puede deshacer.");
  if (!confirmed) return;

  const endpoints = {
    task: "/api/tasks/" + id,
    exam: "/api/exams/" + id,
    project: "/api/projects/" + id
  };

  try {
    await api(endpoints[type] + "?teacher_id=" + currentUser.id, { method: "DELETE" });
    await loadTeacherActivities();
    if (currentTeacherActivitiesClassId) {
      await openTeacherClassActivities(currentTeacherActivitiesClassId);
    }
  } catch (error) {
    showToast(error.message, "error");
  }
}
window.deleteActivity = deleteActivity;

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
    const tasks = await api("/api/classes/" + classId + "/tasks");

    if (tasks.length === 0) {
      container.innerHTML = "<p>Esta clase todavía no tiene tareas.</p>";
      return;
    }

    tasks.forEach(function (task) {
      const item = document.createElement("div");
      item.className = "plan-item";
      item.innerHTML =
        '<div class="plan-title">' + task.title + "</div>" +
        '<div class="plan-meta">Entrega: ' + task.due_date + "</div>" +
        '<button type="button" class="secondary-btn" onclick="loadTaskProgress(' + classId + ", " + task.id + ')">Ver quién la ha hecho</button>' +
        '<div id="progress-result-' + task.id + '"></div>';
      container.appendChild(item);
    });

  } catch (error) {
    console.error("Error cargando tareas para seguimiento:", error);
    container.innerHTML = "<p>No se pudieron cargar las tareas de esta clase.</p>";
  }
}

async function loadTaskProgress(classId, taskId) {
  const resultContainer = document.getElementById("progress-result-" + taskId);
  if (!resultContainer) return;

  resultContainer.innerHTML = "<p>Cargando...</p>";

  try {
    const students = await api("/api/classes/" + classId + "/tasks/" + taskId + "/progress");

    if (students.length === 0) {
      resultContainer.innerHTML = "<p>Esta clase todavía no tiene alumnos.</p>";
      return;
    }

    resultContainer.innerHTML = students.map(function (student) {
      return '<div class="progress-row">' + (student.completed ? "✅" : "⬜") + " " + student.name + " " + student.surname + "</div>";
    }).join("");

  } catch (error) {
    console.error("Error cargando el seguimiento:", error);
    resultContainer.innerHTML = "<p>No se pudo cargar el seguimiento.</p>";
  }
}
window.loadTaskProgress = loadTaskProgress;

// ============================================================
// TABLA DE NOTAS DEL PROFESOR (gradebook)
// ============================================================

async function handleGradebookClassChange(event) {
  const classId = event.target.value;
  const container = document.getElementById("gradebook-table-container");
  if (!container) return;

  container.innerHTML = "";
  if (!classId) return;

  container.innerHTML = "<p>Cargando...</p>";

  try {
    const data = await api("/api/classes/" + classId + "/gradebook");
    renderGradebook(container, classId, data);
  } catch (error) {
    container.innerHTML = "<p>No se pudo cargar la tabla de notas.</p>";
  }
}

function renderGradebook(container, classId, data) {
  if (data.activities.length === 0) {
    container.innerHTML = "<p>Esta clase todavía no tiene actividades.</p>";
    return;
  }

  if (data.students.length === 0) {
    container.innerHTML = "<p>Esta clase todavía no tiene alumnos.</p>";
    return;
  }

  let html = '<div class="gradebook-scroll"><table class="gradebook-table"><thead><tr><th>Alumno</th>';

  data.activities.forEach(function (activity) {
    const icon = activity.type === "task" ? "📝" : (activity.type === "exam" ? "📚" : "🗂️");
    const percentageLabel = (activity.category_percentage !== null && activity.category_percentage !== undefined)
      ? ("<small>" + activity.category_percentage + "%</small>")
      : "<small>—</small>";
    html += "<th>" + icon + " " + activity.title + percentageLabel + "</th>";
  });

  html += "<th>Media</th></tr></thead><tbody>";

  data.students.forEach(function (student) {
    html += "<tr><td>" + student.surname + ", " + student.name + "</td>";

    data.activities.forEach(function (activity) {
      const key = activity.type + "-" + activity.id;
      const cell = student.grades[key] || {};
      const gradeValue = (cell.grade !== null && cell.grade !== undefined) ? cell.grade : "";
      const fileButton = cell.has_file
        ? '<button type="button" class="gradebook-file-btn" onclick="viewSubmission(' + activity.id + ", " + student.student_id + ')" title="Ver archivo entregado">📎</button>'
        : "";

      html +=
        "<td>" +
          '<input type="number" min="0" max="10" step="0.1" class="gradebook-input" value="' + gradeValue + '" ' +
          'data-type="' + activity.type + '" data-activity="' + activity.id + '" data-student="' + student.student_id + '" ' +
          'onchange="handleGradeChange(this)">' +
          fileButton +
        "</td>";
    });

    const averageText = (student.average !== null && student.average !== undefined)
      ? student.average.toFixed(2)
      : "—";

    html += "<td><strong>" + averageText + "</strong></td></tr>";
  });

  html += "</tbody></table></div>";

  container.innerHTML = html;
}

async function handleGradeChange(input) {
  if (input.value === "") return;

  const grade = Number(input.value);

  if (isNaN(grade) || grade < 0 || grade > 10) {
    showToast("La nota debe estar entre 0 y 10.", "error");
    return;
  }

  try {
    await api("/api/grades", {
      method: "POST",
      body: JSON.stringify({
        activity_type: input.dataset.type,
        activity_id: Number(input.dataset.activity),
        student_id: Number(input.dataset.student),
        grade: grade
      })
    });

    showToast("Nota guardada.", "success");

  } catch (error) {
    showToast(error.message, "error");
  }
}
window.handleGradeChange = handleGradeChange;

async function viewSubmission(taskId, studentId) {
  try {
    const file = await api("/api/tasks/" + taskId + "/submissions/" + studentId + "/file");
    const dataUrl = "data:" + file.file_type + ";base64," + file.file_data;

    const newWindow = window.open();
    if (!newWindow) {
      showToast("Tu navegador ha bloqueado la ventana. Permite ventanas emergentes para KAIRO.", "error");
      return;
    }

    if (file.file_type.indexOf("image/") === 0) {
      newWindow.document.write(
        "<title>" + file.file_name + "</title>" +
        '<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;">' +
          '<img src="' + dataUrl + '" style="max-width:100%;max-height:100%;">' +
        "</body>"
      );
    } else {
      newWindow.document.write(
        "<title>" + file.file_name + "</title>" +
        '<body style="font-family:sans-serif;padding:40px;">' +
          "<p>Archivo entregado: <strong>" + file.file_name + "</strong></p>" +
          '<a href="' + dataUrl + '" download="' + file.file_name + '">⬇️ Descargar archivo</a>' +
        "</body>"
      );
    }

  } catch (error) {
    showToast(error.message, "error");
  }
}
window.viewSubmission = viewSubmission;

// ============================================================
// DASHBOARD ALUMNO
// ============================================================

async function loadStudentDashboard() {
  const welcome = document.getElementById("student-welcome");
  if (welcome) welcome.textContent = "Hola, " + currentUser.name + ".";

  await loadStudentClasses();
  await loadStudentPlan();

  startAutoRefresh();
}

let planRefreshInterval = null;

function startAutoRefresh() {
  if (planRefreshInterval) {
    clearInterval(planRefreshInterval);
  }

  planRefreshInterval = setInterval(function () {
    if (currentUser && selectedRole === "student") {
      loadStudentPlan();
    }
  }, 20000);
}

async function loadStudentClasses() {
  const classes = await api("/api/students/" + currentUser.id + "/classes");
  studentClassesCache = classes;

  const container = document.getElementById("student-classes");
  const homeContainer = document.getElementById("student-classes-home");

  const metricClasses = document.getElementById("metric-student-classes");
  if (metricClasses) metricClasses.textContent = classes.length;

  function renderCards(target) {
    if (!target) return;
    target.innerHTML = "";

    if (classes.length === 0) {
      target.innerHTML = "<p>Aún no perteneces a ninguna clase.</p>";
      return;
    }

    classes.forEach(function (classItem) {
      const card = document.createElement("div");
      card.className = "class-card";
      card.style.cursor = "pointer";
      card.addEventListener("click", function () {
        openClassDetail(classItem.id);
      });
      card.innerHTML =
        "<h4>" + classItem.course + " " + classItem.group_name + " — " + classItem.subject + "</h4>" +
        "<p>Profesor: " + classItem.teacher_name + " " + classItem.teacher_surname + "</p>";
      target.appendChild(card);
    });
  }

  renderCards(container);
  renderCards(homeContainer);
}

async function handleJoinClass(event) {
  event.preventDefault();
  const submitButton = lockButton(event.target);

  const codeEl = document.getElementById("join-code");
  const code = codeEl ? codeEl.value.trim().toUpperCase() : "";

  if (!code) {
    showToast("Introduce el código de la clase.", "error");
    unlockButton(submitButton);
    return;
  }

  try {
    await api("/api/classes/join", {
      method: "POST",
      body: JSON.stringify({ student_id: currentUser.id, code: code })
    });

    showToast("Te has unido a la clase correctamente.", "success");
    event.target.reset();
    const modal = document.getElementById("modal-join-class");
    if (modal) modal.close();

    await loadStudentDashboard();

  } catch (error) {
    showToast(error.message, "error");
  } finally {
    unlockButton(submitButton);
  }
}

// ============================================================
// VISTA DE DETALLE DE UNA CLASE (alumno)
// ============================================================

async function openClassDetail(classId) {
  currentClassDetailId = classId;
  setActiveView("student", "class-detail");

  const titleEl = document.getElementById("class-detail-title");
  const teacherEl = document.getElementById("class-detail-teacher");
  const rosterEl = document.getElementById("class-detail-roster");
  const activitiesEl = document.getElementById("class-detail-activities");

  if (titleEl) titleEl.textContent = "Cargando...";
  if (teacherEl) teacherEl.textContent = "";
  if (rosterEl) rosterEl.innerHTML = "";
  if (activitiesEl) activitiesEl.innerHTML = "<p>Cargando...</p>";

  try {
    const roster = await api("/api/classes/" + classId + "/roster");
    const view = await api("/api/classes/" + classId + "/student-view?student_id=" + currentUser.id);

    if (titleEl) titleEl.textContent = roster.class.course + " " + roster.class.group_name + " — " + roster.class.subject;
    if (teacherEl) teacherEl.textContent = "Profesor: " + roster.teacher.name + " " + roster.teacher.surname;

    if (rosterEl) {
      const others = roster.students.filter(function (s) { return s.id !== currentUser.id; });
      if (others.length === 0) {
        rosterEl.innerHTML = "<p>Todavía no hay más alumnos en esta clase.</p>";
      } else {
        rosterEl.innerHTML = others.map(function (s) {
          return '<div class="progress-row">👤 ' + s.name + " " + s.surname + "</div>";
        }).join("");
      }
    }

    renderClassDetailActivities(activitiesEl, view);

  } catch (error) {
    showToast(error.message, "error");
  }
}
window.openClassDetail = openClassDetail;

function renderClassDetailActivities(container, view) {
  if (!container) return;

  const items = [];

  view.tasks.forEach(function (task) {
    const copy = {};
    for (const k in task) copy[k] = task[k];
    copy.type = "task";
    items.push(copy);
  });

  view.exams.forEach(function (exam) {
    const copy = {};
    for (const k in exam) copy[k] = exam[k];
    copy.type = "exam";
    copy.due_date = exam.exam_date;
    items.push(copy);
  });

  view.projects.forEach(function (project) {
    const copy = {};
    for (const k in project) copy[k] = project[k];
    copy.type = "project";
    items.push(copy);
  });

  items.sort(function (a, b) {
    return a.due_date > b.due_date ? 1 : -1;
  });

  if (items.length === 0) {
    container.innerHTML = "<p>Esta clase todavía no tiene actividades.</p>";
    return;
  }

  container.innerHTML = "";

  items.forEach(function (item) {
    const element = document.createElement("div");
    element.className = "plan-item";

    let typeLabel = "TAREA";
    if (item.type === "exam") typeLabel = "EXAMEN";
    else if (item.type === "project") typeLabel = "PROYECTO";

    const categoryLabel = item.category_name ? (item.category_name + " · ") : "";

    let actionsHtml = "";
    if (item.type === "task") {
      const doneLabel = item.completed ? "✅ Hecha" : "✅ Marcar como hecha";
      actionsHtml =
        '<button type="button" class="secondary-btn" ' + (item.completed ? "disabled" : "") + ' onclick="markTaskCompleteInDetail(' + item.id + ')">' + doneLabel + "</button>" +
        '<button type="button" class="secondary-btn" onclick="triggerFileSubmit(' + item.id + ')">' + (item.has_submission ? "📎 Archivo entregado (cambiar)" : "📎 Entregar archivo") + "</button>" +
        '<input type="file" id="submit-file-input-' + item.id + '" class="hidden" onchange="handleFileSubmit(' + item.id + ', this)">';
    }

    element.innerHTML =
      '<div class="plan-title">' + typeLabel + " · " + item.title + "</div>" +
      '<div class="plan-meta">' + categoryLabel + "Fecha: " + item.due_date + "</div>" +
      actionsHtml;
    container.appendChild(element);
  });
}

async function markTaskCompleteInDetail(taskId) {
  try {
    await api("/api/tasks/" + taskId + "/complete", {
      method: "POST",
      body: JSON.stringify({ student_id: currentUser.id })
    });
    showToast("Tarea marcada como hecha.", "success");
    if (currentClassDetailId) await openClassDetail(currentClassDetailId);
  } catch (error) {
    showToast(error.message, "error");
  }
}
window.markTaskCompleteInDetail = markTaskCompleteInDetail;

async function markTaskComplete(taskId) {
  try {
    await api("/api/tasks/" + taskId + "/complete", {
      method: "POST",
      body: JSON.stringify({ student_id: currentUser.id })
    });
    await loadStudentPlan();
  } catch (error) {
    showToast(error.message, "error");
  }
}
window.markTaskComplete = markTaskComplete;

// ============================================================
// ENTREGA DE ARCHIVOS (alumno)
// ============================================================

function triggerFileSubmit(taskId) {
  const input = document.getElementById("submit-file-input-" + taskId);
  if (input) input.click();
}
window.triggerFileSubmit = triggerFileSubmit;

async function handleFileSubmit(taskId, input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_BYTES) {
    showToast("El archivo es demasiado grande. El máximo son unos 4 MB.", "error");
    input.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async function () {
    const base64 = reader.result.split(",")[1];

    try {
      await api("/api/tasks/" + taskId + "/submit", {
        method: "POST",
        body: JSON.stringify({
          student_id: currentUser.id,
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
          file_data: base64
        })
      });

      showToast("Archivo entregado correctamente.", "success");

      if (currentClassDetailId) {
        await openClassDetail(currentClassDetailId);
      } else {
        await loadStudentPlan();
      }

    } catch (error) {
      showToast(error.message, "error");
    }
  };

  reader.onerror = function () {
    showToast("No se pudo leer el archivo.", "error");
  };

  reader.readAsDataURL(file);
}
window.handleFileSubmit = handleFileSubmit;

async function loadStudentPlan() {
  const container = document.getElementById("student-plan");

  if (container) container.innerHTML = "<p>KAIRO está pensando...</p>";

  try {
    const result = await api("/api/students/" + currentUser.id + "/plan");
    studentPlanCache = result.plan || [];

    updateStudentMetrics(studentPlanCache);

    const emptyHtml =
      '<div class="plan-item">' +
        '<div class="plan-title">No hay nada que organizar.</div>' +
        '<div class="plan-meta">Cuando tus profesores introduzcan tareas, exámenes o proyectos, KAIRO construirá tu plan.</div>' +
      "</div>";

    function renderList(target, items) {
      if (!target) return;
      target.innerHTML = "";

      if (items.length === 0) {
        target.innerHTML = emptyHtml;
        return;
      }

      items.forEach(function (item) {
        const element = document.createElement("div");
        element.className = "plan-item priority-" + (item.priority || "media").toLowerCase();

        const label = item.mandatory ? "🔴 OBLIGATORIO" : "🟢 RECOMENDADO";

        let typeLabel = "TAREA";
        if (item.type === "exam_preparation") typeLabel = "PREPARACIÓN DE EXAMEN";
        else if (item.type === "project") typeLabel = "PROYECTO";

        const doneButton = item.type === "task"
          ? '<button type="button" class="secondary-btn" onclick="markTaskComplete(' + item.id + ')">✅ Marcar como hecha</button>'
          : "";

        const submitButtonHtml = item.type === "task"
          ? '<button type="button" class="secondary-btn" onclick="triggerFileSubmit(' + item.id + ')">📎 Entregar archivo</button>' +
            '<input type="file" id="submit-file-input-' + item.id + '" class="hidden" onchange="handleFileSubmit(' + item.id + ', this)">'
          : "";

        element.innerHTML =
          '<div class="plan-title">' + label + " · " + typeLabel + "<br>" + item.title + "</div>" +
          '<div class="plan-meta">' + item.subject + " · " + formatDays(item.days_left) + " · Importancia: " + item.priority + "</div>" +
          doneButton +
          submitButtonHtml;
        target.appendChild(element);
      });
    }

    renderList(container, studentPlanCache);

  } catch (error) {
    console.error("Error generando el plan:", error);
    if (container) {
      container.innerHTML =
        '<div class="plan-item">' +
          '<div class="plan-title">No se ha podido generar el plan de KAIRO.</div>' +
          '<div class="plan-meta">Comprueba que el servidor de KAIRO está funcionando.</div>' +
        "</div>";
    }
  }
}

function updateStudentMetrics(plan) {
  function setMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  setMetric("metric-student-pending", plan.length);
  setMetric("metric-student-exams", plan.filter(function (item) { return item.type === "exam_preparation"; }).length);
}

function formatDays(days) {
  if (days < 0) return "ATRASADO";
  if (days === 0) return "HOY";
  if (days === 1) return "MAÑANA";
  return "En " + days + " días";
}

// ============================================================
// NOTAS DEL ALUMNO
// ============================================================

async function loadStudentGrades() {
  const container = document.getElementById("student-grades");
  if (!container) return;

  container.innerHTML = "<p>Cargando notas...</p>";

  try {
    const classesGrades = await api("/api/students/" + currentUser.id + "/grades");

    if (classesGrades.length === 0) {
      container.innerHTML = "<p>Aún no perteneces a ninguna clase.</p>";
      return;
    }

    container.innerHTML = "";

    classesGrades.forEach(function (classData) {
      const card = document.createElement("div");
      card.className = "panel";

      const currentText = classData.current_average !== null
        ? classData.current_average.toFixed(2)
        : "—";
      const projectedText = classData.projected_average !== null
        ? classData.projected_average.toFixed(2)
        : "—";

      let categoriesHtml = "";

      classData.categories.forEach(function (category) {
        const avgText = category.average !== null
          ? category.average.toFixed(2)
          : "Sin notas todavía";

        let activitiesHtml = "";

        category.activities.forEach(function (activity) {
          const gradeText = activity.grade !== null ? activity.grade : "—";
          let typeLabel = "Tarea";
          if (activity.type === "exam") typeLabel = "Examen";
          else if (activity.type === "project") typeLabel = "Proyecto";

          activitiesHtml +=
            '<div class="progress-row">' +
              typeLabel + " · " + activity.title + ": <strong>&nbsp;" + gradeText + "</strong>" +
            "</div>";
        });

        if (activitiesHtml === "") {
          activitiesHtml = '<div class="progress-row">Todavía no hay actividades en esta categoría.</div>';
        }

        categoriesHtml +=
          '<details class="grades-details plan-item">' +
            "<summary>" + category.name + " (" + category.percentage + "%) — Media: " + avgText + "</summary>" +
            '<div style="margin-top: 10px;">' + activitiesHtml + "</div>" +
          "</details>";
      });

      card.innerHTML =
        "<h2>" + classData.course + " " + classData.group_name + " — " + classData.subject + "</h2>" +
        '<div class="grade-summary-grid">' +
          '<div class="metric-card">' +
            '<div class="metric-value">' + currentText + "</div>" +
            '<div class="metric-label">Nota media actual</div>' +
          "</div>" +
          '<div class="metric-card">' +
            '<div class="metric-value">' + projectedText + "</div>" +
            '<div class="metric-label">Proyección si sigues así</div>' +
          "</div>" +
        "</div>" +
        categoriesHtml;

      container.appendChild(card);
    });

  } catch (error) {
    console.error("Error cargando notas:", error);
    container.innerHTML = "<p>No se pudieron cargar las notas.</p>";
  }
}

// ============================================================
// CALENDARIO Y CARGA ACADÉMICA
// ============================================================

function countActivitiesByDay(activities) {
  const counts = {};
  activities.forEach(function (item) {
    if (!item.date) return;
    counts[item.date] = (counts[item.date] || 0) + 1;
  });
  return counts;
}

function loadLevelForCount(count) {
  if (count >= 3) return "alta";
  if (count === 2) return "media";
  if (count === 1) return "baja";
  return "ninguna";
}

function dotClassForLevel(level) {
  if (level === "alta") return "dot-alta";
  if (level === "media") return "dot-media";
  if (level === "baja") return "dot-baja";
  return "dot-none";
}

async function ensureCalendarData(role) {
  if (calendarDataCache[role]) return calendarDataCache[role];

  const url = role === "teacher"
    ? "/api/teachers/" + currentUser.id + "/calendar"
    : "/api/students/" + currentUser.id + "/calendar";

  const data = await api(url);
  calendarDataCache[role] = data;
  return data;
}

async function openCalendarView(role) {
  await ensureCalendarData(role);
  renderCalendarGrid(role);
}

function navigateCalendarMonth(role, direction) {
  const current = calendarViewMonth[role];
  calendarViewMonth[role] = new Date(current.getFullYear(), current.getMonth() + direction, 1);
  renderCalendarGrid(role);
}
window.navigateCalendarMonth = navigateCalendarMonth;

function renderCalendarGrid(role) {
  const activities = calendarDataCache[role] || [];
  const counts = countActivitiesByDay(activities);

  const monthDate = calendarViewMonth[role];
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const monthLabel = document.getElementById(role + "-calendar-month-label");
  if (monthLabel) {
    monthLabel.textContent = monthDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }

  const grid = document.getElementById(role + "-calendar-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayStr = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day calendar-day-empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const count = counts[dateStr] || 0;
    const level = loadLevelForCount(count);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    if (dateStr === todayStr) cell.classList.add("calendar-day-today");
    if (dateStr === calendarSelectedDate[role]) cell.classList.add("calendar-day-selected");

    cell.innerHTML = "<span>" + day + "</span><span class='dot " + dotClassForLevel(level) + "'></span>";
    cell.addEventListener("click", function () {
      selectCalendarDay(role, dateStr);
    });

    grid.appendChild(cell);
  }

  if (!calendarSelectedDate[role]) {
    const defaultDate = (year === new Date().getFullYear() && month === new Date().getMonth())
      ? todayStr
      : (year + "-" + String(month + 1).padStart(2, "0") + "-01");
    selectCalendarDay(role, defaultDate);
  } else {
    renderCalendarDayDetail(role, calendarSelectedDate[role]);
  }
}

function selectCalendarDay(role, dateStr) {
  calendarSelectedDate[role] = dateStr;
  renderCalendarGrid(role);
  renderCalendarDayDetail(role, dateStr);
}

function renderCalendarDayDetail(role, dateStr) {
  const activities = calendarDataCache[role] || [];
  const dayActivities = activities.filter(function (item) { return item.date === dateStr; });

  const titleEl = document.getElementById(role + "-calendar-day-title");
  const detailEl = document.getElementById(role + "-calendar-day-detail");
  if (!detailEl) return;

  const dateObj = new Date(dateStr + "T00:00:00");
  if (titleEl) {
    titleEl.textContent = dateObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  }

  if (dayActivities.length === 0) {
    detailEl.innerHTML = "<p>Día libre.</p>";
    return;
  }

  detailEl.innerHTML = dayActivities.map(function (item) {
    let typeLabel = "📝 Tarea";
    if (item.type === "exam") typeLabel = "📚 Examen";
    else if (item.type === "project") typeLabel = "🗂️ Proyecto";

    return (
      '<div class="plan-item">' +
        '<div class="plan-title">' + typeLabel + " · " + item.title + "</div>" +
        '<div class="plan-meta">' + item.course + " " + item.group_name + " · " + item.subject + "</div>" +
      "</div>"
    );
  }).join("");
}

async function openWorkloadView(role) {
  await ensureCalendarData(role);
  renderWorkload(role);
}

function renderWorkload(role) {
  const activities = calendarDataCache[role] || [];
  const counts = countActivitiesByDay(activities);

  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);

  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const weekDays = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = counts[dateStr] || 0;
    weekDays.push({ label: dayNames[i] + " " + d.getDate(), count: count, level: loadLevelForCount(count) });
  }

  const daysContainer = document.getElementById(role + "-workload-days");
  if (daysContainer) {
    daysContainer.innerHTML = weekDays.map(function (day) {
      const barColor = day.level === "alta" ? "var(--danger)" : (day.level === "media" ? "var(--warning)" : "var(--success)");
      const widthPercent = Math.min(day.count, 4) / 4 * 100;
      const levelText = day.count === 0 ? "sin actividades" : day.level;

      return (
        '<div class="workload-day-row">' +
          "<span>" + day.label + "</span>" +
          '<div class="workload-bar-track"><div class="workload-bar-fill" style="width:' + widthPercent + '%; background:' + barColor + ';"></div></div>' +
          "<span>" + levelText + "</span>" +
        "</div>"
      );
    }).join("");
  }

  const maxLevel = weekDays.reduce(function (acc, day) {
    const order = { ninguna: 0, baja: 1, media: 2, alta: 3 };
    return order[day.level] > order[acc] ? day.level : acc;
  }, "ninguna");

  const summaryEl = document.getElementById(role + "-workload-summary");
  if (summaryEl) {
    let message = "Semana sin actividades registradas.";
    if (maxLevel === "alta") message = "Esta semana tienes días con carga alta. Organiza bien tu tiempo.";
    else if (maxLevel === "media") message = "Esta semana tienes carga moderada. Vas bien, sigue así.";
    else if (maxLevel === "baja") message = "Semana tranquila, buen momento para adelantar trabajo.";

    summaryEl.innerHTML =
      '<div style="width:28px;height:28px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;color:#06070a;flex-shrink:0;">K</div>' +
      '<div><strong>Análisis KAIRO</strong><div class="plan-meta">' + message + "</div></div>";
  }
}
