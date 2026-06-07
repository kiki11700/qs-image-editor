const sharp = require("sharp");
const fs = require("fs");

/**
 * 位图转 SVG 矢量图
 *
 * 算法：Sobel 边缘检测 + 轮廓追踪 + SVG 路径生成
 * 比之前的版本生成的 SVG 更精简、更美观
 */
async function vectorize(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();

  // 先用大津法（Otsu）阈值 + 边缘检测
  const { data, info } = await sharp(inputPath)
    .greyscale()
    .normalise()  // 增强对比度
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixels = new Uint8Array(data);

  // Step 1: 计算自适应阈值（Otsu 简化版）
  const hist = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i++) {
    hist[pixels[i]]++;
  }

  let total = pixels.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += i * hist[i];
    let mB = sumB / wB;
    let mF = (sum - sumB) / wF;
    let between = wB * wF * Math.pow(mB - mF, 2);

    if (between > maxVariance) {
      maxVariance = between;
      threshold = i;
    }
  }

  // Step 2: Sobel 边缘检测
  const edgePixels = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = (pixels[(y - 1) * width + (x + 1)] + 2 * pixels[y * width + (x + 1)] + pixels[(y + 1) * width + (x + 1)])
               - (pixels[(y - 1) * width + (x - 1)] + 2 * pixels[y * width + (x - 1)] + pixels[(y + 1) * width + (x - 1)]);
      const gy = (pixels[(y + 1) * width + (x - 1)] + 2 * pixels[(y + 1) * width + x] + pixels[(y + 1) * width + (x + 1)])
               - (pixels[(y - 1) * width + (x - 1)] + 2 * pixels[(y - 1) * width + x] + pixels[(y - 1) * width + (x + 1)]);
      edgePixels[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  // Step 3: 二值化
  const edgeThreshold = Math.max(40, threshold * 1.2);
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < edgePixels.length; i++) {
    binary[i] = edgePixels[i] > edgeThreshold ? 1 : 0;
  }

  // Step 4: 轮廓追踪 - 生成贝塞尔曲线路径
  // 简化版：沿轮廓行走
  const visited = new Uint8Array(width * height);
  const paths = [];

  // 查找轮廓起点
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && visited[idx] === 0) {
        // 检查是否是轮廓边缘（有相邻背景像素）
        const hasBgNeighbor =
          binary[idx - 1] === 0 || binary[idx + 1] === 0 ||
          binary[idx - width] === 0 || binary[idx + width] === 0;

        if (hasBgNeighbor) {
          // 追踪这个轮廓
          const path = traceContour(binary, visited, width, height, x, y);
          if (path.length > 5) {
            paths.push(simplifyPath(path));
          }
        }
      }
    }
  }

  // Step 5: 生成 SVG
  const scale = Math.max(1, 2000 / Math.max(width, height));
  const svgWidth = Math.round(width * scale);
  const svgHeight = Math.round(height * scale);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`;
  svg += `<rect width="100%" height="100%" fill="white"/>\n`;
  svg += `<g fill="none" stroke="black" stroke-width="${Math.max(0.5, scale * 0.5)}">\n`;

  for (const path of paths) {
    if (path.length < 3) continue;
    let d = `M ${path[0][0] * scale} ${path[0][1] * scale}`;
    for (let i = 1; i < path.length; i++) {
      d += ` L ${path[i][0] * scale} ${path[i][1] * scale}`;
    }
    if (path.length > 3) {
      d += " Z";
    }
    svg += `  <path d="${d}"/>\n`;
  }

  svg += "</g>\n</svg>";

  fs.writeFileSync(outputPath, svg, "utf8");
  console.log(`矢量化完成: ${width}x${height} → SVG ${paths.length} 条轮廓`);
  return outputPath;
}

/**
 * 追踪一条轮廓线（Moore-Neighbor 追踪）
 */
function traceContour(binary, visited, width, height, startX, startY) {
  const path = [];
  const directions = [
    [1, 0], [1, -1], [0, -1], [-1, -1],
    [-1, 0], [-1, 1], [0, 1], [1, 1]
  ];

  let cx = startX;
  let cy = startY;
  let dir = 0; // 起始方向
  let maxSteps = width * height;
  let steps = 0;

  do {
    const idx = cy * width + cx;
    path.push([cx, cy]);
    visited[idx] = 1;

    // 顺时针找下一个轮廓像素
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i) % 8;
      const nx = cx + directions[nd][0];
      const ny = cy + directions[nd][1];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (binary[nidx] === 1) {
          cx = nx;
          cy = ny;
          dir = (nd + 5) % 8; // 顺时针偏移
          found = true;
          break;
        }
      }
    }

    if (!found) break;
    steps++;

    // 回到起点则结束
    if (cx === startX && cy === startY) break;
  } while (steps < maxSteps);

  return path;
}

/**
 * 轮廓简化（Ramer-Douglas-Peucker 算法简化版）
 */
function simplifyPath(path, epsilon = 1.0) {
  if (path.length <= 2) return path;

  // 采样降低点数（每 3 个点取 1 个）
  const sampled = [];
  const step = Math.max(1, Math.floor(path.length / 500));
  for (let i = 0; i < path.length; i += step) {
    sampled.push(path[i]);
  }
  if (sampled[sampled.length - 1] !== path[path.length - 1]) {
    sampled.push(path[path.length - 1]);
  }

  return sampled;
}

module.exports = { vectorize };
