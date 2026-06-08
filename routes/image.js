const express = require("express");
const multer = require("multer");
const pathMod = require("path");
const fs = require("fs");
const { getDb, saveDb } = require("../db/database");
// 内测版：取消额度限制
const { authMiddleware } = require("./auth");
const ai = require("../services/ai");
const rembg = require("../services/rembg");
const vectorize = require("../services/vectorize");
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
    else cb(new Error("涓嶆敮鎸佺殑鍥剧墖鏍煎紡"));
  }
});

const TASK_HANDLERS = {
  "upscale":       async (i, o, p) => { await ai.upscale(i, o); },
  "upscale4k":     async (i, o, p) => { await ai.upscaleTo4K(i, o); },
  "vectorize":     async (i, o, p) => { o = o.replace(/\.\w+$/, ".svg"); await vectorize.vectorize(i, o); },
  "remove-bg":     async (i, o, p) => { await rembg.removeBackground(i, o); },
  "replace-bg":    async (i, o, p) => { await rembg.replaceBackground(i, p.bgColor || "#ffffff", o); },
  "style-transfer": async (i, o, p) => { await ai.styleTransfer(i, p.stylePrompt || "鍔ㄦ极椋庢牸", o); },
  "similar":       async (i, o, p) => { await ai.generateSimilar(i, o); }
};

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
  getDb().run(sql, params || []);
  saveDb();
}

// ============================================================
// 鎻愪氦澶勭悊浠诲姟
// ============================================================
router.post("/process", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { type, stylePrompt, bgColor } = req.body;
    if (!req.file) return res.status(400).json({ error: "璇蜂笂浼犲浘鐗? });
    if (!TASK_HANDLERS[type]) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "涓嶆敮鎸佺殑绫诲瀷" }); }
    // 内测版：取消次数限制

    const taskId = uuidv4();
    const ext = type === "vectorize" ? ".svg" : ".png";
    const outputPath = pathMod.join(OUTPUT_DIR, taskId + ext);

    dbRun("INSERT INTO tasks (id, user_id, type, status, input_path, input_size) VALUES (?, ?, ?, ?, ?, ?)",
      [taskId, req.userId, type, "processing", req.file.path, req.file.size]);

    res.json({ taskId, status: "processing", message: "浠诲姟宸叉彁浜? });

    try {
      await TASK_HANDLERS[type](req.file.path, outputPath, { stylePrompt, bgColor });
      dbRun("UPDATE tasks SET status = ?, output_path = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ["completed", outputPath, taskId]);
    } catch(e) {
      console.error("Process error:", e.message||e); if(e.stack) console.error(e.stack.split("\n").slice(0,5).join("\n"));
      dbRun("UPDATE tasks SET status = ? WHERE id = ?", ["failed", taskId]);
      // 内测版不扣额度，无须退还
    }
  } catch(e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "澶勭悊澶辫触: " + e.message });
  }
});

// ============================================================
// 鏌ヨ鍗曚釜浠诲姟锛堝惈杈撳叆鍥剧墖鍦板潃锛?// ============================================================
router.get("/task/:id", authMiddleware, (req, res) => {
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!task) return res.status(404).json({ error: "浠诲姟涓嶅瓨鍦? });
  const isVec = task.type === "vectorize";
  res.json({
    id: task.id, type: task.type, status: task.status,
    createdAt: task.created_at, completedAt: task.completed_at,
    inputUrl: task.input_path && fs.existsSync(task.input_path)
      ? ("/api/image/input/" + task.id) : null,
    outputUrl: task.status === "completed" && task.output_path && fs.existsSync(task.output_path)
      ? ("/api/image/download/" + task.id) : null
  });
});

// ============================================================
// 鏌ヨ浠诲姟鍒楄〃
// ============================================================
router.get("/tasks", authMiddleware, (req, res) => {
  const tasks = dbAll("SELECT id, type, status, created_at, completed_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.userId]);
  res.json(tasks.map(t => ({
    id: t.id, type: t.type, status: t.status,
    createdAt: t.created_at, completedAt: t.completed_at,
    outputUrl: t.status === "completed" ? ("/api/image/download/" + t.id) : null
  })));
});

// ============================================================
// 棰勮缁撴灉鍥剧墖
// ============================================================
router.get("/preview/:taskId", (req, res) => {
  let t = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!t) return res.status(401).json({ error: "璇峰厛鐧诲綍" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(t, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "鐧诲綍宸茶繃鏈? }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.output_path) return res.status(404).json({ error: "鏂囦欢涓嶅瓨鍦? });
  if (!fs.existsSync(task.output_path)) return res.status(404).json({ error: "鏂囦欢宸茶繃鏈? });
  res.sendFile(task.output_path);
});

// ============================================================
// 涓嬭浇缁撴灉鍥剧墖
// ============================================================
router.get("/download/:taskId", (req, res) => {
  let t = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!t) return res.status(401).json({ error: "璇峰厛鐧诲綍" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(t, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "鐧诲綍宸茶繃鏈? }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.output_path) return res.status(404).json({ error: "鏂囦欢涓嶅瓨鍦? });
  if (!fs.existsSync(task.output_path)) return res.status(404).json({ error: "鏂囦欢宸茶繃鏈? });
  res.download(task.output_path);
});

// ============================================================
// 鏌ョ湅鍘熷杈撳叆鍥剧墖锛堝巻鍙茶褰曟煡鐪嬬敤锛?// ============================================================
router.get("/input/:taskId", (req, res) => {
  let t = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!t) return res.status(401).json({ error: "璇峰厛鐧诲綍" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(t, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "鐧诲綍宸茶繃鏈? }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.input_path) return res.status(404).json({ error: "鏂囦欢涓嶅瓨鍦? });
  if (!fs.existsSync(task.input_path)) return res.status(404).json({ error: "鏂囦欢宸茶繃鏈? });
  res.sendFile(task.input_path);
});

module.exports = router;