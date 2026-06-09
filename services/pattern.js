const sharp = require("sharp");
const fs = require("fs");

// ============================================================
// 印花/图案提取服务 - 从衣服/布料表面提取印刷图案
// 核心流程:
//  1. 全图颜色聚类 → 分离印花与背景布料
//  2. 边缘检测 → 强化图案边界
//  3. 形态学清理 → 去除布料纹理噪声
//  4. 连通区域分析 → 找到最大图案区域
//  5. 裁剪到图案边界框 → 输出透明背景
// ============================================================

async function extractPattern(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const c = info.channels;
  const pixels = new Uint8Array(data);

  // ---- Step 1: 全局颜色分析 ----
  const samples = collectSamples(pixels, w, h, c);
  const clusters = kmeans(samples, 5, 15);
  const patternColors = findPatternColors(clusters, pixels, w, h, c);

  // ---- Step 2: 生成初始图案掩码 ----
  let mask = buildColorMask(pixels, w, h, c, patternColors);

  // ---- Step 3: 边缘检测增强 ----
  const edges = sobelEdgeDetect(pixels, w, h, c);
  for (let i = 0; i < w * h; i++) {
    if (edges[i] > 60) mask[i] = Math.max(mask[i], 200);
  }

  // ---- Step 4: 形态学清理 ----
  mask = morphOpen(mask, w, h, 3);
  mask = morphClose(mask, w, h, 5);

  // ---- Step 5: 连通区域分析 ----
  const largest = findLargestRegion(mask, w, h);
  if (largest && largest.length > 500) {
    const cleared = new Uint8Array(w * h);
    for (const px of largest) cleared[px] = 255;
    mask = cleared;
  }

  // ---- Step 6: 边界平滑 ----
  const alpha = await gaussianBlurMask(mask, w, h, 1.5);

  // ---- Step 7: 裁剪到边界框 ----
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha[y * w + x] > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  if (cw < 10 || ch < 10) {
    await sharp(inputPath).png().toFile(outputPath);
    return outputPath;
  }

  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const si = ((minY + y) * w + (minX + x)) * 4;
      const di = (y * cw + x) * 4;
      out[di] = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = alpha[(minY + y) * w + (minX + x)];
    }

  await sharp(out, { raw: { width: cw, height: ch, channels: 4 } })
    .png().toFile(outputPath);

  console.log("Pattern extract done: " + cw + "x" + ch + " (from " + w + "x" + h + ")");
  return outputPath;
}

// ---- 颜色采样 ----
function collectSamples(pixels, w, h, c) {
  const s = [];
  const st = Math.max(1, Math.floor(Math.min(w, h) / 60));
  for (let y = 0; y < h; y += st)
    for (let x = 0; x < w; x += st) {
      const i = (y * w + x) * c;
      s.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
    }
  return s;
}

// ---- K-means ----
function kmeans(samples, k, maxIter) {
  if (samples.length === 0) return [];
  // k-means++ init
  const centers = [samples[Math.floor(Math.random() * samples.length)]];
  for (let i = 1; i < k; i++) {
    const dists = samples.map(s => {
      let md = Infinity;
      for (const c of centers) md = Math.min(md, cd(s.r, s.g, s.b, c.r, c.g, c.b));
      return md * md;
    });
    const t = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * t, ch = 0;
    for (let j = 0; j < dists.length; j++) { r -= dists[j]; if (r <= 0) { ch = j; break; } }
    centers.push(samples[ch]);
  }

  const assign = new Int32Array(samples.length);
  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < samples.length; i++) {
      let md = Infinity;
      for (let j = 0; j < k; j++) {
        const d = cd(samples[i].r, samples[i].g, samples[i].b, centers[j].r, centers[j].g, centers[j].b);
        if (d < md) { md = d; assign[i] = j; }
      }
    }
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < samples.length; i++) {
      sums[assign[i]].r += samples[i].r;
      sums[assign[i]].g += samples[i].g;
      sums[assign[i]].b += samples[i].b;
      sums[assign[i]].n++;
    }
    for (let j = 0; j < k; j++)
      if (sums[j].n > 0)
        centers[j] = { r: Math.round(sums[j].r / sums[j].n), g: Math.round(sums[j].g / sums[j].n), b: Math.round(sums[j].b / sums[j].n) };
  }

  const cls = centers.map((c, i) => ({ c, n: 0, px: [] }));
  for (let i = 0; i < samples.length; i++) {
    cls[assign[i]].n++;
    cls[assign[i]].px.push(samples[i]);
  }
  cls.sort((a, b) => b.n - a.n);
  return cls;
}

// ---- 找到图案的颜色 ----
function findPatternColors(clusters, pixels, w, h, c) {
  const total = clusters.reduce((s, cl) => s + cl.n, 0);
  const vars = clusters.map(cl => {
    if (cl.px.length < 3) return 0;
    let v = 0;
    for (const p of cl.px) v += cd(p.r, p.g, p.b, cl.c.r, cl.c.g, cl.c.b);
    return v / cl.px.length;
  });

  // 边界采样 - 检查哪些颜色出现在图像边界
  const edgeColors = new Set();
  for (let x = 0; x < w; x++) {
    const ti = x * c;
    const bi = ((h - 1) * w + x) * c;
    edgeColors.add(Math.round(pixels[ti] / 32) + "," + Math.round(pixels[ti + 1] / 32) + "," + Math.round(pixels[ti + 2] / 32));
    edgeColors.add(Math.round(pixels[bi] / 32) + "," + Math.round(pixels[bi + 1] / 32) + "," + Math.round(pixels[bi + 2] / 32));
  }
  for (let y = 0; y < h; y++) {
    const li = y * w * c;
    const ri = (y * w + (w - 1)) * c;
    edgeColors.add(Math.round(pixels[li] / 32) + "," + Math.round(pixels[li + 1] / 32) + "," + Math.round(pixels[li + 2] / 32));
    edgeColors.add(Math.round(pixels[ri] / 32) + "," + Math.round(pixels[ri + 1] / 32) + "," + Math.round(pixels[ri + 2] / 32));
  }

  // 选择最佳图案簇：不在边界出现 + 色彩丰富 + 大小适中
  let best = [clusters[0]?.c || { r: 0, g: 0, b: 0 }];
  let bestScore = -Infinity;

  for (const cl of clusters) {
    const ratio = cl.n / total;
    if (ratio > 0.7 || ratio < 0.005) continue;

    // 检查该簇是否出现在图像边界
    const key = Math.round(cl.c.r / 32) + "," + Math.round(cl.c.g / 32) + "," + Math.round(cl.c.b / 32);
    const isBg = edgeColors.has(key);

    if (isBg) continue; // 跳过背景色

    const varScore = vars[clusters.indexOf(cl)];
    const score = varScore * (1 - ratio * 0.5) * (isBg ? 0.01 : 1);

    if (score > bestScore) {
      bestScore = score;
      best = [cl.c];
    }
  }

  // 如果没找到好的图案簇，选择倒数第二大的簇（排除最大背景和最小噪声）
  if (bestScore < 0 && clusters.length >= 3) {
    best = [clusters[1].c];
  }

  return best;
}

// ---- 基于颜色构建掩码 ----
function buildColorMask(pixels, w, h, c, patternColors) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      let minD = Infinity;
      for (const pc of patternColors) {
        const d = cd(pixels[i], pixels[i + 1], pixels[i + 2], pc.r, pc.g, pc.b);
        if (d < minD) minD = d;
      }
      mask[y * w + x] = minD < 50 ? 255 : (minD < 90 ? Math.round((1 - (minD - 50) / 40) * 255) : 0);
    }
  return mask;
}

// ---- Sobel边缘检测 ----
function sobelEdgeDetect(pixels, w, h, c) {
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * c;
    grey[i] = Math.round(0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]);
  }
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (grey[(y - 1) * w + (x + 1)] + 2 * grey[y * w + (x + 1)] + grey[(y + 1) * w + (x + 1)])
               - (grey[(y - 1) * w + (x - 1)] + 2 * grey[y * w + (x - 1)] + grey[(y + 1) * w + (x - 1)]);
      const gy = (grey[(y + 1) * w + (x - 1)] + 2 * grey[(y + 1) * w + x] + grey[(y + 1) * w + (x + 1)])
               - (grey[(y - 1) * w + (x - 1)] + 2 * grey[(y - 1) * w + x] + grey[(y - 1) * w + (x + 1)]);
      edges[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  const r = new Uint8Array(w * h);
  const m = edges.reduce((a, b) => a + b, 0) / edges.length;
  const t = Math.max(25, m * 1.8);
  for (let i = 0; i < w * h; i++) r[i] = edges[i] > t ? Math.min(255, Math.round(edges[i])) : 0;
  return r;
}

// ---- 形态学 ----
function morphErode(mask, w, h, k) {
  const hf = Math.floor(k / 2), r = new Uint8Array(w * h);
  for (let y = hf; y < h - hf; y++)
    for (let x = hf; x < w - hf; x++) {
      let ok = true;
      for (let ky = -hf; ky <= hf && ok; ky++)
        for (let kx = -hf; kx <= hf && ok; kx++)
          if (mask[(y + ky) * w + (x + kx)] < 128) ok = false;
      r[y * w + x] = ok ? 255 : 0;
    }
  return r;
}

function morphDilate(mask, w, h, k) {
  const hf = Math.floor(k / 2), r = new Uint8Array(w * h);
  for (let y = hf; y < h - hf; y++)
    for (let x = hf; x < w - hf; x++) {
      let any = false;
      for (let ky = -hf; ky <= hf && !any; ky++)
        for (let kx = -hf; kx <= hf && !any; kx++)
          if (mask[(y + ky) * w + (x + kx)] > 128) any = true;
      r[y * w + x] = any ? 255 : 0;
    }
  return r;
}

function morphOpen(mask, w, h, k) { return morphDilate(morphErode(mask, w, h, k), w, h, k); }
function morphClose(mask, w, h, k) { return morphErode(morphDilate(mask, w, h, k), w, h, k); }

// ---- 连通区域 ----
function findLargestRegion(mask, w, h) {
  const vis = new Uint8Array(w * h);
  const regions = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] > 128 && !vis[i]) {
        const reg = [];
        const q = [i];
        vis[i] = 1;
        let touchesEdge = false;
        while (q.length) {
          const cur = q.shift();
          const cx = cur % w, cy = Math.floor(cur / w);
          reg.push(cur);
          if (cx <= 1 || cx >= w - 2 || cy <= 1 || cy >= h - 2) touchesEdge = true;
          for (const n of [cur - 1, cur + 1, cur - w, cur + w])
            if (n >= 0 && n < w * h && mask[n] > 128 && !vis[n]) { vis[n] = 1; q.push(n); }
        }
        if (!touchesEdge && reg.length > 200) regions.push(reg);
      }
    }
  regions.sort((a, b) => b.length - a.length);
  return regions[0] || null;
}

// ---- 高斯模糊mask ----
async function gaussianBlurMask(mask, w, h, sigma) {
  const buf = Buffer.from(mask);
  const s = await sharp(buf, { raw: { width: w, height: h, channels: 1 } })
    .blur(sigma).raw().toBuffer();
  return new Uint8Array(s);
}

// ---- 颜色距离 ----
function cd(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + db * db);
}

module.exports = { extractPattern };
