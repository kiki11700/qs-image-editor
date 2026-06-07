require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pathMod = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const { initDb } = require("./db/database");

async function startServer() {
  await initDb();
  console.log("数据库初始化完成");

  // Railway 健康检查端点
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const { router: authRouter } = require("./routes/auth");
  const imageRouter = require("./routes/image");
  const paymentRouter = require("./routes/payment");
  const workflowRouter = require("./routes/workflow");

  app.use("/api/auth", authRouter);
  app.use("/api/image", imageRouter);
  app.use("/api/payment", paymentRouter);
  app.use("/api/workflow", workflowRouter);

  // 静态文件服务：优先使用 public/（独立 SPA），降级到 Vue 前端
  const publicPath = pathMod.join(__dirname, "public");
  const distPath = pathMod.join(__dirname, "frontend", "dist");
  const hasPublicIndex = fs.existsSync(pathMod.join(publicPath, "index.html"));
  const hasDistIndex = fs.existsSync(pathMod.join(distPath, "index.html"));

  if (hasPublicIndex) {
    console.log("  提供: public/（完整独立 SPA）");
    app.use(express.static(publicPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(pathMod.join(publicPath, "index.html"));
    });
  } else if (hasDistIndex) {
    console.log("  提供: frontend/dist/（Vue 前端）");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(pathMod.join(distPath, "index.html"));
    });
  }

  app.use((err, req, res, next) => {
    console.error("错误:", err.message || err);
    res.status(500).json({ error: err.message || "服务器内部错误" });
  });

  app.listen(PORT, () => {
    const deployedIndex = hasPublicIndex || hasDistIndex;
    console.log("====================================");
    console.log("  QS美图 - AI 智能修图");
    console.log("====================================");
    console.log("  访问地址: http://localhost:" + PORT);
    console.log("  状态: " + (deployedIndex ? "前端已加载" : "前端未构建"));
    console.log("====================================");
  });
}

startServer().catch(console.error);
