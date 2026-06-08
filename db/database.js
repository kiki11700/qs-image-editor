const initSqlJs = require("sql.js");
const fs = require("fs");
const pathMod = require("path");

const DB_PATH = process.env.DATA_DIR ? pathMod.join(process.env.DATA_DIR, "data.db") : pathMod.join(__dirname, "..", "data.db");

let db = null;

function getDb() {
  if (db) return db;
  throw new Error("Database not initialized. Call initDb() first.");
}

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA journal_mode=WAL");
  initSchema();
  saveDb();
  return db;
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initSchema() {
  db.run(
    "CREATE TABLE IF NOT EXISTS users (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "username TEXT UNIQUE NOT NULL," +
    "email TEXT UNIQUE NOT NULL," +
    "password TEXT NOT NULL," +
    "credits INTEGER NOT NULL DEFAULT 0," +
    "total_credits INTEGER NOT NULL DEFAULT 0," +
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP" +
    ")"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS tasks (" +
    "id TEXT PRIMARY KEY," +
    "user_id INTEGER NOT NULL," +
    "type TEXT NOT NULL," +
    "status TEXT NOT NULL DEFAULT 'pending'," +
    "input_path TEXT," +
    "output_path TEXT," +
    "input_size INTEGER," +
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "completed_at DATETIME," +
    "FOREIGN KEY (user_id) REFERENCES users(id)" +
    ")"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS credit_logs (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "user_id INTEGER NOT NULL," +
    "amount INTEGER NOT NULL," +
    "type TEXT NOT NULL," +
    "remark TEXT," +
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "FOREIGN KEY (user_id) REFERENCES users(id)" +
    ")"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS redemption_codes (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "code TEXT UNIQUE NOT NULL," +
    "credits INTEGER NOT NULL," +
    "used INTEGER NOT NULL DEFAULT 0," +
    "used_by INTEGER," +
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "used_at DATETIME," +
    "FOREIGN KEY (used_by) REFERENCES users(id)" +
    ")"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS payment_orders (" +
    "id TEXT PRIMARY KEY," +
    "user_id INTEGER NOT NULL," +
    "amount REAL NOT NULL," +
    "credits INTEGER NOT NULL," +
    "status TEXT NOT NULL DEFAULT 'pending'," +
    "channel TEXT NOT NULL," +
    "trade_no TEXT," +
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "paid_at DATETIME," +
    "FOREIGN KEY (user_id) REFERENCES users(id)" +
    ")"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS workflows (" +
    "id TEXT PRIMARY KEY," +
    "user_id INTEGER NOT NULL," +
    "name TEXT NOT NULL," +
    "nodes_json TEXT," +
    "status TEXT NOT NULL DEFAULT 'draft'," +
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "FOREIGN KEY (user_id) REFERENCES users(id)" +
    ")"
  );
}

module.exports = { getDb, initDb, saveDb };

