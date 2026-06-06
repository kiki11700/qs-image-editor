# QS美图 — AI 智能修图

> 一个可上线到生产环境的 AI 图片处理网页工具。
> 前端 Vue 3 + Vite，后端 Express + SQL.js/PostgreSQL。
> 图片处理使用 Replicate API（AI 云 GPU），降级方案用 Sharp。

## 快速开始（开发模式）

\\ash
# 1. 安装依赖
npm install && cd frontend && npm install && cd ..

# 2. 启动开发环境（前后端分离）
# 方式 A：双击 start.bat
# 方式 B：命令行
npm run dev:backend     # 后端 http://localhost:3000
npm run dev:frontend    # 前端 http://localhost:5173

# 3. 打开浏览器访问 http://localhost:5173
\
## 生产模式

\\ash
npm run build           # 编译前端
npm start               # 启动服务 -> http://localhost:3000
\
## 环境变量

复制 .env 文件并填写：

| 变量 | 必填 | 说明 |
|------|------|------|
| PORT | 否 | 服务端口（默认 3000） |
| JWT_SECRET | 是 | JWT 签名密钥，改成随机字符串 |
| OPENAI_API_KEY | 否 | OpenAI API Key（可选备选） |
| REPLICATE_API_TOKEN | 否 | 推荐！Replicate Token，注册免费送\ |
| FREE_TRIAL_CREDITS | 否 | 新用户赠送次数（默认 3） |

> 不填 REPLICATE_API_TOKEN 时使用 Sharp 降级，效果有限。
> 填上后自动使用 AI 模型处理，质量大幅提升。

## 部署到 Railway（不备案）

Railway.app 提供 PostgreSQL、Redis、CDN，无需国内备案。

\\ash
# 1. 推送到 GitHub
# 2. Railway 创建项目 -> Deploy from GitHub
# 3. 添加 PostgreSQL 插件
# 4. 添加 Redis 插件
# 5. 设置环境变量：
#    - NODE_ENV=production
#    - JWT_SECRET=<随机字符串>
#    - REPLICATE_API_TOKEN=<你的 token>
# 6. 部署完成
\
Railway 免费额度：每月\，PostgreSQL/Redis 免费，够小项目跑 1-2 个月。

## 功能列表

| 功能 | 说明 | AI 方案 | 降级方案 |
|------|------|---------|---------|
| 转高清 | AI 提升图片分辨率 | Replicate ESRGAN | Sharp resize |
| 转 4K | 极致超清化 | Replicate ESRGAN (4x) | Sharp resize |
| 抠图去底 | 自动识别主体去除背景 | Replicate rembg | Sharp 转 PNG |
| 更换背景 | 替换背景颜色 | Replicate rembg + 合成 | Sharp 合成 |
| 转矢量图 | 位图转 SVG 矢量 | potrace | 边缘检测 SVG |
| 转风格 | AI 风格迁移 | Replicate pix2pix | OpenAI DALL-E |
| 出类似图 | 生成相似风格图片 | Replicate SD img2img | OpenAI variation |

## 技术栈

前端: Vue 3 + Vite + Element Plus + TailwindCSS + Pinia
后端: Node.js + Express + SQL.js（开发）/ PostgreSQL（生产）
队列: Redis + BullMQ（生产）
AI: Replicate API / OpenAI API / Sharp（降级）
部署: Railway.app / Docker

## 项目结构

\qs-image-editor/
  server.js           入口
  routes/             路由（auth/image/payment/workflow）
  services/           服务（replicate/ai/rembg/vectorize/credit）
  db/                 数据库
  frontend/src/views/ 页面（Home/Login/Recharge/History/Workflow）
  railway.toml        Railway 部署配置
  README.md           本文档
\