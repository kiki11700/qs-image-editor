const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const https = require("https");

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

const MODELS = {
  upscale:       "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41606ed7d15a1184",
  upscale4k:     "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41606ed7d15a1184",
  styleTransfer: "timothybrooks/instruct-pix2pix:30c1d0b916a6f8efce20493f5d61ee27491ab9a60437c893c8316e6f0b6b3b3b",
  similar:       "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
};

async function runReplicate(model, input) {
  const client = getClient();
  if (!client) return null;
  const output = await client.run(model, { input });
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
// 转高清 (2x)
// ============================================================
async function upscale(inputPath, outputPath) {
  const client = getClient();
  if (client) {
    try {
      const url = await runReplicate(MODELS.upscale, { image: fs.createReadStream(inputPath) });
      if (url) { await downloadFile(url, outputPath); console.log("✅ AI 超分成功"); return outputPath; }
    } catch(e) { console.warn("AI upscale 失败:", e.message); }
  }
  const meta = await sharp(inputPath).metadata();
  await sharp(inputPath)
    .resize(Math.round(meta.width * 2), Math.round(meta.height * 2), { kernel: sharp.kernel.lanczos3, fit: "fill", withoutReduction: true })
    .sharpen({ sigma: 1.5, m1: 0.5, m2: 1.0 })
    .png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 转 4K
// ============================================================
async function upscaleTo4K(inputPath, outputPath) {
  const client = getClient();
  if (client) {
    try {
      const url = await runReplicate(MODELS.upscale, { image: fs.createReadStream(inputPath), scale: 4 });
      if (url) { await downloadFile(url, outputPath); console.log("✅ AI 4K超分成功"); return outputPath; }
    } catch(e) { console.warn("AI upscale4k 失败:", e.message); }
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
// 风格迁移
// ============================================================
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  const client = getClient();
  if (client) {
    try {
      const pt = stylePrompt || "动漫风格";
      const url = await runReplicate(MODELS.styleTransfer, {
        image: fs.createReadStream(inputPath),
        prompt: pt,
        negative_prompt: "blurry, low quality, distorted"
      });
      if (url) { await downloadFile(url, outputPath); console.log("✅ AI 风格迁移成功"); return outputPath; }
    } catch(e) { console.warn("AI style-transfer 失败:", e.message); }
  }

  const p = (stylePrompt || "").toLowerCase();
  let sat = 1.1, gamma = 1.0, blur = false, tint = { r: 0, g: 0, b: 0 };
  if (p.includes("动漫") || p.includes("anime") || p.includes("卡通")) { sat = 1.3; gamma = 0.9; tint = { r: 10, g: 5, b: 15 }; }
  else if (p.includes("油画") || p.includes("oil")) { sat = 1.2; gamma = 0.85; tint = { r: 5, g: 5, b: 0 }; }
  else if (p.includes("水彩") || p.includes("water")) { sat = 0.9; gamma = 1.1; blur = true; tint = { r: 0, g: 10, b: 20 }; }
  else if (p.includes("黑白") || p.includes("bw") || p.includes("gray") || p.includes("灰度")) {
    await sharp(inputPath).greyscale().png().toFile(outputPath); return outputPath;
  }
  else if (p.includes("复古") || p.includes("vintage") || p.includes("retro") || p.includes("怀旧")) { sat = 0.8; gamma = 0.9; tint = { r: 30, g: 15, b: 0 }; }
  else if (p.includes("赛博") || p.includes("cyber") || p.includes("neon")) { sat = 1.5; gamma = 0.95; tint = { r: 0, g: 20, b: 30 }; }

  let pipe = sharp(inputPath).modulate({ saturation: sat });
  if (tint.r || tint.g || tint.b) pipe = pipe.tint({ r: 255 + tint.r, g: 255 + tint.g, b: 255 + tint.b });
  if (gamma !== 1.0) pipe = pipe.gamma(gamma);
  if (blur) pipe = pipe.blur(1.5);
  await pipe.png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 出类似图
// ============================================================
async function generateSimilar(inputPath, outputPath) {
  const client = getClient();
  if (client) {
    try {
      const url = await runReplicate(MODELS.similar, {
        image: fs.createReadStream(inputPath),
        prompt: "same style, similar composition, detailed, high quality",
        negative_prompt: "ugly, blurry, low quality, different style",
        strength: 0.6,
        num_outputs: 1,
        scheduler: "DPMSolverMultistep",
        num_inference_steps: 25
      });
      if (url) { await downloadFile(url, outputPath); console.log("✅ AI 类似图生成成功"); return outputPath; }
    } catch(e) { console.warn("AI similar 失败:", e.message); }
  }

  const hueShift = Math.floor(Math.random() * 60) - 30;
  const satShift = 1.0 + (Math.random() * 0.5 - 0.25);
  const brightShift = 1.0 + (Math.random() * 0.2 - 0.1);
  await sharp(inputPath)
    .modulate({ brightness: brightShift, saturation: satShift, hue: hueShift })
    .png().toFile(outputPath);
  return outputPath;
}

module.exports = { upscale, styleTransfer, generateSimilar, upscaleTo4K };