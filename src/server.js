const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { Pool } = require("pg");
const {
  ValidationError, parseRegister, parseLogin, parseCategory, parseName,
  parseUuid, parseTransaction, parseMonth
} = require("./validation");

const COOKIE_NAME = "chi_tieu_sid";
const DEFAULT_CATEGORIES = [
  ["Lương", "income"], ["Thưởng", "income"], ["Thu nhập khác", "income"],
  ["Ăn uống", "expense"], ["Đi lại", "expense"], ["Nhà ở", "expense"],
  ["Mua sắm", "expense"], ["Sức khỏe", "expense"], ["Giải trí", "expense"],
  ["Học tập", "expense"], ["Chi phí khác", "expense"]
];

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function vnMonthNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit"
  }).format(new Date());
}

function csrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

function sameOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const protocol = (req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
    const expectedOrigin = new URL(`${protocol}://${req.get("host")}`).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function createApp({ pool, sessionStore } = {}) {
  if (!pool) throw new Error("createApp cần một kết nối PostgreSQL.");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"]
      }
    },
    frameguard: { action: "sameorigin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  }));
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(session({
    name: COOKIE_NAME,
    secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === "test" ? "test-only-secret-not-for-production" : ""),
    store: sessionStore || new (connectPgSimple(session))({
      pool, tableName: "user_sessions", createTableIfMissing: true
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 12,
      path: "/"
    }
  }));

  app.use((req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = csrfToken();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const submitted = req.get("x-csrf-token") || req.body?.csrfToken;
      const expected = req.session.csrfToken;
      const matches = typeof submitted === "string" && typeof expected === "string" &&
        submitted.length === expected.length && crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
      if (!sameOrigin(req) || !matches) return next(new HttpError(403, "Yêu cầu không hợp lệ hoặc mã bảo vệ đã hết hạn."));
    }
    next();
  });

  app.use((req, res, next) => {
    res.on("finish", () => {
      console.log(JSON.stringify({ level: "info", method: req.method, path: req.path, status: res.statusCode }));
    });
    next();
  });

  app.get("/health/live", (req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", asyncRoute(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  }));
  app.use(express.static(path.join(__dirname, "..", "public"), { index: "index.html", maxAge: "1h", etag: true }));

  const api = express.Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 15 phút." } });
  const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
    message: { error: "Bạn đã tạo quá nhiều tài khoản từ địa chỉ này. Vui lòng thử lại sau." } });

  api.get("/auth/csrf", asyncRoute(async (req, res) => {
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ csrfToken: req.session.csrfToken });
  }));

  api.get("/auth/session", asyncRoute(async (req, res) => {
    if (!req.session.userId) return res.json({ authenticated: false, csrfToken: req.session.csrfToken });
    const result = await pool.query("SELECT id, email FROM users WHERE id = $1", [req.session.userId]);
    if (!result.rowCount) {
      req.session.userId = null;
      return res.json({ authenticated: false, csrfToken: req.session.csrfToken });
    }
    res.json({ authenticated: true, user: result.rows[0], csrfToken: req.session.csrfToken });
  }));

  api.post("/auth/register", registerLimiter, asyncRoute(async (req, res) => {
    const { email, password } = parseRegister(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      const result = await pool.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, passwordHash]
      );
      user = result.rows[0];
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "Email này đã được đăng ký.");
      throw error;
    }
    for (const [name, type] of DEFAULT_CATEGORIES) {
      await pool.query("INSERT INTO categories (user_id, name, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [user.id, name, type]);
    }
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.csrfToken = csrfToken();
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.status(201).json({ user, csrfToken: req.session.csrfToken });
  }));

  api.post("/auth/login", loginLimiter, asyncRoute(async (req, res) => {
    const { email, password } = parseLogin(req.body);
    const result = await pool.query("SELECT id, email, password_hash FROM users WHERE lower(email) = $1 LIMIT 1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, "Email hoặc mật khẩu không chính xác.");
    }
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = user.id;
    req.session.csrfToken = csrfToken();
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ user: { id: user.id, email: user.email }, csrfToken: req.session.csrfToken });
  }));

  api.post("/auth/logout", asyncRoute(async (req, res) => {
    if (!req.session.userId) throw new HttpError(401, "Bạn chưa đăng nhập.");
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "strict", path: "/" });
    res.json({ ok: true });
  }));

  api.use((req, res, next) => {
    if (!req.session.userId) return next(new HttpError(401, "Vui lòng đăng nhập để tiếp tục."));
    req.userId = req.session.userId;
    next();
  });

  api.get("/categories", asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT id, name, type FROM categories WHERE user_id = $1 ORDER BY type, name", [req.userId]
    );
    res.json({ categories: result.rows });
  }));

  api.post("/categories", asyncRoute(async (req, res) => {
    const { name, type } = parseCategory(req.body);
    try {
      const result = await pool.query(
        "INSERT INTO categories (user_id, name, type) VALUES ($1, $2, $3) RETURNING id, name, type", [req.userId, name, type]
      );
      res.status(201).json({ category: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "Danh mục cùng tên và loại đã tồn tại.");
      throw error;
    }
  }));

  api.put("/categories/:id", asyncRoute(async (req, res) => {
    const id = parseUuid(req.params.id, "Danh mục");
    const name = parseName(req.body?.name);
    try {
      const result = await pool.query(
        "UPDATE categories SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, type", [name, id, req.userId]
      );
      if (!result.rowCount) throw new HttpError(404, "Không tìm thấy danh mục.");
      res.json({ category: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "Danh mục cùng tên và loại đã tồn tại.");
      throw error;
    }
  }));

  api.delete("/categories/:id", asyncRoute(async (req, res) => {
    const id = parseUuid(req.params.id, "Danh mục");
    try {
      const result = await pool.query("DELETE FROM categories WHERE id = $1 AND user_id = $2", [id, req.userId]);
      if (!result.rowCount) throw new HttpError(404, "Không tìm thấy danh mục.");
      res.status(204).end();
    } catch (error) {
      if (error.code === "23503") throw new HttpError(409, "Danh mục đã có giao dịch, hãy sửa giao dịch trước khi xóa.");
      throw error;
    }
  }));

  api.get("/transactions", asyncRoute(async (req, res) => {
    const { startDate, endDate } = parseMonth(req.query.month, vnMonthNow());
    const type = req.query.type;
    if (type !== undefined && type !== "income" && type !== "expense") throw new ValidationError("Bộ lọc loại giao dịch không hợp lệ.");
    const categoryId = req.query.categoryId ? parseUuid(req.query.categoryId, "Danh mục") : null;
    const result = await pool.query(
      `SELECT t.id, t.type, t.amount::text, t.description, t.transaction_date::text AS transaction_date,
              t.category_id, c.name AS category_name
       FROM transactions t JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
       WHERE t.user_id = $1 AND t.transaction_date >= $2::date AND t.transaction_date < $3::date
         AND ($4::text IS NULL OR t.type = $4) AND ($5::uuid IS NULL OR t.category_id = $5)
       ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 500`,
      [req.userId, startDate, endDate, type || null, categoryId]
    );
    res.json({ transactions: result.rows });
  }));

  api.post("/transactions", asyncRoute(async (req, res) => {
    const transaction = parseTransaction(req.body);
    const category = await pool.query(
      "SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND type = $3", [transaction.categoryId, req.userId, transaction.type]
    );
    if (!category.rowCount) throw new HttpError(400, "Danh mục không tồn tại hoặc không thuộc loại giao dịch đã chọn.");
    const result = await pool.query(
      `INSERT INTO transactions (user_id, category_id, type, amount, description, transaction_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category_id, type, amount::text, description, transaction_date::text`,
      [req.userId, transaction.categoryId, transaction.type, transaction.amount, transaction.description, transaction.transactionDate]
    );
    res.status(201).json({ transaction: result.rows[0] });
  }));

  api.put("/transactions/:id", asyncRoute(async (req, res) => {
    const id = parseUuid(req.params.id, "Giao dịch");
    const transaction = parseTransaction(req.body);
    const category = await pool.query(
      "SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND type = $3", [transaction.categoryId, req.userId, transaction.type]
    );
    if (!category.rowCount) throw new HttpError(400, "Danh mục không tồn tại hoặc không thuộc loại giao dịch đã chọn.");
    const result = await pool.query(
      `UPDATE transactions SET category_id = $1, type = $2, amount = $3, description = $4, transaction_date = $5
       WHERE id = $6 AND user_id = $7
       RETURNING id, category_id, type, amount::text, description, transaction_date::text`,
      [transaction.categoryId, transaction.type, transaction.amount, transaction.description, transaction.transactionDate, id, req.userId]
    );
    if (!result.rowCount) throw new HttpError(404, "Không tìm thấy giao dịch.");
    res.json({ transaction: result.rows[0] });
  }));

  api.delete("/transactions/:id", asyncRoute(async (req, res) => {
    const id = parseUuid(req.params.id, "Giao dịch");
    const result = await pool.query("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (!result.rowCount) throw new HttpError(404, "Không tìm thấy giao dịch.");
    res.status(204).end();
  }));

  api.get("/dashboard", asyncRoute(async (req, res) => {
    const { month, startDate, endDate } = parseMonth(req.query.month, vnMonthNow());
    const summary = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0)::text AS income,
              COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::text AS expense
       FROM transactions WHERE user_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date`,
      [req.userId, startDate, endDate]
    );
    const daily = await pool.query(
      `SELECT transaction_date::text AS date,
              COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0)::text AS income,
              COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::text AS expense
       FROM transactions WHERE user_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
       GROUP BY transaction_date ORDER BY transaction_date`, [req.userId, startDate, endDate]
    );
    const categories = await pool.query(
      `SELECT c.id, c.name, SUM(t.amount)::text AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
       WHERE t.user_id = $1 AND t.type = 'expense' AND t.transaction_date >= $2::date AND t.transaction_date < $3::date
       GROUP BY c.id, c.name ORDER BY SUM(t.amount) DESC LIMIT 8`, [req.userId, startDate, endDate]
    );
    const income = Number(summary.rows[0].income);
    const expense = Number(summary.rows[0].expense);
    res.json({ month, income, expense, balance: income - expense, daily: daily.rows, expenseByCategory: categories.rows });
  }));

  app.use("/api", api);
  app.use("/api", (req, res) => res.status(404).json({ error: "Không tìm thấy API." }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ValidationError || error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Dữ liệu gửi lên vượt quá giới hạn." });
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "JSON gửi lên không hợp lệ." });
    console.error(JSON.stringify({ level: "error", message: "request_failed", status: 500 }));
    res.status(500).json({ error: "Đã xảy ra lỗi máy chủ. Vui lòng thử lại." });
  });

  return app;
}

async function initializeDatabase(pool) {
  const schema = await fs.readFile(path.join(__dirname, "db", "schema.sql"), "utf8");
  await pool.query(schema);
}

async function start() {
  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET phải có ít nhất 32 ký tự.");
  }
  const pool = new Pool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "chi_tieu",
    user: process.env.DB_USER || "chi_tieu",
    password: process.env.DB_PASSWORD || "",
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  await initializeDatabase(pool);
  const app = createApp({ pool });
  const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
    console.log(JSON.stringify({ level: "info", event: "server_started", port: Number(process.env.PORT || 3000) }));
  });
  const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(JSON.stringify({ level: "error", event: "startup_failed", message: error.message }));
    process.exit(1);
  });
}

module.exports = { createApp, initializeDatabase };
