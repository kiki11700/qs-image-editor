const sharp = require("sharp");
const fs = require("fs");
const https = require("https");

// ============================================================
// 抠图去底服务 - 完全替换 Replicate
//   1. 阿里云（主力）
//   2. 百度 AI API（国内降级）
//   3. Sharp 简易算法（最终兜底）
// ============================================================

let alibaba = null;
try { alibaba = require("./alibaba"); } catch(e) {}

let baiduAI = null;
try { baiduAI = require("./baidu"); } catch(e) {}

// ---------- Sharp 兜底 ----------
async function removeWithSharp(inputPath, outputPath) {
  var info = await sharp(inputPath).metadata();
  var { data, info: rawInfo } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  var w = rawInfo.width, h = rawInfo.height, c = rawInfo.channels;
  var pixels = new Uint8Array(data);
  var total = w * h;

  var rSum = 0, gSum = 0, bSum = 0, count = 0;
  var margin = Math.max(3, Math.min(15, Math.floor(Math.min(w, h) / 60)));
  for (var y = 0; y < margin; y++) for (var x = 0; x < w; x++) {
    var idx = (y * w + x) * c;
    rSum += pixels[idx]; gSum += pixels[idx+1]; bSum += pixels[idx+2]; count++;
  }
  for (var y = h - margin; y < h; y++) for (var x = 0; x < w; x++) {
    var idx = (y * w + x) * c;
    rSum += pixels[idx]; gSum += pixels[idx+1]; bSum += pixels[idx+2]; count++;
  }
  for (var y = margin; y < h - margin; y++) for (var x = 0; x < margin; x++) {
    var idx = (y * w + x) * c;
    rSum += pixels[idx]; gSum += pixels[idx+1]; bSum += pixels[idx+2]; count++;
  }
  for (var y = margin; y < h - margin; y++) for (var x = w - margin; x < w; x++) {
    var idx = (y * w + x) * c;
    rSum += pixels[idx]; gSum += pixels[idx+1]; bSum += pixels[idx+2]; count++;
  }
  var bgr = rSum / count, bgg = gSum / count, bgb = bSum / count;

  var alpha = new Uint8Array(total);
  var threshold = 50;
  for (var i = 0; i < total; i++) {
    var idx = i * c;
    var dr = pixels[idx] - bgr, dg = pixels[idx+1] - bgg, db = pixels[idx+2] - bgb;
    var dist = Math.sqrt(dr*dr + dg*dg + db*db);
    if (dist < threshold) alpha[i] = 0;
    else if (dist < threshold + 30) alpha[i] = Math.round(((dist - threshold) / 30) * 255);
    else alpha[i] = 255;
  }

  var rgba = Buffer.alloc(total * 4);
  for (var i = 0; i < total; i++) {
    var idx = i * c, out = i * 4;
    rgba[out] = pixels[idx]; rgba[out+1] = pixels[idx+1]; rgba[out+2] = pixels[idx+2];
    rgba[out+3] = alpha[i];
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outputPath);
  return outputPath;
}

// ============================================================
// 对外接口
// ============================================================

async function removeBackground(inputPath, outputPath) {
  // 1. 阿里云（主力）
  if (alibaba) {
    try { var r = await alibaba.removeBackground(inputPath, outputPath); if (r) { console.log("阿里云 抠图成功"); return r; } } catch(e) { console.error("阿里云 抠图失败:", e.message); }
  }
  // 2. 百度 AI（降级）
  if (baiduAI) {
    try { var r = await baiduAI.removeBackground(inputPath, outputPath); if (r) { console.log("百度AI 抠图成功"); return r; } } catch(e) { console.error("百度AI 抠图失败:", e.message); }
  }
  // 3. Sharp 兜底
  console.log("Sharp 兜底抠图");
  return await removeWithSharp(inputPath, outputPath);
}

async function replaceBackground(inputPath, bgColor, outputPath) {
  // 1. 阿里云
  if (alibaba) {
    try { var r = await alibaba.replaceBackground(inputPath, bgColor, outputPath); if (r) { console.log("阿里云 换背景成功"); return r; } } catch(e) { console.error("阿里云 换背景失败:", e.message); }
  }
  // 2. 百度 AI
  if (baiduAI) {
    try { var r = await baiduAI.replaceBackground(inputPath, bgColor, outputPath); if (r) { console.log("百度AI 换背景成功"); return r; } } catch(e) { console.error("百度AI 换背景失败:", e.message); }
  }
  // 3. 本地合成
  var tmpPath = outputPath.replace(/\.\w+$/, "_nobg.png");
  await removeBackground(inputPath, tmpPath);
  var meta = await sharp(tmpPath).metadata();
  var bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: bgColor || "#ffffff" } }).png().toBuffer();
  await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  try { fs.unlinkSync(tmpPath); } catch(e) {}
  return outputPath;
}

module.exports = { removeBackground, replaceBackground };
