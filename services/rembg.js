const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================
// 高性能抠图去底 - 三重策略融合
// 1. Replicate AI 优先（需要 API 余额）
// 2. Sharp 增强版边缘检测算法（0 依赖）
// 3. 多尺度颜色聚类
// ============================================================

// ---------- Replicate AI ----------
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
// 改进版 Sharp 抠图算法（v2 - 多策略融合）
// ============================================================
async function removeBackground(inputPath, outputPath) {
  // 先试 AI
  try {
    const aiResult = await removeBackgroundWithAI(inputPath, outputPath);
    if (aiResult) return aiResult;
  } catch(e) { console.warn("AI rembg retry failed"); }

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height, c = info.channels;
  const pixels = new Uint8Array(data);
  const totalPixels = w * h;

  // ==================== 策略 1: 边缘采样 + K-means ====================
  // 从图像四边密集采样背景色
  const edgeSamples = [];
  const margin = Math.max(5, Math.min(30, Math.floor(Math.min(w, h) / 40)));

  const stepX = Math.max(1, Math.floor(w / 200));
  const stepY = Math.max(1, Math.floor(h / 200));

  // 上边和下边
  for (let x = margin; x < w - margin; x += stepX) {
    for (let y = 0; y < margin; y++) {
      const idx = (y * w + x) * c;
      edgeSamples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
    for (let y = h - margin; y < h; y++) {
      const idx = (y * w + x) * c;
      edgeSamples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
  }
  // 左边和右边
  for (let y = margin; y < h - margin; y += stepY) {
    for (let x = 0; x < margin; x++) {
      const idx = (y * w + x) * c;
      edgeSamples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
    for (let x = w - margin; x < w; x++) {
      const idx = (y * w + x) * c;
      edgeSamples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
  }

  const bgClusters = kmeansPP(edgeSamples, 4, 15);

  // ==================== 策略 2: 全局颜色分析 ====================
  // 全图均匀采样做全局聚类
  const globalSamples = [];
  const gStep = Math.max(1, Math.floor(Math.min(w, h) / 80));
  for (let y = 0; y < h; y += gStep) {
    for (let x = 0; x < w; x += gStep) {
      const idx = (y * w + x) * c;
      globalSamples.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] });
    }
  }
  const globalClusters = kmeansPP(globalSamples, 5, 15);

  // 找出哪些全局簇是"背景色"（距离边缘采样簇较近）
  const isBgCluster = globalClusters.map(gc => {
    for (const bc of bgClusters) {
      if (colorDist(gc.color, bc.color) < 40) return true;
    }
    return false;
  });

  // ==================== 策略 3: Sobel 边缘检测 ====================
  const edgeMap = sobelEdgeDetect(pixels, w, h, c);

  // ==================== 融合决策 ====================
  const alpha = new Uint8Array(totalPixels);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pxIdx = idx * c;
      const r = pixels[pxIdx], g = pixels[pxIdx + 1], b = pixels[pxIdx + 2];

      // 1. 检查是否在边缘采样颜色附近
      let minEdgeDist = Infinity;
      for (const bc of bgClusters) {
        const d = colorDist({ r, g, b }, bc.color);
        if (d < minEdgeDist) minEdgeDist = d;
      }

      // 2. 检查全局聚类
      let minGlobalBgDist = Infinity;
      let minGlobalFgDist = Infinity;
      for (let i = 0; i < globalClusters.length; i++) {
        const d = colorDist({ r, g, b }, globalClusters[i].color);
        if (isBgCluster[i]) {
          if (d < minGlobalBgDist) minGlobalBgDist = d;
        } else {
          if (d < minGlobalFgDist) minGlobalFgDist = d;
        }
      }

      const edgeStrength = edgeMap[idx];

      // 3. 混合判定
      const edgeScore = edgeStrength > 40 ? 1 : (edgeStrength / 40);
      const bgScore = Math.min(1, Math.max(0, 1 - minEdgeDist / 60));
      const fgScore = minGlobalFgDist < minGlobalBgDist ? 1 : 0;

      // 最终 alpha: 边缘区域保持不透明，背景区域透明，中间区域平滑过渡
      if (edgeScore > 0.7) {
        // 强边缘区域 - 保持不透明（前景）
        alpha[idx] = 255;
      } else if (bgScore > 0.85 && !edgeScore) {
        // 强背景区域 - 完全透明
        alpha[idx] = 0;
      } else if (fgScore > 0.5 && bgScore < 0.3) {
        // 前景区域 - 不透明
        alpha[idx] = 255;
      } else {
        // 过渡区域 - 平滑混合
        const mix = Math.max(0, Math.min(1,
          0.3 * fgScore + 0.4 * (1 - bgScore) + 0.3 * edgeScore
        ));
        alpha[idx] = Math.round(mix * 255);
      }
    }
  }

  // ==================== 形态学清理 ====================
  // 开运算去噪声
  let cleaned = morphOpen(alpha, w, h, 3);
  // 闭运算填孔
  cleaned = morphClose(cleaned, w, h, 5);

  // ==================== 连通区域过滤 ====================
  const regions = findConnectedRegions(cleaned, w, h);
  // 只保留最大的 3 个区域
  const keepSet = new Set();
  regions.sort((a, b) => b.size - a.size);
  const maxRegionSize = regions.length > 0 ? regions[0].size : 0;
  for (const reg of regions) {
    if (reg.size > Math.max(500, maxRegionSize * 0.02)) {
      for (const px of reg.pixels) keepSet.add(px);
    }
  }

  const filtered = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    filtered[i] = keepSet.has(i) ? cleaned[i] : 0;
  }

  // ==================== 边界平滑 ====================
  const smoothedAlpha = await gaussianBlur(filtered, w, h, 1.0);

  // ==================== 组装输出 ====================
  const rgbaData = Buffer.alloc(totalPixels * 4);
  const existingAlpha = (c >= 4);

  for (let i = 0; i < totalPixels; i++) {
    const pxIdx = i * c;
    const outIdx = i * 4;
    rgbaData[outIdx] = pixels[pxIdx];
    rgbaData[outIdx + 1] = pixels[pxIdx + 1];
    rgbaData[outIdx + 2] = pixels[pxIdx + 2];
    const ea = existingAlpha ? pixels[pxIdx + 3] : 255;
    // 二值化 alpha：< 20 完全透明，> 235 完全不透明，中间平滑
    const sa = smoothedAlpha[i];
    if (sa < 20) rgbaData[outIdx + 3] = 0;
    else if (sa > 235) rgbaData[outIdx + 3] = Math.min(255, sa);
    else rgbaData[outIdx + 3] = Math.round((sa / 255) * ea);
  }

  await sharp(rgbaData, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outputPath);

  console.log("Sharp rembg v2: done (" + w + "x" + h + ")");
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

// K-means++ 聚类
function kmeansPP(samples, k, maxIter) {
  if (samples.length === 0) return Array.from({length: k}, () => ({color: {r:255,g:255,b:255}, count: 0}));

  // k-means++ 初始化
  const centers = [samples[Math.floor(Math.random() * samples.length)]];
  for (let i = 1; i < k; i++) {
    const dists = samples.map(s => {
      let md = Infinity;
      for (const c of centers) md = Math.min(md, colorDist(s, c));
      return md * md;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen = 0;
    for (let j = 0; j < dists.length; j++) {
      r -= dists[j];
      if (r <= 0) { chosen = j; break; }
    }
    centers.push(samples[chosen]);
  }

  const assign = new Int32Array(samples.length);
  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < samples.length; i++) {
      let md = Infinity;
      for (let j = 0; j < k; j++) {
        const d = colorDist(samples[i], centers[j]);
        if (d < md) { md = d; assign[i] = j; }
      }
    }
    const sums = Array.from({length: k}, () => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let i = 0; i < samples.length; i++) {
      sums[assign[i]].r += samples[i].r;
      sums[assign[i]].g += samples[i].g;
      sums[assign[i]].b += samples[i].b;
      sums[assign[i]].count++;
    }
    for (let j = 0; j < k; j++) {
      if (sums[j].count > 0) {
        centers[j] = {
          r: Math.round(sums[j].r / sums[j].count),
          g: Math.round(sums[j].g / sums[j].count),
          b: Math.round(sums[j].b / sums[j].count)
        };
      }
    }
  }

  return centers.map((c, i) => ({ color: c, count: assign.filter(a => a === i).length }));
}

function colorDist(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(2*dr*dr + 4*dg*dg + db*db);
}

// Sobel 边缘检测
function sobelEdgeDetect(pixels, w, h, c) {
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * c;
    grey[i] = Math.round(0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2]);
  }
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = (grey[(y-1)*w+(x+1)] + 2*grey[y*w+(x+1)] + grey[(y+1)*w+(x+1)])
               - (grey[(y-1)*w+(x-1)] + 2*grey[y*w+(x-1)] + grey[(y+1)*w+(x-1)]);
      const gy = (grey[(y+1)*w+(x-1)] + 2*grey[(y+1)*w+x] + grey[(y+1)*w+(x+1)])
               - (grey[(y-1)*w+(x-1)] + 2*grey[(y-1)*w+x] + grey[(y-1)*w+(x+1)]);
      edges[idx] = Math.min(255, Math.sqrt(gx*gx + gy*gy));
    }
  }
  const r = new Uint8Array(w * h);
  const mean = edges.reduce((a, b) => a + b, 0) / edges.length;
  const t = Math.max(25, mean * 1.5);
  for (let i = 0; i < w * h; i++) r[i] = edges[i] > t ? Math.min(255, Math.round(edges[i])) : 0;
  return r;
}

// 形态学
function morphErode(mask, w, h, k) {
  const hf = Math.floor(k/2), r = new Uint8Array(w*h);
  for (let y = hf; y < h-hf; y++)
    for (let x = hf; x < w-hf; x++) {
      let ok = true;
      for (let ky = -hf; ky <= hf && ok; ky++)
        for (let kx = -hf; kx <= hf && ok; kx++)
          if (mask[(y+ky)*w+(x+kx)] < 128) ok = false;
      r[y*w+x] = ok ? 255 : 0;
    }
  return r;
}

function morphDilate(mask, w, h, k) {
  const hf = Math.floor(k/2), r = new Uint8Array(w*h);
  for (let y = hf; y < h-hf; y++)
    for (let x = hf; x < w-hf; x++) {
      let any = false;
      for (let ky = -hf; ky <= hf && !any; ky++)
        for (let kx = -hf; kx <= hf && !any; kx++)
          if (mask[(y+ky)*w+(x+kx)] > 128) any = true;
      r[y*w+x] = any ? 255 : 0;
    }
  return r;
}

function morphOpen(alpha, w, h, k) { return morphDilate(morphErode(alpha, w, h, k), w, h, k); }
function morphClose(alpha, w, h, k) { return morphErode(morphDilate(alpha, w, h, k), w, h, k); }

// 连通区域分析
function findConnectedRegions(mask, w, h) {
  const visited = new Uint8Array(w*h);
  const regions = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y*w+x;
      if (mask[idx] > 128 && !visited[idx]) {
        const pixels = [];
        const queue = [idx];
        visited[idx] = 1;
        while (queue.length) {
          const cur = queue.shift();
          pixels.push(cur);
          for (const n of [cur-1, cur+1, cur-w, cur+w]) {
            if (n >= 0 && n < w*h && mask[n] > 128 && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }
        regions.push({ size: pixels.length, pixels });
      }
    }
  }
  return regions;
}

// 高斯模糊 mask
async function gaussianBlur(mask, w, h, sigma) {
  const buf = Buffer.from(mask);
  const s = await sharp(buf, { raw: { width: w, height: h, channels: 1 } })
    .blur(sigma).raw().toBuffer();
  return new Uint8Array(s);
}

module.exports = { removeBackground, replaceBackground };
