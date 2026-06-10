const sharp = require("sharp");
const fs = require("fs");
const https = require("https");

// ============================================================
// ��ͼȥ�׷��� - ��ȫ�滻 Replicate
//   1. �����ƣ�������
//   2. �ٶ� AI API�����ڽ�����
//   3. Sharp �����㷨�����ն��ף�
// ============================================================

let alibaba = null;
try { alibaba = require("./alibaba"); } catch(e) {}

let baiduAI = null;
try { baiduAI = require("./baidu"); } catch(e) {}

// ---------- Sharp ���� ----------
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
// ����ӿ�
// ============================================================

async function removeBackground(inputPath, outputPath) {
  // 1. �����ƣ�������
  if (alibaba) {
    try { var r = await alibaba.removeBackground(inputPath, outputPath); if (r) { console.log("������ ��ͼ�ɹ�"); return r; } } catch(e) { console.error("������ ��ͼʧ��:", e.message); }
  }
  // 2. �ٶ� AI��������
  if (baiduAI) {
    try { var r = await baiduAI.removeBackground(inputPath, outputPath); if (r) { console.log("�ٶ�AI ��ͼ�ɹ�"); return r; } } catch(e) { console.error("�ٶ�AI ��ͼʧ��:", e.message); }
  }
  // 3. Sharp ����
  console.log("Sharp ���׿�ͼ");
  return await removeWithSharp(inputPath, outputPath);
}

async function replaceBackground(inputPath, bgColor, outputPath) {
  // 1. ������
  if (alibaba) {
    try { var r = await alibaba.replaceBackground(inputPath, bgColor, outputPath); if (r) { console.log("������ �������ɹ�"); return r; } } catch(e) { console.error("������ ������ʧ��:", e.message); }
  }
  // 2. �ٶ� AI
  if (baiduAI) {
    try { var r = await baiduAI.replaceBackground(inputPath, bgColor, outputPath); if (r) { console.log("�ٶ�AI �������ɹ�"); return r; } } catch(e) { console.error("�ٶ�AI ������ʧ��:", e.message); }
  }
  // 3. ���غϳ�
  var tmpPath = outputPath.replace(/\.\w+$/, "_nobg.png");
  await removeBackground(inputPath, tmpPath);
  var meta = await sharp(tmpPath).metadata();
  var bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: bgColor || "#ffffff" } }).png().toBuffer();
  await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  try { fs.unlinkSync(tmpPath); } catch(e) {}
  return outputPath;
}

module.exports = { removeBackground, replaceBackground };
