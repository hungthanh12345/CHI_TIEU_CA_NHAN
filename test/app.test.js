const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const session = require("express-session");
const {
  parseRegister, parseCategory, parseAmount, parseDate, parseTransaction, parseMonth, ValidationError
} = require("../src/validation");
const { createApp } = require("../src/server");

process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";

const userId = "4e3de190-a882-4fe6-91ea-00b810add854";
const categoryId = "b94792f7-705a-454c-892f-94a730b6f743";
const transactionId = "2b925c72-3c83-46e5-9b0f-13d176f4acb6";

class FakePool {
  constructor() {
    this.user = null;
    this.calls = [];
  }

  async query(sql, params = []) {
    this.calls.push({ sql, params });
    if (sql.includes("INSERT INTO users")) {
      this.user = { id: userId, email: params[0], password_hash: params[1] };
      return { rows: [{ id: userId, email: params[0] }], rowCount: 1 };
    }
    if (sql.includes("SELECT id, email, password_hash FROM users WHERE lower(email) = $1 LIMIT 1")) {
      return { rows: this.user && this.user.email === params[0] ? [this.user] : [], rowCount: this.user && this.user.email === params[0] ? 1 : 0 };
    }
    if (sql.includes("INSERT INTO categories") && sql.includes("RETURNING id, name, type")) {
      return { rows: [{ id: categoryId, name: params[1], type: params[2] }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO categories")) return { rows: [], rowCount: 1 };
    if (sql.includes("SELECT id, email FROM users WHERE id = $1")) {
      return { rows: this.user ? [{ id: this.user.id, email: this.user.email }] : [], rowCount: this.user ? 1 : 0 };
    }
    if (sql.includes("SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND type = $3")) {
      return { rows: [{ id: params[0] }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO transactions")) {
      return { rows: [{ id: transactionId, category_id: params[1], type: params[2], amount: params[3], description: params[4], transaction_date: params[5] }], rowCount: 1 };
    }
    if (sql.includes("SELECT id, name, type FROM categories WHERE user_id = $1")) {
      return { rows: [{ id: categoryId, name: "Ăn uống", type: "expense" }], rowCount: 1 };
    }
    if (sql.trimStart().startsWith("SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income')")) {
      return { rows: [{ income: "1000000.00", expense: "250000.00" }], rowCount: 1 };
    }
    if (sql.includes("SELECT transaction_date::text AS date")) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT c.id, c.name, SUM(t.amount)::text AS total")) return { rows: [], rowCount: 0 };
    if (sql.includes("UPDATE transactions SET") || sql.includes("DELETE FROM transactions WHERE")) return { rows: [], rowCount: 0 };
    if (sql.includes("UPDATE categories SET") || sql.includes("DELETE FROM categories WHERE")) return { rows: [], rowCount: 0 };
    if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
}

function cookieValue(response) {
  return response.headers.getSetCookie().at(0)?.split(";")[0] || "";
}

async function startTestServer(t) {
  const pool = new FakePool();
  const app = createApp({ pool, sessionStore: new session.MemoryStore() });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { pool, base: `http://127.0.0.1:${server.address().port}` };
}

test("validation accepts normalized input and rejects invalid dates, amounts, and ownership identifiers", () => {
  assert.deepEqual(parseRegister({ email: "  USER@Example.COM ", password: "very-secure-password" }), {
    email: "user@example.com", password: "very-secure-password"
  });
  assert.throws(() => parseRegister({ email: "user@example.com", password: "short" }), ValidationError);
  assert.throws(() => parseAmount("-25"), ValidationError);
  assert.throws(() => parseAmount("10.999"), ValidationError);
  assert.throws(() => parseDate("2026-02-30"), ValidationError);
  assert.throws(() => parseCategory({ name: "", type: "expense" }), ValidationError);
  assert.throws(() => parseTransaction({ categoryId: "invalid", type: "income", amount: "20", transactionDate: "2026-10-01", description: "" }), ValidationError);
  assert.deepEqual(parseMonth("2024-02", "2025-01"), { month: "2024-02", startDate: "2024-02-01", endDate: "2024-03-01" });
});

test("HTTP flow requires CSRF, creates a session, scopes CRUD queries to the signed-in user", async (t) => {
  const { pool, base } = await startTestServer(t);
  let response = await fetch(`${base}/health/ready`);
  assert.equal(response.status, 200);

  response = await fetch(`${base}/api/auth/csrf`);
  assert.equal(response.status, 200);
  let cookie = cookieValue(response);
  let csrf = (await response.json()).csrfToken;
  assert.match(csrf, /^[a-f0-9]{64}$/);

  response = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{"
  });
  assert.equal(response.status, 400, "malformed JSON receives a client error rather than a server error");

  response = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-battery" })
  });
  assert.equal(response.status, 403, "state-changing requests without CSRF protection are rejected");

  response = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf },
    body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-battery" })
  });
  assert.equal(response.status, 201);
  const registered = await response.json();
  assert.equal(registered.user.email, "owner@example.com");
  assert.equal("password_hash" in registered.user, false);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(pool.user.password_hash, /^\$2[aby]\$12\$/);
  assert.match(response.headers.getSetCookie()[0], /HttpOnly;.*SameSite=Strict/);
  cookie = cookieValue(response);
  csrf = registered.csrfToken;

  response = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf, Origin: `https://${new URL(base).host}` },
    body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-battery" })
  });
  assert.equal(response.status, 403, "cross-origin state changes are rejected even with a leaked token");

  response = await fetch(`${base}/api/categories`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.match(pool.calls.at(-1).sql, /WHERE user_id = \$1/);
  assert.deepEqual(pool.calls.at(-1).params, [userId]);

  response = await fetch(`${base}/api/dashboard?month=2026-10`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    month: "2026-10", income: 1000000, expense: 250000, balance: 750000, daily: [], expenseByCategory: []
  });
  const summaryQuery = pool.calls.findLast((call) => call.sql.includes("COALESCE(SUM(amount) FILTER (WHERE type = 'income')"));
  assert.match(summaryQuery.sql, /WHERE user_id = \$1/);
  assert.equal(summaryQuery.params[0], userId);

  response = await fetch(`${base}/api/categories`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf },
    body: JSON.stringify({ name: "Du lịch", type: "expense" })
  });
  assert.equal(response.status, 201);
  const insertedCategory = pool.calls.findLast((call) => call.sql.includes("INSERT INTO categories"));
  assert.match(insertedCategory.sql, /INSERT INTO categories \(user_id,/);
  assert.equal(insertedCategory.params[0], userId);

  response = await fetch(`${base}/api/categories/${categoryId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf },
    body: JSON.stringify({ name: "Danh mục riêng" })
  });
  assert.equal(response.status, 404, "a category id owned by another user is not editable");
  const categoryUpdate = pool.calls.findLast((call) => call.sql.includes("UPDATE categories SET"));
  assert.match(categoryUpdate.sql, /WHERE id = \$2 AND user_id = \$3/);
  assert.deepEqual(categoryUpdate.params.slice(-2), [categoryId, userId]);

  response = await fetch(`${base}/api/categories/${categoryId}`, {
    method: "DELETE", headers: { Cookie: cookie, "X-CSRF-Token": csrf }
  });
  assert.equal(response.status, 404, "a category id owned by another user is not deletable");
  const categoryDelete = pool.calls.findLast((call) => call.sql.includes("DELETE FROM categories WHERE"));
  assert.match(categoryDelete.sql, /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(categoryDelete.params, [categoryId, userId]);

  response = await fetch(`${base}/api/transactions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf },
    body: JSON.stringify({ categoryId, type: "expense", amount: "35000", transactionDate: "2026-10-18", description: "Bữa trưa" })
  });
  assert.equal(response.status, 201);
  const inserted = pool.calls.findLast((call) => call.sql.includes("INSERT INTO transactions"));
  assert.match(inserted.sql, /INSERT INTO transactions \(user_id,/);
  assert.equal(inserted.params[0], userId);

  response = await fetch(`${base}/api/transactions/${transactionId}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf },
    body: JSON.stringify({ categoryId, type: "expense", amount: "39000", transactionDate: "2026-10-18", description: "Sửa" })
  });
  assert.equal(response.status, 404, "an id owned by another user is not editable");
  const update = pool.calls.findLast((call) => call.sql.includes("UPDATE transactions SET"));
  assert.match(update.sql, /WHERE id = \$6 AND user_id = \$7/);
  assert.deepEqual(update.params.slice(-2), [transactionId, userId]);

  response = await fetch(`${base}/api/transactions/${transactionId}`, {
    method: "DELETE", headers: { Cookie: cookie, "X-CSRF-Token": csrf }
  });
  assert.equal(response.status, 404, "an id owned by another user is not deletable");
  const deletion = pool.calls.findLast((call) => call.sql.includes("DELETE FROM transactions WHERE"));
  assert.match(deletion.sql, /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(deletion.params, [transactionId, userId]);

  response = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf },
    body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-battery" })
  });
  assert.equal(response.status, 200);
  const loggedIn = await response.json();
  const rotatedCookie = cookieValue(response);
  assert.notEqual(rotatedCookie, cookie, "login regenerates the session identifier");
  cookie = rotatedCookie;
  csrf = loggedIn.csrfToken;

  response = await fetch(`${base}/api/auth/logout`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf }, body: "{}"
  });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/api/auth/session`);
  assert.equal((await response.json()).authenticated, false);

});
