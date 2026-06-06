# QS美图 — 完整技术方案与执行路线图

> 版本：v1.0
> 目标：从零到可上线的 AI 图片处理网页工具
> 数据来源：GitHub 头部项目分析 + 行业最佳实践 + 昨晚代码复盘

---

## 一、产品定位

**QS美图 = AI 图片处理工具**

不是 Canva（设计平台），不是 Photoshop（专业编辑器），而是：
> 上传一张图 → 选择功能 → 等几秒 → 下载结果

目标用户：
- 电商卖家（抠产品图、换背景）
- 社交媒体运营（做封面图、调风格）
- 普通用户（修照片、去水印、转高清）

核心理念：**一个功能做好，比一百个功能做烂强一万倍。**

---

## 二、当前行业最佳实践

### 2.1 技术栈对比

参考项目：
- canva-clone（⭐487）：Next.js + Hono.js + Fabric.js + PostgreSQL + Stripe
- omniscient（⭐117）：Next.js + OpenAI + Replicate + Clerk + Stripe
- remove.bg（行业标杆）：Python + rembg + 自研模型

推荐方案（最务实）：
`
前端：Vue 3 + Vite（保留已有代码）
后端：Node.js Express（保留）+ PostgreSQL 替换 SQL.js
队列：Redis + BullMQ（异步处理大图）
AI：Replicate API（开局）+ 自建 GPU（跑量后）
存储：阿里云 OSS（不是本地磁盘）
支付：支付宝当面付（国内必需）
`

---

## 三、系统架构（生产级）

`
用户浏览器 → Nginx → Node.js API → Redis(队列) → Worker(异步) → Replicate API
                               ↘ PostgreSQL      ↗  阿里云 OSS
`

关键流程：
1. 用户上传图片 → 存 OSS → 返回 taskId
2. 任务入 Redis 队列 → Worker 取出处理
3. Worker 调用 Replicate API → 结果存 OSS → 更新数据库
4. 前端轮询 taskId → 拿到结果

---

## 四、数据库设计

### 为什么不能再用 SQL.js

| 对比项 | SQL.js | PostgreSQL | 影响 |
|--------|--------|-----------|------|
| 并发写入 | 单线程锁死 | 多连接并发 | SQL.js 在线用户>5 就会崩 |
| 数据持久化 | 覆盖写文件 | WAL 日志 | 服务异常重启可能丢数据 |
| 查询能力 | 基础 SQL | 全文检索/窗口函数 | 功能受限 |
| 云原生 | 不支持 | RDS/Supabase 原生支持 | 部署受限 |

结论：上线前必须迁移到 PostgreSQL。

### 核心表设计

`sql
-- 用户表
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  credits       INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMP DEFAULT NOW()
);

-- 任务表（核心）
CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER REFERENCES users(id),
  type          VARCHAR(30) NOT NULL,      -- upscale/remove-bg/vectorize/...
  status        VARCHAR(20) DEFAULT 'pending', -- pending/processing/completed/failed
  input_url     TEXT NOT NULL,              -- OSS 地址
  output_url    TEXT,                       -- OSS 地址
  error_msg     TEXT,
  cost_credits  INTEGER DEFAULT 1,
  created_at    TIMESTAMP DEFAULT NOW(),
  completed_at  TIMESTAMP
);

-- 订单表
CREATE TABLE payment_orders (
  id            UUID PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id),
  amount        DECIMAL(10,2) NOT NULL,
  credits       INTEGER NOT NULL,
  channel       VARCHAR(20) NOT NULL,       -- alipay/wxpay
  status        VARCHAR(20) DEFAULT 'pending',
  trade_no      VARCHAR(100),
  created_at    TIMESTAMP DEFAULT NOW(),
  paid_at       TIMESTAMP
);

-- 额度日志
CREATE TABLE credit_logs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id),
  amount        INTEGER NOT NULL,
  type          VARCHAR(20) NOT NULL,       -- bonus/deduct/recharge/refund
  remark        VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- 兑换码
CREATE TABLE redemption_codes (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(50) UNIQUE NOT NULL,
  credits       INTEGER NOT NULL,
  used          BOOLEAN DEFAULT FALSE,
  expires_at    TIMESTAMP
);
`

---

## 五、各功能的真实实现

### 5.1 抠图去底

方案 A（推荐 MVP）：Replicate API
- 模型：nateraw/rembg
- 成本：~.01/次
- 质量：⭐⭐⭐⭐⭐

方案 B（跑量后省钱）：自部署 Python rembg
- pip install rembg
- from rembg import remove
- 注意：第一次启动要下载 u2net 模型 ~170MB
- 单独一个 Python Docker 容器跑

⚠️ 不要用 sharp 假抠图——用户用一次就发现被骗了

### 5.2 转高清（Upscale）

方案 A（推荐 MVP）：Replicate API
- 模型：nightmareai/real-esrgan
- 成本：~.02/次
- 效果：2x-4x 放大，画质明显提升

方案 B（降级）：Sharp resize
- sharp(input).resize(width*2, height*2)
- 效果一般但免费

⚠️ 昨晚 ai.js 全调的是 OpenAI createVariation()
- 这不是高清放大，是"生成相似图"
- 输出 1024x1024，不是原图放大

### 5.3 转矢量图（Vectorize）

方案 A：potrace（最成熟的方案）
- 原图 → BMP → potrace -s → SVG
- 质量：⭐⭐⭐⭐

方案 B：VTracer（纯 Rust，更先进）
- pip install vtracer
- vtracer --input image.png --output result.svg

⚠️ 昨晚的 Sobel 边缘检测方案：
- 生成的 SVG 有大量断线
- 文件体积大且不可编辑
- 建议直接换成 potrace

### 5.4 转风格 / 出类似图

风格迁移：
- Replicate → timothybrooks/instruct-pix2pix
- 输入：图片 + 文字描述风格

出类似图：
- Replicate → stability-ai/stable-diffusion
- img2img 模式，原图作为 init_image

---

## 六、支付系统（真实对接）

### 支付宝接入步骤

1. 注册支付宝开放平台：https://open.alipay.com
2. 创建"网页应用"，获取 APP_ID
3. 生成 RSA2 密钥（应用私钥 + 支付宝公钥）
4. 选择产品：电脑网站支付 + 手机网站支付

流程：
`
用户选套餐 → 后端创建订单 → 调用 alipay.trade.page.pay
                                     ↓
                             返回支付表单/二维码
                                     ↓
                             用户扫码支付完成
                                     ↓
                        支付宝异步通知 POST /api/payment/notify
                                     ↓
                             验签 → 加额度 → 返回 success
`

### 套餐定价建议

| 套餐名 | 次数 | 价格 | 单价 | 定位 |
|--------|------|------|------|------|
| 尝鲜包 | 10次 | ¥9.9 | ¥0.99 | 低门槛 |
| 标准包 | 50次 | ¥29.9 | ¥0.60 | 主力套餐 |
| 畅享包 | 200次 | ¥79.9 | ¥0.40 | 高频用户 |
| 专业包 | 1000次 | ¥199 | ¥0.20 | 重度用户 |

免费策略：注册送 3 次（不是 8 次）

---

## 七、部署方案

### MVP 部署（¥250-350/月）

`
阿里云 ECS 2核4G（¥80/月）
   Docker:
     - Node.js App
     - PostgreSQL
     - Redis
   数据盘 40GB（¥20/月）
   CDN（¥20-50/月）
   Replicate API（¥100-200/月）
   OSS（¥10/月）
   域名（¥60/年）
`

### 域名备案

国内上线必经流程：
1. 阿里云/腾讯云购买域名
2. 实名认证（1-2 天）
3. ICP 备案（10-20 个工作日，需拍照）
4. 备案号挂网站底部
5. 公安备案（部分地区要求）

不想备案：服务器放香港

---

## 八、昨晚代码问题 & 修复优先级

### P0（必须马上修）

| 问题 | 原因 | 修复方案 |
|------|------|---------|
| Home.vue 首页空白 | 模板部分是空的 | 补全首页 UI（工具选择+上传+预览） |
| 抠图是假的 | rembg.js 只做了格式转换 | 对接 Replicate 真实抠图 API |
| 转高清是假的 | ai.js 调的是 createVariation | 对接 Replicate ESRGAN |
| SQL.js 不支持并发 | 选型错误 | 迁移到 PostgreSQL |
| 图片存本地 | Node 重启就丢 | 改为阿里云 OSS |

### P1（上线前必须修）

| 问题 | 修复方案 |
|------|---------|
| 支付是模拟的 | 对接支付宝官方接口 |
| 没有任务队列 | 引入 Redis + BullMQ |
| 中文编码乱码 | 统一 UTF-8 |
| 缺少错误处理 | 加 Winston 日志 + 全局错误中间件 |

### P2（分批优化）

| 问题 | 修复方案 |
|------|---------|
| 矢量图质量差 | 改用 potrace |
| 没有频率限制 | 加 rate-limit 中间件 |
| 没 Docker 化 | 写 Dockerfile |

---

## 九、执行路线图（6 周）

### 第 1 周：基础设施

- 搭建 PostgreSQL + 写迁移脚本
- OSS 存储服务（图片上传到 OSS）
- Redis + BullMQ 任务队列
- 重写 API 路由（统一错误格式）
- 全局中间件：JWT 刷新/限流/日志
- Docker 化部署到 ECS

### 第 2 周：图片处理引擎

- 注册 Replicate，调通抠图 API
- 调通转高清 API（ESRGAN）
- 实现转矢量（potrace）
- 实现转风格 + 出类似图
- 实现降级方案（Sharp 兜底）
- Worker 压力测试

### 第 3 周：前端重写

- 重写 Home.vue（工具选择+拖拽上传+参数面板）
- 图片对比预览（原图 vs 结果）
- 登录/注册 UI 完善
- 充值页面（套餐+支付宝二维码）
- 历史记录（状态轮询+下载）
- 工作流页面（链式处理）
- 响应式适配

### 第 4 周：支付 + 管理后台

- 申请支付宝商户账号
- 对接支付宝当面付 API
- 支付全流程测试
- 兑换码管理
- 管理后台（用户/订单/统计）

### 第 5 周：打磨 + 部署

- 性能优化（图片压缩/CDN 预热）
- 异常处理（弱网/大图/超时）
- Docker Compose 一键部署
- 域名购买 + 备案提交
- SSL 证书 + Nginx 配置
- 预上线测试

### 第 6 周：上线 + 运营

- 正式上线
- 监控配置（错误告警/服务器指标）
- 帮助文档 + 使用指南
- 种子用户内测
- 收集反馈 + 迭代
- 市场推广（小红书/抖音/知乎）

---

## 十、关键技术实现示例

### BullMQ 任务队列

`js
// Queue: 用户提交后立即返回 taskId
const { Queue } = require("bullmq");
const imageQueue = new Queue("image-processing", {
  connection: { host: "localhost", port: 6379 }
});

// API 路由
router.post("/process", authMiddleware, async (req, res) => {
  // 1. 验证额度
  // 2. 上传原图到 OSS
  // 3. 扣除额度 + 创建数据库记录
  // 4. 提交到任务队列（立即返回）
  await imageQueue.add("process", { taskId, type, inputUrl, params });
  // 5. 返回 taskId
  res.json({ taskId, status: "pending" });
});

// Worker（单独进程）
const { Worker } = require("bullmq");
const worker = new Worker("image-processing", async (job) => {
  const { taskId, type, inputUrl } = job.data;
  let outputUrl;
  switch (type) {
    case "remove-bg":
      outputUrl = await callReplicate("nateraw/rembg", { image: inputUrl });
      break;
    case "upscale":
      outputUrl = await callReplicate("nightmareai/real-esrgan", { image: inputUrl });
      break;
    // ...
  }
  // 更新数据库为 completed
}, { concurrency: 3 });
`

### 前端轮询

`js
async function submitTask(file, toolType) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("type", toolType);
  const res = await api.post("/image/process", formData);
  return await pollTask(res.data.taskId);
}

async function pollTask(taskId, maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await api.get(/image/task/);
    if (res.data.status === "completed") return res.data;
    if (res.data.status === "failed") throw new Error(res.data.errorMsg);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("处理超时");
}
`

---

## 十一、总投入估算

| 项目 | 估算 |
|------|------|
| 开发工时 | 4-6 周（全职） |
| 服务器 | ¥250-350/月 |
| Replicate API | ¥100-300/月 |
| 域名+备案 | ¥60/年 + 2-3 周 |
| 支付宝接入 | 免费（需个体工商户） |

首月启动成本：**约 ¥500-800（不含人工）**

---

## 核心结论

昨晚方向没错，但三个硬伤必须改：
1. SQL.js → PostgreSQL（不改：上线就崩）
2. fake 抠图 → 真实 API（不改：用户流失）
3. 本地存文件 → OSS（不改：无法扩展）

最省力的 MVP 路径：
- 保留 Vue 3 前端
- 保留 Express 后端框架
- 数据库换 PostgreSQL
- 图片存阿里云 OSS
- 加 Redis + BullMQ 做异步队列
- 用 Replicate API 做真实图片处理
- 接支付宝收款
- Docker 部署到 ECS