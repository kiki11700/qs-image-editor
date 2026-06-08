const express = require("express");
const multer = require("multer");
const pathMod = require("path");
const fs = require("fs");
const { getDb, saveDb } = require("../db/database");
const { deductCredit, getCredits } = require("../services/credit");
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
    else cb(new Error("不支持的图片格式"));
  }
});

const TASK_HANDLERS = {
  "upscale":       async (i, o, p) => { await ai.upscale(i, o); },
  "upscale4k":     async (i, o, p) => { await ai.upscaleTo4K(i, o); },
  "vectorize":     async (i, o, p) => { o = o.replace(/\.\w+$/, ".svg"); await vectorize.vectorize(i, o); },
  "remove-bg":     async (i, o, p) => { await rembg.removeBackground(i, o); },
  "replace-bg":    async (i, o, p) => { await rembg.replaceBackground(i, p.bgColor || "#ffffff", o); },
  "style-transfer": async (i, o, p) => { await ai.styleTransfer(i, p.stylePrompt || "动漫风格", o); },
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
// 提交处理任务
// ============================================================
router.post("/process", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { type, stylePrompt, bgColor } = req.body;
    if (!req.file) return res.status(400).json({ error: "请上传图片" });
    if (!TASK_HANDLERS[type]) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "不支持的类型" }); }
    if (getCredits(req.userId) < 1) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "额度不足，请充值" }); }
    if (!deductCredit(req.userId)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "额度不足" }); }

    const taskId = uuidv4();
    const ext = type === "vectorize" ? ".svg" : ".png";
    const outputPath = pathMod.join(OUTPUT_DIR, taskId + ext);

    dbRun("INSERT INTO tasks (id, user_id, type, status, input_path, input_size) VALUES (?, ?, ?, ?, ?, ?)",
      [taskId, req.userId, type, "processing", req.file.path, req.file.size]);

    res.json({ taskId, status: "processing", message: "任务已提交" });

    try {
      await TASK_HANDLERS[type](req.file.path, outputPath, { stylePrompt, bgColor });
      dbRun("UPDATE tasks SET status = ?, output_path = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ["completed", outputPath, taskId]);
    } catch(e) {
      console.error("Process error:", e.message||e); if(e.stack) console.error(e.stack.split("\n").slice(0,5).join("\n"));
      dbRun("UPDATE tasks SET status = ? WHERE id = ?", ["failed", taskId]);
      const { addCredits } = require("../services/credit");
      addCredits(req.userId, 1, "处理失败退还");
    }
  } catch(e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "处理失败: " + e.message });
  }
});

// ============================================================
// 查询单个任务（含输入图片地址）
// ============================================================
router.get("/task/:id", authMiddleware, (req, res) => {
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!task) return res.status(404).json({ error: "任务不存在" });
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
// 查询任务列表
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
// 预览结果图片
// ============================================================
router.get("/preview/:taskId", (req, res) => {
  let t = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!t) return res.status(401).json({ error: "请先登录" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(t, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "登录已过期" }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.output_path) return res.status(404).json({ error: "文件不存在" });
  if (!fs.existsSync(task.output_path)) return res.status(404).json({ error: "文件已过期" });
  res.sendFile(task.output_path);
});

// ============================================================
// 下载结果图片
// ============================================================
router.get("/download/:taskId", (req, res) => {
  let t = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!t) return res.status(401).json({ error: "请先登录" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(t, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "登录已过期" }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.output_path) return res.status(404).json({ error: "文件不存在" });
  if (!fs.existsSync(task.output_path)) return res.status(404).json({ error: "文件已过期" });
  res.download(task.output_path);
});

// ============================================================
// 查看原始输入图片（历史记录查看用）
// ============================================================
router.get("/input/:taskId", (req, res) => {
  let t = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!t) return res.status(401).json({ error: "请先登录" });
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(t, process.env.JWT_SECRET || "your-jwt-secret-change-me");
    req.userId = decoded.userId;
  } catch(e) { return res.status(401).json({ error: "登录已过期" }); }
  const task = dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.taskId, req.userId]);
  if (!task || !task.input_path) return res.status(404).json({ error: "文件不存在" });
  if (!fs.existsSync(task.input_path)) return res.status(404).json({ error: "文件已过期" });
  res.sendFile(task.input_path);
});

module.exports = router;