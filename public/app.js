const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view");
const dashboardView = $("#dashboard-view");
const authMessage = $("#auth-message");
const notice = $("#notice");
const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
let csrf = "";
let user = null;
let categories = [];
let transactions = [];
let editingTransactionId = null;
let editingCategoryId = null;
let noticeTimer;

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonth() { return localDate().slice(0, 7); }

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove("visible"), 3800);
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method || "GET")) headers.set("X-CSRF-Token", csrf);
  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 401 && user) await showAuth();
    throw new Error(payload?.error || "Không thể hoàn thành yêu cầu.");
  }
  return payload;
}

async function refreshCsrf() {
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!response.ok) throw new Error("Không thể khởi tạo phiên làm việc.");
  csrf = (await response.json()).csrfToken;
}

function setAuthMode(mode) {
  const register = mode === "register";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#auth-heading").textContent = register ? "Tạo tài khoản của bạn" : "Chào mừng bạn trở lại";
  $("#auth-description").textContent = register ? "Mật khẩu tối thiểu 10 ký tự. Tài khoản của bạn được bảo vệ riêng." : "Đăng nhập để xem sổ thu chi của bạn.";
  $("#auth-submit").textContent = register ? "Tạo tài khoản" : "Đăng nhập";
  $("#auth-password").autocomplete = register ? "new-password" : "current-password";
  $("#auth-password").minLength = register ? 10 : 1;
  $("#password-help").classList.toggle("hidden", !register);
  authMessage.textContent = "";
}

function showDashboard() {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  $("#account-actions").classList.remove("hidden");
  $("#user-email").textContent = user.email;
  $("#month-filter").value ||= currentMonth();
  $("#transaction-date").value ||= localDate();
}

async function showAuth() {
  user = null;
  dashboardView.classList.add("hidden");
  authView.classList.remove("hidden");
  $("#account-actions").classList.add("hidden");
  try { await refreshCsrf(); } catch { /* The next request will retry the session bootstrap. */ }
}

function fillSelect(select, options, placeholder) {
  const old = select.value;
  select.replaceChildren();
  if (placeholder) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    select.append(option);
  }
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  });
  if ([...select.options].some((option) => option.value === old)) select.value = old;
}

function renderCategorySelects() {
  const type = $("#transaction-type").value;
  fillSelect($("#transaction-category"), categories.filter((category) => category.type === type), "Chọn danh mục");
  fillSelect($("#category-filter"), categories, "Tất cả danh mục");
}

function renderCategories() {
  const list = $("#category-list");
  list.replaceChildren();
  categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "category-row";
    const name = document.createElement("span");
    name.className = "category-row-name";
    name.textContent = `${category.type === "income" ? "Thu" : "Chi"} · ${category.name}`;
    const actions = document.createElement("div");
    actions.className = "category-row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.textContent = "Sửa";
    edit.setAttribute("aria-label", `Sửa danh mục ${category.name}`);
    edit.addEventListener("click", () => beginCategoryEdit(category));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button danger";
    remove.textContent = "Xóa";
    remove.setAttribute("aria-label", `Xóa danh mục ${category.name}`);
    remove.addEventListener("click", () => deleteCategory(category));
    actions.append(edit, remove);
    row.append(name, actions);
    list.append(row);
  });
  renderCategorySelects();
}

function beginCategoryEdit(category) {
  editingCategoryId = category.id;
  $("#category-name").value = category.name;
  $("#category-type").value = category.type;
  $("#category-type").disabled = true;
  $("#category-submit").textContent = "Lưu";
  $("#category-cancel").classList.remove("hidden");
  $("#category-name").focus();
}

function clearCategoryEdit() {
  editingCategoryId = null;
  $("#category-form").reset();
  $("#category-type").disabled = false;
  $("#category-submit").textContent = "Thêm";
  $("#category-cancel").classList.add("hidden");
}

function drawDailyChart(rows) {
  const canvas = $("#daily-chart");
  const empty = $("#daily-chart-empty");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const active = rows.filter((row) => Number(row.income) || Number(row.expense));
  empty.classList.toggle("hidden", active.length > 0);
  if (!active.length) return;
  const max = Math.max(1, ...active.flatMap((row) => [Number(row.income), Number(row.expense)]));
  const top = 15, bottom = 28, chartHeight = rect.height - top - bottom;
  const groupWidth = rect.width / active.length;
  const barWidth = Math.max(2, Math.min(12, groupWidth * .28));
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  active.forEach((row, index) => {
    const x = index * groupWidth + groupWidth / 2;
    const incomeHeight = Math.max(1, Number(row.income) / max * chartHeight);
    const expenseHeight = Math.max(1, Number(row.expense) / max * chartHeight);
    ctx.fillStyle = "#449a70";
    ctx.fillRect(x - barWidth - 1, top + chartHeight - incomeHeight, barWidth, incomeHeight);
    ctx.fillStyle = "#d47a5b";
    ctx.fillRect(x + 1, top + chartHeight - expenseHeight, barWidth, expenseHeight);
    if (active.length <= 16 || index % 3 === 0) {
      ctx.fillStyle = "#87938b";
      ctx.fillText(String(Number(row.date.slice(-2))), x, rect.height - 8);
    }
  });
}

function drawCategoryChart(rows) {
  const canvas = $("#category-chart");
  const empty = $("#category-chart-empty");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);
  empty.classList.toggle("hidden", rows.length > 0);
  if (!rows.length) return;
  const colors = ["#24745b", "#3e9271", "#79ad83", "#c79a55", "#d47a5b", "#b85e4c", "#8296a8", "#9b8caf"];
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0) || 1;
  const cx = Math.min(rect.width * .34, 95), cy = rect.height / 2, radius = Math.min(76, rect.height * .36);
  let start = -Math.PI / 2;
  rows.forEach((row, index) => {
    const end = start + (Number(row.total) / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath();
    ctx.fillStyle = colors[index % colors.length]; ctx.fill(); start = end;
  });
  ctx.beginPath(); ctx.arc(cx, cy, radius * .56, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  const startX = Math.min(rect.width * .61, 180);
  ctx.font = "11px system-ui";
  rows.slice(0, 6).forEach((row, index) => {
    const y = 22 + index * 30;
    ctx.fillStyle = colors[index % colors.length]; ctx.fillRect(startX, y - 8, 8, 8);
    ctx.fillStyle = "#5d6b62"; ctx.textAlign = "left";
    const label = row.name.length > 15 ? `${row.name.slice(0, 14)}…` : row.name;
    ctx.fillText(label, startX + 14, y);
  });
}

function renderTransactions() {
  const list = $("#transaction-list");
  list.replaceChildren();
  const type = $("#type-filter").value;
  const categoryId = $("#category-filter").value;
  const visible = transactions.filter((transaction) => (!type || transaction.type === type) && (!categoryId || transaction.category_id === categoryId));
  $("#transaction-empty").classList.toggle("hidden", visible.length > 0);
  visible.forEach((transaction) => {
    const row = document.createElement("article");
    row.className = "transaction-row";
    const date = document.createElement("time");
    date.className = "transaction-date";
    date.dateTime = transaction.transaction_date;
    date.textContent = shortDate.format(new Date(`${transaction.transaction_date}T00:00:00Z`));
    const description = document.createElement("div");
    description.className = "transaction-description";
    const title = document.createElement("strong");
    title.textContent = transaction.description || transaction.category_name;
    const subtitle = document.createElement("small");
    subtitle.textContent = transaction.description ? transaction.category_name : (transaction.type === "income" ? "Thu nhập" : "Chi tiêu");
    description.append(title, subtitle);
    const pill = document.createElement("span");
    pill.className = `type-pill ${transaction.type}`;
    pill.textContent = transaction.type === "income" ? "Thu nhập" : "Chi tiêu";
    const amount = document.createElement("strong");
    amount.className = `transaction-amount ${transaction.type}`;
    amount.textContent = `${transaction.type === "income" ? "+" : "−"}${vnd.format(Number(transaction.amount))}`;
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.className = "text-button"; edit.type = "button"; edit.textContent = "Sửa";
    edit.setAttribute("aria-label", `Sửa giao dịch ${transaction.description || transaction.category_name}`);
    edit.addEventListener("click", () => beginTransactionEdit(transaction));
    const remove = document.createElement("button");
    remove.className = "text-button danger"; remove.type = "button"; remove.textContent = "Xóa";
    remove.setAttribute("aria-label", `Xóa giao dịch ${transaction.description || transaction.category_name}`);
    remove.addEventListener("click", () => deleteTransaction(transaction));
    actions.append(edit, remove);
    row.append(date, description, pill, amount, actions);
    list.append(row);
  });
}

function renderDashboard(data) {
  $("#total-income").textContent = vnd.format(data.income);
  $("#total-expense").textContent = vnd.format(data.expense);
  $("#total-balance").textContent = vnd.format(data.balance);
  $("#month-filter").value = data.month;
  drawDailyChart(data.daily);
  drawCategoryChart(data.expenseByCategory);
}

async function loadData() {
  const month = encodeURIComponent($("#month-filter").value || currentMonth());
  const [dashboard, categoryData, transactionData] = await Promise.all([
    api(`/api/dashboard?month=${month}`), api("/api/categories"), api(`/api/transactions?month=${month}`)
  ]);
  categories = categoryData.categories;
  transactions = transactionData.transactions;
  renderDashboard(dashboard);
  renderCategories();
  renderTransactions();
}

function clearTransactionEdit() {
  editingTransactionId = null;
  $("#transaction-form").reset();
  $("#transaction-date").value = localDate();
  $("#transaction-submit").textContent = "Lưu giao dịch";
  $("#transaction-form-title").textContent = "Thêm giao dịch";
  $("#transaction-cancel").classList.add("hidden");
  renderCategorySelects();
}

function beginTransactionEdit(transaction) {
  editingTransactionId = transaction.id;
  $("#transaction-type").value = transaction.type;
  renderCategorySelects();
  $("#transaction-category").value = transaction.category_id;
  $("#transaction-amount").value = transaction.amount;
  $("#transaction-date").value = transaction.transaction_date;
  $("#transaction-description").value = transaction.description || "";
  $("#transaction-submit").textContent = "Lưu thay đổi";
  $("#transaction-form-title").textContent = "Sửa giao dịch";
  $("#transaction-cancel").classList.remove("hidden");
  $("#transaction-form").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteTransaction(transaction) {
  if (!window.confirm("Xóa giao dịch này?")) return;
  try {
    await api(`/api/transactions/${encodeURIComponent(transaction.id)}`, { method: "DELETE" });
    await loadData();
    showNotice("Đã xóa giao dịch.");
  } catch (error) { showNotice(error.message, true); }
}

async function deleteCategory(category) {
  if (!window.confirm(`Xóa danh mục “${category.name}”?`)) return;
  try {
    await api(`/api/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
    await loadData();
    showNotice("Đã xóa danh mục.");
  } catch (error) { showNotice(error.message, true); }
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = document.querySelector("[data-auth-mode].active").dataset.authMode;
  const body = { email: $("#auth-email").value, password: $("#auth-password").value };
  authMessage.textContent = "";
  $("#auth-submit").disabled = true;
  try {
    const result = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
    user = result.user;
    csrf = result.csrfToken;
    $("#auth-form").reset();
    showDashboard();
    await loadData();
    showNotice(mode === "register" ? "Tài khoản đã sẵn sàng. Hãy ghi giao dịch đầu tiên." : "Đăng nhập thành công.");
  } catch (error) { authMessage.textContent = error.message; }
  finally { $("#auth-submit").disabled = false; }
});

$("#logout-button").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await showAuth();
    showNotice("Bạn đã đăng xuất.");
  } catch (error) { showNotice(error.message, true); }
});

$("#month-filter").addEventListener("change", () => loadData().catch((error) => showNotice(error.message, true)));
$("#type-filter").addEventListener("change", renderTransactions);
$("#category-filter").addEventListener("change", renderTransactions);
$("#transaction-type").addEventListener("change", renderCategorySelects);
$("#transaction-cancel").addEventListener("click", clearTransactionEdit);

$("#transaction-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingTransactionId);
  const body = {
    type: $("#transaction-type").value,
    amount: $("#transaction-amount").value,
    categoryId: $("#transaction-category").value,
    transactionDate: $("#transaction-date").value,
    description: $("#transaction-description").value
  };
  try {
    await api(editingTransactionId ? `/api/transactions/${encodeURIComponent(editingTransactionId)}` : "/api/transactions", {
      method: editingTransactionId ? "PUT" : "POST", body: JSON.stringify(body)
    });
    clearTransactionEdit();
    await loadData();
    showNotice(wasEditing ? "Đã cập nhật giao dịch." : "Đã lưu giao dịch.");
  } catch (error) { showNotice(error.message, true); }
});

$("#category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { name: $("#category-name").value, type: $("#category-type").value };
  try {
    await api(editingCategoryId ? `/api/categories/${encodeURIComponent(editingCategoryId)}` : "/api/categories", {
      method: editingCategoryId ? "PUT" : "POST", body: JSON.stringify(body)
    });
    const wasEditing = Boolean(editingCategoryId);
    clearCategoryEdit();
    await loadData();
    showNotice(wasEditing ? "Đã cập nhật danh mục." : "Đã thêm danh mục.");
  } catch (error) { showNotice(error.message, true); }
});

$("#category-cancel").addEventListener("click", clearCategoryEdit);
window.addEventListener("resize", () => {
  if (!dashboardView.classList.contains("hidden")) loadData().catch(() => {});
});

(async function bootstrap() {
  try {
    await refreshCsrf();
    const state = await api("/api/auth/session");
    csrf = state.csrfToken || csrf;
    if (state.authenticated) {
      user = state.user;
      showDashboard();
      await loadData();
    } else {
      authView.classList.remove("hidden");
      setAuthMode("login");
    }
  } catch (error) {
    authView.classList.remove("hidden");
    authMessage.textContent = `Không thể kết nối máy chủ. ${error.message}`;
  }
})();
