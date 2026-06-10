const sharp = require("sharp");
const fs = require("fs");
const https = require("https");

// ============================================================
// 统一 AI 服务 - 完全替换 Replicate
//   1. 阿里云（主力）
//   2. Sharp 算法（终极兜底）
// ============================================================

let alibaba = null;
try { alibaba = require("./alibaba"); } catch(e) { console.error("阿里云 AI 调用失败:", e && e.message || "unknown"); }

function downloadFile(url, dest) {
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(dest);
    var mod = url.startsWith("https") ? https : require("http");
    mod.get(url, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", function() { file.close(); resolve(dest); });
    }).on("error", function(err) { file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err); });
  });
}

// ============================================================
// 1. 转高清 (2x)
// ============================================================
async function upscale(inputPath, outputPath) {
  if (alibaba) {
    try { var r = await alibaba.upscale4K(inputPath, outputPath); if (r) { console.log("阿里云 超分成功"); return r; } } catch(e) { console.error("阿里云 AI 调用失败:", e && e.message || "unknown"); }
  }
  var meta = await sharp(inputPath).metadata();
  await sharp(inputPath).resize(Math.round(meta.width * 2), Math.round(meta.height * 2), { kernel: sharp.kernel.lanczos3, fit: "fill", withoutReduction: true }).sharpen({ sigma: 1.5, m1: 0.5, m2: 1.0 }).png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 2. 转 4K 高清
// ============================================================
async function upscaleTo4K(inputPath, outputPath) {
  if (alibaba) {
    try { var r = await alibaba.upscale4K(inputPath, outputPath); if (r) { console.log("阿里云 转4K成功"); return r; } } catch(e) { console.error("阿里云 AI 调用失败:", e && e.message || "unknown"); }
  }
  var meta = await sharp(inputPath).metadata();
  var tw = Math.max(3840, meta.width * 4), th = Math.max(2160, meta.height * 4);
  await sharp(inputPath).resize(tw, th, { kernel: sharp.kernel.lanczos3, fit: "fill", withoutReduction: true }).sharpen({ sigma: 2.0, m1: 0.5, m2: 1.0 }).png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 3. 风格迁移
// ============================================================
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  if (alibaba) {
    try { var r = await alibaba.styleTransfer(inputPath, stylePrompt, outputPath); if (r) { console.log("阿里云 风格迁移成功"); return r; } } catch(e) { console.error("阿里云 AI 调用失败:", e && e.message || "unknown"); }
  }
  var pt = stylePrompt || "anime style";
  var px = pt.toLowerCase();
  if (px.includes("黑白") || px.includes("bw") || px.includes("灰度")) { await sharp(inputPath).greyscale().png().toFile(outputPath); return outputPath; }
  var sat = 1.1, gamma = 1.0, blur = false, tint = { r: 0, g: 0, b: 0 };
  if (px.includes("动漫") || px.includes("anime") || px.includes("卡通")) { sat = 1.3; gamma = 1.111; tint.r = 10; tint.g = 5; tint.b = 15; }
  else if (px.includes("油画") || px.includes("oil")) { sat = 1.2; gamma = 1.176; tint.r = 5; tint.g = 5; }
  else if (px.includes("水彩") || px.includes("water")) { sat = 0.9; gamma = 1.1; blur = true; tint.b = 20; }
  else if (px.includes("复古") || px.includes("vintage") || px.includes("怀旧")) { sat = 0.8; gamma = 1.111; tint.r = 30; tint.g = 15; }
  else if (px.includes("赛博") || px.includes("cyber") || px.includes("neon")) { sat = 1.5; gamma = 1.053; tint.b = 30; }
  var pipe = sharp(inputPath).modulate({ saturation: sat });
  if (tint.r || tint.g || tint.b) pipe = pipe.tint({ r: 255 + tint.r, g: 255 + tint.g, b: 255 + tint.b });
  if (gamma !== 1.0) pipe = pipe.gamma(gamma);
  if (blur) pipe = pipe.blur(1.5);
  await pipe.png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 4. 出类似图
// ============================================================
async function generateSimilar(inputPath, outputPath) {
  if (alibaba) {
    try { var r = await alibaba.generateSimilar(inputPath, outputPath); if (r) { console.log("阿里云 出类似图成功"); return r; } } catch(e) { console.error("阿里云 AI 调用失败:", e && e.message || "unknown"); }
  }
  var hueShift = Math.floor(Math.random() * 60) - 30;
  var satShift = 1.0 + (Math.random() * 0.5 - 0.25);
  var brightShift = 1.0 + (Math.random() * 0.2 - 0.1);
  await sharp(inputPath).modulate({ brightness: brightShift, saturation: satShift, hue: hueShift }).sharpen({ sigma: 0.5 }).png().toFile(outputPath);
  return outputPath;
}

module.exports = { upscale, upscaleTo4K, styleTransfer, generateSimilar };
