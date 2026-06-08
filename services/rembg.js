// ============================================================
// 高性能抠图去底 - 多重策略融合
// 1. Replicate AI 优先（需要 API 余额）
// 2. Sharp 增强版边缘检测算法（0依赖）
// ============================================================
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ---------- Replicate AI 抠图 ----------
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
    return null;
  }
}

async function removeBackgroundWithAI(inputPath, outputPath) {
  const client = getClient();
  if (!client) return null;
  try {
    const output = await client.run(
      "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
      { input: { image: fs.createReadStream(inputPath) } }
    );
    let url;
    if (typeof output === "string" && output.startsWith("http")) url = output;
    else if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") url = output[0];
    else if (output && typeof output === "object") {
      // Try common keys
      for (const k of ["composite", "output", "mask", "result", "image", "url"]) {
        const v = output[k];
        if (typeof v === "string" && v.startsWith("http")) { url = v; break; }
      }
    }
    if (!url) { console.log("AI rembg: unexpected output format"); return null; }
    await downloadFile(url, outputPath);
    console.log("AI rembg success");
    return outputPath;
  } catch(e) {
    console.warn("AI rembg failed:", e.message);
    return null;
  }
}

// ---------- AI 换背景 ----------
async function replaceBackgroundWithAI(inputPath, bgColor, outputPath) {
  const client = getClient();
  if (!client) return null;
  try {
    const output = await client.run(
      "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
      { input: { image: fs.createReadStream(inputPath) } }
    );
    let url;
    if (typeof output === "string" && output.startsWith("http")) url = output;
    else if (Array.isArray(output) && output.length > 0) url = output[0];
    else return null;
    const tmpPath = outputPath.replace(/\.\w+$/, "_nobg.png");
    await downloadFile(url, tmpPath);
    const color = bgColor || "#ffffff";
    const meta = await sharp(tmpPath).metadata();
    const bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: color } }).png().toBuffer();
    await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.log("AI replace-bg success");
    return outputPath;
  } catch(e) {
    console.warn("AI replace-bg failed:", e.message);
    return null;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const mod = url.startsWith("https") ? https : require("http");
    mod.get(url, (res) => {
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
// Sharp 增强版抠图算法（0依赖，纯本地运算）
// ============================================================
async function removeBackground(inputPath, outputPath) {
  // 先试 AI
  try {
    const aiResult = await removeBackgroundWithAI(inputPath, outputPath);
    if (aiResult) return aiResult;
  } catch(e) { console.warn("AI rembg retry failed"); }

  // === Sharp 增强版 ===
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height, c = info.channels;
  const pixels = new Uint8Array(data);

  // Step 1: 从图像边缘密集采样背景色
  const samples = [];
  const margin = Math.max(3, Math.min(20, Math.floor(Math.min(w, h) / 50)));

  // 上边缘和下边缘（每行采样步长）
  const stepX = Math.max(1, Math.floor(w / 100));
  const stepY = Math.max(1, Math.floor(h / 100));

  for (let x = margin; x < w - margin; x += stepX) {
    // 上边缘
    for (let y = 0; y < margin; y++) {
      const idx = (y * w + x) * c;
      samples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
    // 下边缘
    for (let y = h - margin; y < h; y++) {
      const idx = (y * w + x) * c;
      samples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
  }
  for (let y = margin; y < h - margin; y += stepY) {
    // 左边缘
    for (let x = 0; x < margin; x++) {
      const idx = (y * w + x) * c;
      samples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
    // 右边缘
    for (let x = w - margin; x < w; x++) {
      const idx = (y * w + x) * c;
      samples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
  }

  // Step 2: K-means 聚类找到主要背景色（简化版：找到像素数量最多的颜色簇）
  const clusters = findDominantColors(samples, 3);

  // Step 3: 计算每个像素到最近背景的色差
  const rgbaData = Buffer.alloc(w * h * 4);

  // 先计算每个背景簇的阈值（基于标准差）
  const thresholds = clusters.map(cl => {
    const vars = samples.filter(s =>
      colorDist(s, cl.color) < 40
    ).map(s => colorDist(s, cl.color));
    const avgVar = vars.length > 0 ? vars.reduce((a,b) => a+b, 0) / vars.length : 20;
    return Math.max(20, Math.min(80, avgVar * 2.5));
  });

  // 同时计算全图亮度直方图用于辅助判断
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += c) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
    hist[lum]++;
  }
  const otsuThreshold = otsu(hist, w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * c;
      const rgbaIdx = (y * w + x) * 4;
      const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
      const existingAlpha = (c >= 4) ? pixels[idx + 3] : 255;

      // 找到与最近背景色的距离
      let minDist = Infinity;
      for (const cl of clusters) {
        const d = colorDist({r,g,b}, cl.color);
        if (d < minDist) minDist = d;
      }

      // 自适应阈值
      const threshold = Math.min(...thresholds);

      // 计算透明度
      let alpha;
      if (existingAlpha < 10) {
        alpha = 0; // 已经是透明的
      } else if (minDist < threshold) {
        alpha = 0; // 背景
      } else if (minDist < threshold * 2.5) {
        // 过渡区：平滑过渡
        alpha = Math.round(((minDist - threshold) / (threshold * 1.5)) * 255);
      } else {
        // 前景
        alpha = 255;
      }

      rgbaData[rgbaIdx] = r;
      rgbaData[rgbaIdx+1] = g;
      rgbaData[rgbaIdx+2] = b;
      rgbaData[rgbaIdx+3] = Math.min(alpha, existingAlpha);
    }
  }

  // Step 4: 对 Alpha 通道应用高斯模糊（平滑边缘）
  const smoothed = await sharp(rgbaData, { raw: { width: w, height: h, channels: 4 } })
    .extractChannel(3)
    .blur(0.8)
    .raw()
    .toBuffer();

  // 把模糊后的 Alpha 合并回去
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rgbaIdx = (y * w + x) * 4;
      const smoothedAlpha = smoothed[(y * w + x)];
      // 二值化：小于 30 的完全透明，大于 220 的完全不透明，中间保留平滑
      if (smoothedAlpha < 30) rgbaData[rgbaIdx + 3] = 0;
      else if (smoothedAlpha > 220) rgbaData[rgbaIdx + 3] = 255;
      else rgbaData[rgbaIdx + 3] = smoothedAlpha;
    }
  }

  await sharp(rgbaData, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outputPath);

  console.log("Sharp rembg: done");
  return outputPath;
}

// ============================================================
// 换背景
// ============================================================
async function replaceBackground(inputPath, bgColor, outputPath) {
  try {
    const aiResult = await replaceBackgroundWithAI(inputPath, bgColor, outputPath);
    if (aiResult) return aiResult;
  } catch(e) { console.warn("AI replace-bg retry failed"); }

  const tmpPath = outputPath.replace(/\.\w+$/, "_tmp_nobg.png");
  await removeBackground(inputPath, tmpPath);
  const meta = await sharp(tmpPath).metadata();
  const bg = await sharp({
    create: { width: meta.width, height: meta.height, channels: 4, background: bgColor || "#ffffff" }
  }).png().toBuffer();
  await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  return outputPath;
}

// ============================================================
// 工具函数
// ============================================================

function colorDist(a, b) {
  return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2));
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * Math.pow(mB - mF, 2);
    if (between > maxVar) { maxVar = between; threshold = i; }
  }
  return threshold;
}

/** 简易 K-means 找主要颜色簇 */
function findDominantColors(samples, k) {
  if (samples.length === 0) return [{ color: { r: 255, g: 255, b: 255 }, count: 0 }];
  
  // 初始中心：均匀分布在颜色空间中
  const centers = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(samples.length * i / k);
    centers.push({ r: samples[idx].r, g: samples[idx].g, b: samples[idx].b });
  }

  // 迭代 10 次
  for (let iter = 0; iter < 10; iter++) {
    const assignments = samples.map(s => {
      let minD = Infinity, minIdx = 0;
      for (let i = 0; i < k; i++) {
        const d = colorDist(s, centers[i]);
        if (d < minD) { minD = d; minIdx = i; }
      }
      return minIdx;
    });

    // 更新中心
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let i = 0; i < samples.length; i++) {
      sums[assignments[i]].r += samples[i].r;
      sums[assignments[i]].g += samples[i].g;
      sums[assignments[i]].b += samples[i].b;
      sums[assignments[i]].count++;
    }

    for (let i = 0; i < k; i++) {
      if (sums[i].count > 0) {
        centers[i] = {
          r: Math.round(sums[i].r / sums[i].count),
          g: Math.round(sums[i].g / sums[i].count),
          b: Math.round(sums[i].b / sums[i].count)
        };
      }
    }
  }

  // 按像素数量降序排列
  const counts = centers.map((c, i) => ({
    color: c,
    count: samples.filter(s => {
      let minD = Infinity, minIdx = 0;
      for (let j = 0; j < centers.length; j++) {
        const d = colorDist(s, centers[j]);
        if (d < minD) { minD = d; minIdx = j; }
      }
      return minIdx === i;
    }).length
  }));
  counts.sort((a, b) => b.count - a.count);

  return counts;
}

module.exports = { removeBackground, replaceBackground };
