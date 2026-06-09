const express = require("express");
const multer = require("multer");
const pathMod = require("path");
const fs = require("fs");
const { getDb, saveDb } = require("../db/database");
const { authMiddleware } = require("./auth");
const ai = require("../services/ai");
const rembg = require("../services/rembg");
const vectorize = require("../services/vectorize");
const pattern = require("../services/pattern");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const UPLOAD_DIR = pathMod.join(__dirname, "..", "uploads");
const OUTPUT_DIR = pathMod.join(__dirname, "..", "uploads");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => { cb(null, uuidv4() + pathMod.extname(file.originalname)); }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || 104857600) },
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];
    if (allowed.includes(pathMod.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Unsupported image format"));
  }
});

const TASK_HANDLERS = {
  "upscale":          async (i, o, p) => { await ai.upscale(i, o); },
  "upscale4k":        async (i, o, p) => { await ai.upscaleTo4K(i, o); },
  "vectorize":        async (i, o, p) => { o = o.replace(/\.\w+$/, ".svg"); await vectorize.vectorize(i, o); },
  "remove-bg":        async (i, o, p) => { await rembg.removeBackground(i, o); },
  "replace-bg":       async (i, o, p) => { await rembg.replaceBackground(i, p.bgColor || "#ffffff", o); },
  "style-transfer":   async (i, o, p) => { await ai.styleTransfer(i, p.stylePrompt || "anime style", o); },
  "similar":          async (i, o, p) => { await ai.generateSimilar(i, o); },
  "extract-pattern":  async (i, o, p) => { await pattern.extractPattern(i, o); }
};

// Database helpers - FIXED: use array params with sql.js
function dbGet(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}

function dbAll(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}

function dbRun(sql, params) {
  const db = getDb();
  if (params) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
  saveDb();
}

// Submit processing task
router.post("/process", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { type, stylePrompt, bgColor } = req.body;
    if (!req.file) return res.status(400).json({ error: "Please upload an image" });
    if (!TASK_HANDLERS[type]) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "Unsupported type" }); }

    const taskId = uuidv4();
    const ext = type === "vectorize" ? ".svg" : ".png";
    const outputPath = pathMod.join(OUTPUT_DIR, taskId + ext);

    dbRun("INSERT INTO tasks (id, user_id, type, status, input_path, input_size) VALUES (?, ?, ?, ?, ?, ?)",
      [taskId, req.userId, type, "processing", req.file.path, req.file.size]);

    res.json({ taskId, status: "processing", message: "Task submitted" });

    try {
      await TASK_HANDLERS[type](req.file.path, outputPath, { stylePrompt, bgColor });
      dbRun("UPDATE tasks SET status = ?, output_path = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ["completed", outputPath, taskId]);
    } catch(e) {
      console.error("Process error:", e.message || e);
      dbRun("UPDATE tasks SET status = ? WHERE id = ?", ["failed", taskId]);
    }
  } catch(e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Process failed: " + e.message });
  }
});

// Get single task
router.get("/task/:id", authMiddleware, (req, res) => {
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({
    id: task.id, type: task.type, status: task.status,
    createdAt: task.created_at, completedAt: task.completed_at,
    inputUrl: task.input_path && fs.existsSync(task.input_path) ? ("/api/image/input/" + task.id) : null,
    outputUrl: task.status === "completed" && task.output_path && fs.existsSync(task.output_path) ? ("/api/image/download/" + task.id) : null
  });
});

// List tasks
router.get("/tasks", authMiddleware, (req, res) => {
  const tasks = dbAll("SELECT id, type, status, created_at, completed_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.userId]);
  res.json(tasks.map(t => ({
    id: t.id, type: t.type, status: t.status,
    createdAt: t.created_at, completedAt: t.completed_at,
    outputUrl: t.status === "completed" ? ("/api/image/download/" + t.id) : null
  })));
});

// Preview result
router.get("/preview/:taskId", (req, res) => {
  let token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token) return res.status(401).json({ error: "Please login first" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "Login expired" }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.output_path) return res.status(404).json({ error: "File not found" });
  if (!fs.existsSync(task.output_path)) return res.status(404).json({ error: "File expired" });
  res.sendFile(task.output_path);
});

// Download result
router.get("/download/:taskId", (req, res) => {
  let token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token) return res.status(401).json({ error: "Please login first" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "Login expired" }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.output_path) return res.status(404).json({ error: "File not found" });
  if (!fs.existsSync(task.output_path)) return res.status(404).json({ error: "File expired" });
  res.download(task.output_path);
});

// View input image
router.get("/input/:taskId", (req, res) => {
  let token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token) return res.status(401).json({ error: "Please login first" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "Login expired" }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.input_path) return res.status(404).json({ error: "File not found" });
  if (!fs.existsSync(task.input_path)) return res.status(404).json({ error: "File expired" });
  res.sendFile(task.input_path);
});

module.exports = router;
