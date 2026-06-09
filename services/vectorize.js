const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ============================================================
// 位图转 SVG 矢量图
//
// 优先级:
//   1. potrace (最成熟的矢量化工具, 需要系统安装)
//   2. Sharp Sobel 边缘追踪 (纯 Node.js 降级)
//
// potrace 安装方式:
//   macOS: brew install potrace
//   Ubuntu/Debian: apt-get install potrace
//   Railway: 在 apt.txt 中添加 potrace
// ============================================================

/** 检查 potrace 是否可用 */
function hasPotrace() {
  try {
    execSync("potrace --version", { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function vectorize(inputPath, outputPath) {
  // ----- 策略一: potrace (效果最好) -----
  if (hasPotrace()) {
    try {
      await vectorizeWithPotrace(inputPath, outputPath);
      console.log("potrace 矢量化成功");
      return outputPath;
    } catch(e) {
      console.warn("potrace 失败, 降级到 Sharp:", e.message);
    }
  }

  // ----- 策略二: Sharp Sobel 边缘追踪 (降级) -----
  await vectorizeWithSharp(inputPath, outputPath);
  return outputPath;
}

// ============================================================
// potrace 矢量化
// 流程: 输入图 → 预处理 (二值化/降噪) → BMP → potrace → SVG
// ============================================================
async function vectorizeWithPotrace(inputPath, outputPath) {
  const tmpDir = path.dirname(outputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath)) + "_" + Date.now();
  const bmpPath = path.join(tmpDir, baseName + ".bmp");
  const svgPath = path.join(tmpDir, baseName + "_trace.svg");

  try {
    // Step 1: 预处理 — 灰度 + 二值化 + 降噪
    const { data, info } = await sharp(inputPath)
      .greyscale()                   // 转灰度
      .normalise()                   // 增强对比度
      .median(1)                     // 中值滤波降噪
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Step 2: 大津法 (Otsu) 自适应阈值二值化
    const threshold = otsuThreshold(new Uint8Array(data));
    const binaryData = Buffer.alloc(info.width * info.height);
    for (let i = 0; i < data.length; i++) {
      binaryData[i] = data[i] > threshold ? 255 : 0;
    }

    // Step 3: 写出 BMP 文件 (potrace 接受 BMP/PGM/PNM)
    // BMP header: 14 bytes file header + 40 bytes DIB header + pixel data
    const w = info.width, h = info.height;
    const rowSize = Math.floor((w + 31) / 32) * 4; // BMP 每行 4 字节对齐
    const pixelDataSize = rowSize * h;
    const fileSize = 14 + 40 + pixelDataSize;
    const bmpBuf = Buffer.alloc(fileSize);

    // BMP 文件头
    bmpBuf.write("BM", 0);                    // magic
    bmpBuf.writeUInt32LE(fileSize, 2);         // file size
    bmpBuf.writeUInt32LE(14 + 40, 10);         // pixel data offset

    // DIB 头 (BITMAPINFOHEADER)
    bmpBuf.writeUInt32LE(40, 14);              // header size
    bmpBuf.writeInt32LE(w, 18);                // width
    bmpBuf.writeInt32LE(h, 22);                // height (positive = bottom-up)
    bmpBuf.writeUInt16LE(1, 26);               // planes
    bmpBuf.writeUInt16LE(8, 28);               // bits per pixel (8 = grayscale)
    bmpBuf.writeUInt32LE(0, 30);               // no compression
    bmpBuf.writeUInt32LE(pixelDataSize, 34);    // image size

    // BMP 需要从最后一行开始写入 (bottom-up)
    for (let y = 0; y < h; y++) {
      const srcRowStart = (h - 1 - y) * w;
      const dstRowStart = 14 + 40 + y * rowSize;
      for (let x = 0; x < w; x++) {
        // 反转: potrace 追踪黑色线条 (白色背景)
        bmpBuf[dstRowStart + x] = 255 - binaryData[srcRowStart + x];
      }
      // BMP 每行末尾补零到 4 字节对齐
    }
    fs.writeFileSync(bmpPath, bmpBuf);

    // Step 4: 调用 potrace
    //   -s: SVG 输出
    //   -b: 背景色 (白色)
    //   --turdsize: 忽略小于 n 像素的噪点 (降噪)
    //   --alphamax: 曲线拟合参数 (1.0 = 平滑曲线)
    //   --opttolerance: 优化容差 (0.2 = 平衡)
    //   --longcurve: 长曲线模式 (更精简的 SVG)
    execSync(
      `potrace "${bmpPath}" -s -o "${svgPath}" --turdsize 5 --alphamax 1.0 --opttolerance 0.2 --longcurve`,
      { timeout: 30000, stdio: "pipe" }
    );

    if (!fs.existsSync(svgPath)) {
      throw new Error("potrace 未生成输出文件");
    }

    // Step 5: 读取 potrace 输出的 SVG, 注入 viewBox
    let svgContent = fs.readFileSync(svgPath, "utf8");
    const svgWidth = Math.round(w * 2);   // 2x 输出, 保持清晰度
    const svgHeight = Math.round(h * 2);
    svgContent = svgContent
      .replace(/<svg[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">`)
      .replace(/<g[^>]*>/, `<g fill="none" stroke="black" stroke-width="${Math.max(0.5, 2 * 0.5)}">`);

    fs.writeFileSync(outputPath, svgContent, "utf8");
    console.log(`potrace 完成: ${info.width}x${info.height} → SVG`);
  } finally {
    // 清理临时文件
    for (const f of [bmpPath, svgPath]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }
}

// ============================================================
// Otsu 大津法阈值计算 (自适应二值化)
// ============================================================
function otsuThreshold(pixels) {
  const hist = new Uint32Array(256);
  const total = pixels.length;
  for (let i = 0; i < total; i++) hist[pixels[i]]++;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0, wB = 0, maxVariance = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVariance) { maxVariance = between; threshold = i; }
  }
  return threshold;
}

// ============================================================
// Sharp 手写矢量化 (降级方案)
// (保留原有 Sobel + 轮廓追踪 + SVG 生成逻辑)
// ============================================================
async function vectorizeWithSharp(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { data, info } = await sharp(inputPath)
    .greyscale().normalise().raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height;
  const pixels = new Uint8Array(data);

  // Otsu 阈值
  const threshold = otsuThreshold(pixels);

  // Sobel 边缘检测
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = (pixels[(y-1)*w+(x+1)] + 2*pixels[y*w+(x+1)] + pixels[(y+1)*w+(x+1)])
               - (pixels[(y-1)*w+(x-1)] + 2*pixels[y*w+(x-1)] + pixels[(y+1)*w+(x-1)]);
      const gy = (pixels[(y+1)*w+(x-1)] + 2*pixels[(y+1)*w+x] + pixels[(y+1)*w+(x+1)])
               - (pixels[(y-1)*w+(x-1)] + 2*pixels[(y-1)*w+x] + pixels[(y-1)*w+(x+1)]);
      edges[idx] = Math.min(255, Math.sqrt(gx*gx + gy*gy));
    }
  }

  const edgeThreshold = Math.max(40, threshold * 1.2);
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < edges.length; i++) binary[i] = edges[i] > edgeThreshold ? 1 : 0;

  // 轮廓追踪
  const visited = new Uint8Array(w * h);
  const paths = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (binary[idx] === 1 && visited[idx] === 0) {
        if (binary[idx-1] === 0 || binary[idx+1] === 0 || binary[idx-w] === 0 || binary[idx+w] === 0) {
          const path = traceContour(binary, visited, w, h, x, y);
          if (path.length > 5) paths.push(simplifyPath(path));
        }
      }
    }
  }

  // 生成 SVG
  const scale = Math.max(1, 2000 / Math.max(w, h));
  const svgW = Math.round(w * scale), svgH = Math.round(h * scale);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `<rect width="100%" height="100%" fill="white"/>\n`;
  svg += `<g fill="none" stroke="black" stroke-width="${Math.max(0.5, scale * 0.5)}">\n`;
  for (const pp of paths) {
    if (pp.length < 3) continue;
    let d = `M ${pp[0][0] * scale} ${pp[0][1] * scale}`;
    for (let i = 1; i < pp.length; i++) d += ` L ${pp[i][0] * scale} ${pp[i][1] * scale}`;
    if (pp.length > 3) d += " Z";
    svg += `  <path d="${d}"/>\n`;
  }
  svg += "</g>\n</svg>";
  fs.writeFileSync(outputPath, svg, "utf8");
  console.log(`Sharp SVG 完成: ${w}x${h} → ${paths.length} 条轮廓`);
}

// Moore-Neighbor 轮廓追踪
function traceContour(binary, visited, w, h, startX, startY) {
  const dirs = [[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]];
  const path = [];
  let cx = startX, cy = startY, dir = 0, maxSteps = w * h;
  for (let s = 0; s < maxSteps; s++) {
    path.push([cx, cy]);
    visited[cy * w + cx] = 1;
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i) % 8, nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && binary[ny * w + nx] === 1) {
        cx = nx; cy = ny; dir = (nd + 5) % 8; found = true; break;
      }
    }
    if (!found) break;
    if (cx === startX && cy === startY) break;
  }
  return path;
}

// 轮廓简化 (采样)
function simplifyPath(path, epsilon = 1.0) {
  if (path.length <= 2) return path;
  const sampled = [];
  const step = Math.max(1, Math.floor(path.length / 500));
  for (let i = 0; i < path.length; i += step) sampled.push(path[i]);
  if (sampled[sampled.length - 1] !== path[path.length - 1]) sampled.push(path[path.length - 1]);
  return sampled;
}

module.exports = { vectorize };
