const express = require("express");
const { getDb, saveDb } = require("../db/database");
const { authMiddleware } = require("./auth");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

function dbAll(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}

function dbRun(sql, params) {
  getDb().run(sql, params || []);
  saveDb();
}

// ?????
router.post("/create", authMiddleware, (req, res) => {
  const { name, nodes } = req.body;
  if (!name || !nodes || !Array.isArray(nodes) || nodes.length < 1) {
    return res.status(400).json({ error: "???????????" });
  }
  const id = uuidv4();
  dbRun("INSERT INTO workflows (id, user_id, name, nodes_json, status) VALUES (?, ?, ?, ?, ?)",
    [id, req.userId, name, JSON.stringify(nodes), "draft"]);
  res.json({ id, name, message: "??????" });
});

// ??????????
router.get("/list", authMiddleware, (req, res) => {
  const list = dbAll("SELECT id, name, status, created_at, updated_at FROM workflows WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [req.userId]);
  res.json(list);
});

// ???????
router.get("/:id", authMiddleware, (req, res) => {
  const wf = dbGet("SELECT * FROM workflows WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!wf) return res.status(404).json({ error: "??????" });
  wf.nodes = JSON.parse(wf.nodes_json || "[]");
  res.json(wf);
});

// ?????
router.delete("/:id", authMiddleware, (req, res) => {
  dbRun("DELETE FROM workflows WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  res.json({ message: "???" });
});

module.exports = router;
