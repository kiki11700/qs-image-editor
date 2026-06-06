const { getDb, saveDb } = require("../db/database");

function getUserById(id) {
  const db = getDb();
  const stmt = db.prepare("SELECT id, username, email, credits FROM users WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getUserByUsername(username) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
  stmt.bind([username]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getUserByEmail(email) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  stmt.bind([email]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function createUser(username, email, hashedPassword) {
  const db = getDb();
  const trialCredits = parseInt(process.env.FREE_TRIAL_CREDITS || 8);
  db.run("INSERT INTO users (username, email, password, credits, total_credits) VALUES (?, ?, ?, ?, ?)",
    [username, email, hashedPassword, trialCredits, trialCredits]);
  const stmt = db.prepare("SELECT last_insert_rowid() as id");
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  db.run("INSERT INTO credit_logs (user_id, amount, type, remark) VALUES (?, ?, ?, ?)",
    [row.id, trialCredits, "bonus", "新用户注册赠送"]);
  saveDb();
  return row.id;
}

function getCredits(userId) {
  const db = getDb();
  const stmt = db.prepare("SELECT credits FROM users WHERE id = ?");
  stmt.bind([userId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.credits;
  }
  stmt.free();
  return 0;
}

function deductCredit(userId) {
  const db = getDb();
  const stmt = db.prepare("SELECT credits FROM users WHERE id = ?");
  stmt.bind([userId]);
  if (!stmt.step()) { stmt.free(); return false; }
  const row = stmt.getAsObject();
  stmt.free();
  if (row.credits < 1) return false;
  db.run("UPDATE users SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
  db.run("INSERT INTO credit_logs (user_id, amount, type, remark) VALUES (?, ?, ?, ?)",
    [userId, -1, "deduct", "处理图片消耗"]);
  saveDb();
  return true;
}

function addCredits(userId, amount, remark) {
  const db = getDb();
  db.run("UPDATE users SET credits = credits + ?, total_credits = total_credits + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [amount, amount, userId]);
  db.run("INSERT INTO credit_logs (user_id, amount, type, remark) VALUES (?, ?, ?, ?)",
    [userId, amount, "recharge", remark || "充值"]);
  saveDb();
}

function getCreditLogs(userId, limit) {
  if (!limit) limit = 20;
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM credit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?");
  stmt.bind([userId, limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = { getUserById, getUserByUsername, getUserByEmail, createUser, getCredits, deductCredit, addCredits, getCreditLogs };
