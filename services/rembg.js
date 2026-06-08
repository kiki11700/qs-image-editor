const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================
// Replicate AI 抠图支持
// ============================================================
let replicateClient = null;
function getClient() {
  if (replicateClient) return replicateClient;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  try {
    const Replicate = require("replicate");
    replicateClient = new Replicate({ auth: token });
    return replicateClient;
  } catch(e) {
    console.warn("Replicate 加载失败:", e.message);
    return null;
  }
}

async function removeBackgroundWithAI(inputPath, outputPath) {
  const client = getClient();
  if (!client) return null;
  const output = await client.run("nateraw/rembg", {
    input: { image: fs.createReadStream(inputPath) }
  });
  let url;
  if (typeof output === "string") url = output;
  else if (Array.isArray(output) && output.length > 0) url = output[0];
  else if (output && output.url) url = output.url;
  else return null;
  await downloadFile(url, outputPath);
  return outputPath;
}

async function replaceBackgroundWithAI(inputPath, bgColor, outputPath) {
  const client = getClient();
  if (!client) return null;
  const output = await client.run("nateraw/rembg", {
    input: { image: fs.createReadStream(inputPath) }
  });
  let url;
  if (typeof output === "string") url = output;
  else if (Array.isArray(output) && output.length > 0) url = output[0];
  else return null;
  const tmpPath = outputPath.replace(/\.\w+$/, "_nobg.png");
  await downloadFile(url, tmpPath);
  const color = bgColor || "#ffffff";
  const metadata = await sharp(tmpPath).metadata();
  const bg = await sharp({
    create: { width: metadata.width, height: metadata.height, channels: 4, background: color }
  }).png().toBuffer();
  await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  return outputPath;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

// ============================================================
// 主入口：优先 AI，失败回退 sharp
// ============================================================

async function removeBackground(inputPath, outputPath) {
  try {
    const aiResult = await removeBackgroundWithAI(inputPath, outputPath);
    if (aiResult) { console.log("✅ AI 抠图成功:", path.basename(outputPath)); return aiResult; }
  } catch(e) { console.warn("⚠️ AI 抠图失败，回退 sharp:", e.message); }

  // === Sharp 回退：四角采样 + 颜色距离 ===
  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const sampleSize = Math.max(5, Math.min(15, Math.floor(Math.min(width, height) / 20)));
  const cornerSamples = [];
  const sampleCorner = (sx, sy, cnt) => {
    for (let y = sy; y < Math.min(sy + cnt, height); y++)
      for (let x = sx; x < Math.min(sx + cnt, width); x++) {
        const idx = (y * width + x) * channels;
        cornerSamples.push([data[idx], data[idx+1], data[idx+2]]);
      }
  };
  sampleCorner(0, 0, sampleSize);
  sampleCorner(width - sampleSize, 0, sampleSize);
  sampleCorner(0, height - sampleSize, sampleSize);
  sampleCorner(width - sampleSize, height - sampleSize, sampleSize);

  if (cornerSamples.length === 0) { await sharp(inputPath).png().toFile(outputPath); return outputPath; }

  const bgR = Math.round(cornerSamples.reduce((s,c) => s+c[0],0) / cornerSamples.length);
  const bgG = Math.round(cornerSamples.reduce((s,c) => s+c[1],0) / cornerSamples.length);
  const bgB = Math.round(cornerSamples.reduce((s,c) => s+c[2],0) / cornerSamples.length);
  const variance = cornerSamples.reduce((s,c) => s + Math.pow(c[0]-bgR,2) + Math.pow(c[1]-bgG,2) + Math.pow(c[2]-bgB,2), 0) / cornerSamples.length;
  const threshold = Math.max(25, Math.min(70, Math.sqrt(variance) * 2.5));

  const rgbaData = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const rgbaIdx = (y * width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const dist = Math.sqrt(Math.pow(r-bgR,2) + Math.pow(g-bgG,2) + Math.pow(b-bgB,2));
      let alpha;
      if (dist < threshold) alpha = 0;
      else if (dist < threshold * 2.5) alpha = Math.round(((dist - threshold) / (threshold * 1.5)) * 255);
      else alpha = 255;
      let existingAlpha = 255;
      if (channels === 4) existingAlpha = data[idx + 3];
      rgbaData[rgbaIdx] = r;
      rgbaData[rgbaIdx+1] = g;
      rgbaData[rgbaIdx+2] = b;
      rgbaData[rgbaIdx+3] = Math.min(alpha, existingAlpha);
    }
  }
  await sharp(rgbaData, { raw: { width, height, channels: 4 } }).png().toFile(outputPath);
  return outputPath;
}

async function replaceBackground(inputPath, bgColor, outputPath) {
  try {
    const aiResult = await replaceBackgroundWithAI(inputPath, bgColor, outputPath);
    if (aiResult) { console.log("✅ AI 换背景成功:", path.basename(outputPath)); return aiResult; }
  } catch(e) { console.warn("⚠️ AI 换背景失败，回退 sharp:", e.message); }

  const color = bgColor || "#ffffff";
  const tmpPath = outputPath.replace(/\.\w+$/, "_tmp_nobg.png");
  await removeBackground(inputPath, tmpPath);
  const metadata = await sharp(tmpPath).metadata();
  const bgBuffer = await sharp({
    create: { width: metadata.width, height: metadata.height, channels: 4, background: color }
  }).png().toBuffer();
  await sharp(bgBuffer).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  return outputPath;
}

module.exports = { removeBackground, replaceBackground };