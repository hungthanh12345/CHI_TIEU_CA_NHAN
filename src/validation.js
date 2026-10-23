class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function requireObject(value) {
  if (!isObject(value)) throw new ValidationError("Dữ liệu gửi lên không hợp lệ.");
  return value;
}

function parseEmail(value) {
  if (typeof value !== "string") throw new ValidationError("Email không hợp lệ.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Vui lòng nhập email hợp lệ.");
  }
  return email;
}

function parsePassword(value) {
  if (typeof value !== "string" || value.length < 10 || Buffer.byteLength(value, "utf8") > 72) {
    throw new ValidationError("Mật khẩu cần có ít nhất 10 ký tự và tối đa 72 byte UTF-8.");
  }
  return value;
}

function parseRegister(value) {
  const body = requireObject(value);
  return { email: parseEmail(body.email), password: parsePassword(body.password) };
}

function parseLogin(value) {
  const body = requireObject(value);
  if (typeof body.password !== "string" || body.password.length === 0 || Buffer.byteLength(body.password, "utf8") > 72) {
    throw new ValidationError("Email hoặc mật khẩu không chính xác.");
  }
  return { email: parseEmail(body.email), password: body.password };
}

function parseName(value) {
  if (typeof value !== "string") throw new ValidationError("Tên danh mục không hợp lệ.");
  const name = value.trim();
  if (name.length < 1 || name.length > 40) throw new ValidationError("Tên danh mục cần từ 1 đến 40 ký tự.");
  return name;
}

function parseCategory(value) {
  const body = requireObject(value);
  if (body.type !== "income" && body.type !== "expense") {
    throw new ValidationError("Loại danh mục phải là thu nhập hoặc chi tiêu.");
  }
  return { name: parseName(body.name), type: body.type };
}

function parseUuid(value, label = "Mã") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError(`${label} không hợp lệ.`);
  }
  return value;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("Ngày giao dịch không hợp lệ.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError("Ngày giao dịch không tồn tại.");
  }
  return value;
}

function parseAmount(value) {
  const amount = typeof value === "number" ? String(value) : value;
  if (typeof amount !== "string" || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new ValidationError("Số tiền phải lớn hơn 0 và có tối đa 2 chữ số thập phân.");
  }
  return amount;
}

function parseTransaction(value) {
  const body = requireObject(value);
  if (body.type !== "income" && body.type !== "expense") {
    throw new ValidationError("Loại giao dịch phải là thu nhập hoặc chi tiêu.");
  }
  if (typeof body.description !== "string" || body.description.trim().length > 250) {
    throw new ValidationError("Ghi chú tối đa 250 ký tự.");
  }
  return {
    categoryId: parseUuid(body.categoryId, "Danh mục"),
    type: body.type,
    amount: parseAmount(body.amount),
    description: body.description.trim() || null,
    transactionDate: parseDate(body.transactionDate)
  };
}

function parseMonth(value, fallback) {
  const month = value ?? fallback;
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ValidationError("Tháng cần có định dạng YYYY-MM.");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  return { month, startDate: `${month}-01`, endDate: nextMonth };
}

module.exports = {
  ValidationError,
  parseEmail,
  parseRegister,
  parseLogin,
  parseName,
  parseCategory,
  parseUuid,
  parseDate,
  parseAmount,
  parseTransaction,
  parseMonth
};
