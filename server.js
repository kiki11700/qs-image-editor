require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pathMod = require("path");

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

  // Serve the Vue frontend if built, otherwise fall back to public/
  const distPath = pathMod.join(__dirname, "frontend", "dist");
  const hasDist = require("fs").existsSync(pathMod.join(distPath, "index.html"));

  if (hasDist) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(pathMod.join(distPath, "index.html"));
    });
  } else {
    app.use(express.static(pathMod.join(__dirname, "public")));
  }

  app.use((err, req, res, next) => {
    console.error("错误:", err.message || err);
    res.status(500).json({ error: err.message || "服务器内部错误" });
  });

  app.listen(PORT, () => {
    const hasDist = require("fs").existsSync(pathMod.join(__dirname, "frontend", "dist", "index.html"));
    console.log("====================================");
    console.log("  QS美图 - AI 智能修图");
    console.log("====================================");
    console.log("  访问地址: http://localhost:" + PORT);
    if (hasDist) {
      console.log("  状态: Vue 前端已加载");
    } else {
      console.log("  状态: 静态模式（运行 npm run build 启用Vue前端）");
    }
    console.log("====================================");
  });
}

startServer().catch(console.error);
