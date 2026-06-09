const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================
// 统一 AI 模型配置
// 优先级: AI 模型 > Sharp (降级)
// Flux Pro 是当前效果最强的 AI 图像模型 (Black Forest Labs)
// ============================================================

// ============================================================
// Replicate AI 客户端
// ============================================================
let replicateClient = null;
function getClient() {
  if (replicateClient) return replicateClient;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === "your-replicate-api-token") return null;
  try {
    const Replicate = require("replicate");
    replicateClient = new Replicate({ auth: token });
    return replicateClient;
  } catch(e) {
    console.warn("Replicate 加载失败:", e.message);
    return null;
  }
}

// ----- AI 模型清单 -----
const MODELS = {
  upscale:       "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41606ed7d15a1184",
  upscale4k:     "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41606ed7d15a1184",
  styleTransfer: "timothybrooks/instruct-pix2pix:30c1d0b916a6f8efce20493f5d61ee27491ab9a60437c893c8316e6f0b6b3b3b",

  // 生成类任务 — Flux Pro 优先, SDXL 备选
  similar:       "black-forest-labs/flux-pro",
  similar_fb:    "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
};

async function runReplicate(model, input) {
  const client = getClient();
  if (!client) return null;
  let output;
  try {
    output = await client.run(model, { input });
  } catch (e) {
    console.warn("Replicate 调用失败:", model, e.message);
    return null;
  }
  let url;
  if (typeof output === "string") url = output;
  else if (Array.isArray(output) && output.length > 0) url = output[0];
  else if (output && output.url) url = output.url;
  else if (output && typeof output === "object") {
    for (const k of Object.keys(output)) {
      const v = output[k];
      if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) { url = v; break; }
    }
  }
  return url || null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

// ============================================================
// 转高清 (2x) — AI ESRGAN 优先, Sharp Lanczos 降级
// ============================================================
async function upscale(inputPath, outputPath) {
  if (getClient()) {
    const url = await runReplicate(MODELS.upscale, { image: fs.createReadStream(inputPath) });
    if (url) { await downloadFile(url, outputPath); console.log("AI 超分成功"); return outputPath; }
  }
  const meta = await sharp(inputPath).metadata();
  await sharp(inputPath)
    .resize(Math.round(meta.width * 2), Math.round(meta.height * 2),
      { kernel: sharp.kernel.lanczos3, fit: "fill", withoutReduction: true })
    .sharpen({ sigma: 1.5, m1: 0.5, m2: 1.0 })
    .png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 转 4K — AI 4x ESRGAN 优先
// ============================================================
async function upscaleTo4K(inputPath, outputPath) {
  if (getClient()) {
    const url = await runReplicate(MODELS.upscale, { image: fs.createReadStream(inputPath), scale: 4 });
    if (url) { await downloadFile(url, outputPath); console.log("AI 4K 超分成功"); return outputPath; }
  }
  const meta = await sharp(inputPath).metadata();
  const tw = Math.max(3840, meta.width * 4), th = Math.max(2160, meta.height * 4);
  await sharp(inputPath)
    .resize(tw, th, { kernel: sharp.kernel.lanczos3, fit: "fill", withoutReduction: true })
    .sharpen({ sigma: 2.0, m1: 0.5, m2: 1.0 })
    .png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 风格迁移 — AI img2img 风格转换
// 优先级: Flux Pro > InstructPix2Pix > Sharp
// Flux Pro: strength=0.75 大幅改风格, 保留构图
// InstructPix2Pix: 专为风格指令设计
// ============================================================
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  const client = getClient();
  const pt = stylePrompt || "anime style";

  // 风格关键词中英映射 (Prompt 质量直接影响输出)
  const styleEn = pt
    .replace(/动漫/g, "anime, cartoon style")
    .replace(/卡通/g, "cartoon, anime style")
    .replace(/油画/g, "oil painting style")
    .replace(/水彩/g, "watercolor painting style")
    .replace(/素描/g, "pencil sketch, line drawing style")
    .replace(/复古|怀旧/g, "vintage, retro style, nostalgic")
    .replace(/赛博/g, "cyberpunk style, neon lights")
    .replace(/像素/g, "pixel art, 8-bit retro style")
    .replace(/黑白/g, "black and white, monochrome");

  // ----- 策略一: Flux Pro (效果最强) -----
  if (client) {
    const url = await runReplicate(MODELS.similar, {
      image: fs.createReadStream(inputPath),
      prompt: styleEn + ", same composition, preserve the main subject",
      strength: 0.75,      // 高 strength = 大幅改变风格
      guidance: 4.0,
      steps: 30,
      output_format: "png"
    });
    if (url) { await downloadFile(url, outputPath); console.log("Flux Pro 风格迁移成功:", stylePrompt); return outputPath; }
  }

  // ----- 策略二: InstructPix2Pix (风格指令专用) -----
  if (client) {
    const url = await runReplicate(MODELS.styleTransfer, {
      image: fs.createReadStream(inputPath),
      prompt: pt,
      negative_prompt: "blurry, low quality, distorted"
    });
    if (url) { await downloadFile(url, outputPath); console.log("InstructPix2Pix 风格迁移成功:", stylePrompt); return outputPath; }
  }

  // ----- 策略三: Sharp 风格滤镜 (无 API 兜底) -----
  const px = pt.toLowerCase();
  if (px.includes("黑白") || px.includes("bw") || px.includes("灰度")) {
    await sharp(inputPath).greyscale().png().toFile(outputPath); return outputPath;
  }

  let sat = 1.1, gamma = 1.0, blur = false;
  const tint = { r: 0, g: 0, b: 0 };
  if (px.includes("动漫") || px.includes("anime") || px.includes("卡通")) { sat = 1.3; gamma = 1.111; tint.r = 10; tint.g = 5; tint.b = 15; }
  else if (px.includes("油画") || px.includes("oil")) { sat = 1.2; gamma = 1.176; tint.r = 5; tint.g = 5; }
  else if (px.includes("水彩") || px.includes("water")) { sat = 0.9; gamma = 1.1; blur = true; tint.b = 20; }
  else if (px.includes("复古") || px.includes("vintage") || px.includes("怀旧")) { sat = 0.8; gamma = 1.111; tint.r = 30; tint.g = 15; }
  else if (px.includes("赛博") || px.includes("cyber") || px.includes("neon")) { sat = 1.5; gamma = 1.053; tint.b = 30; }

  let pipe = sharp(inputPath).modulate({ saturation: sat });
  if (tint.r || tint.g || tint.b) pipe = pipe.tint({ r: 255 + tint.r, g: 255 + tint.g, b: 255 + tint.b });
  if (gamma !== 1.0) pipe = pipe.gamma(gamma);
  if (blur) pipe = pipe.blur(1.5);
  await pipe.png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 出类似图 — AI img2img 生成
// 优先级: Flux Pro > SDXL > Sharp
// 与风格迁移的区别: strength 更低 (=0.5), 保留原风格+构图
// ============================================================
async function generateSimilar(inputPath, outputPath) {
  const client = getClient();

  // ----- 策略一: Flux Pro -----
  if (client) {
    const url = await runReplicate(MODELS.similar, {
      image: fs.createReadStream(inputPath),
      prompt: "same composition, similar style, high detail, professional photography",
      strength: 0.5,
      guidance: 3.5,
      steps: 30,
      output_format: "png"
    });
    if (url) { await downloadFile(url, outputPath); console.log("Flux Pro 类似图生成成功"); return outputPath; }

    // ----- 策略二: SDXL 备选 -----
    console.warn("Flux Pro 降级到 SDXL");
    const url2 = await runReplicate(MODELS.similar_fb, {
      image: fs.createReadStream(inputPath),
      prompt: "same style, similar composition, detailed, high quality",
      negative_prompt: "ugly, blurry, low quality",
      strength: 0.6,
      num_outputs: 1,
      scheduler: "DPMSolverMultistep",
      num_inference_steps: 25
    });
    if (url2) { await downloadFile(url2, outputPath); console.log("SDXL 类似图生成成功"); return outputPath; }
  }

  // ----- 策略三: Sharp 终极降级 -----
  const hueShift = Math.floor(Math.random() * 60) - 30;
  const satShift = 1.0 + (Math.random() * 0.5 - 0.25);
  const brightShift = 1.0 + (Math.random() * 0.2 - 0.1);
  await sharp(inputPath)
    .modulate({ brightness: brightShift, saturation: satShift, hue: hueShift })
    .sharpen({ sigma: 0.5 })
    .png().toFile(outputPath);
  console.log("Sharp 降级: 无 API");
  return outputPath;
}

module.exports = { upscale, styleTransfer, generateSimilar, upscaleTo4K };

