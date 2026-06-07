const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/**
 * 真实抠图去底 - 基于颜色检测的 Alpha 通道算法
 * 1. 从四角采样背景颜色
 * 2. 计算每个像素与背景色的颜色距离
 * 3. 根据距离生成透明度蒙版
 * 4. 输出带透明通道的 PNG
 */
async function removeBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels; // 3 (RGB) or 4 (RGBA)

  // 从四角采样背景色
  const sampleSize = Math.max(5, Math.min(15, Math.floor(Math.min(width, height) / 20)));
  const cornerSamples = [];

  const sampleCorner = (startX, startY, count) => {
    for (let y = startY; y < Math.min(startY + count, height); y++) {
      for (let x = startX; x < Math.min(startX + count, width); x++) {
        const idx = (y * width + x) * channels;
        cornerSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
    }
  };

  // 四个角各采样
  sampleCorner(0, 0, sampleSize);                         // 左上
  sampleCorner(width - sampleSize, 0, sampleSize);         // 右上
  sampleCorner(0, height - sampleSize, sampleSize);        // 左下
  sampleCorner(width - sampleSize, height - sampleSize, sampleSize); // 右下

  if (cornerSamples.length === 0) {
    // 保底：直接复制
    await sharp(inputPath).png().toFile(outputPath);
    return outputPath;
  }

  // 计算平均背景色
  const bgR = Math.round(cornerSamples.reduce((s, c) => s + c[0], 0) / cornerSamples.length);
  const bgG = Math.round(cornerSamples.reduce((s, c) => s + c[1], 0) / cornerSamples.length);
  const bgB = Math.round(cornerSamples.reduce((s, c) => s + c[2], 0) / cornerSamples.length);

  // 计算自适应阈值（基于背景色的标准差）
  const variance = cornerSamples.reduce((s, c) =>
    s + Math.pow(c[0] - bgR, 2) + Math.pow(c[1] - bgG, 2) + Math.pow(c[2] - bgB, 2), 0
  ) / cornerSamples.length;

  const stdDev = Math.sqrt(variance);
  const threshold = Math.max(25, Math.min(70, stdDev * 2.5));

  // 创建 RGBA buffer
  const rgbaData = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const rgbaIdx = (y * width + x) * 4;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // 计算与背景色的欧几里得距离
      const dist = Math.sqrt(
        Math.pow(r - bgR, 2) +
        Math.pow(g - bgG, 2) +
        Math.pow(b - bgB, 2)
      );

      // 根据距离生成透明度（带平滑过渡）
      let alpha;
      if (dist < threshold) {
        alpha = 0; // 背景 → 完全透明
      } else if (dist < threshold * 2.5) {
        // 边缘过渡区 → 半透明
        alpha = Math.round(((dist - threshold) / (threshold * 1.5)) * 255);
      } else {
        alpha = 255; // 前景 → 不透明
      }

      // 如果是原图已有透明通道，保留原有的透明信息
      let existingAlpha = 255;
      if (channels === 4) {
        existingAlpha = data[idx + 3];
      }

      rgbaData[rgbaIdx] = r;
      rgbaData[rgbaIdx + 1] = g;
      rgbaData[rgbaIdx + 2] = b;
      rgbaData[rgbaIdx + 3] = Math.min(alpha, existingAlpha);
    }
  }

  await sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * 换背景 - 先去底，再合成到新背景色上
 */
async function replaceBackground(inputPath, bgColor, outputPath) {
  const color = bgColor || "#ffffff";

  // Step 1: 先去底
  const tmpPath = outputPath.replace(/\.\w+$/, "_tmp_nobg.png");
  await removeBackground(inputPath, tmpPath);

  // Step 2: 获取图的尺寸
  const metadata = await sharp(tmpPath).metadata();

  // Step 3: 创建背景色图层
  const bgBuffer = await sharp({
    create: {
      width: metadata.width,
      height: metadata.height,
      channels: 4,
      background: color
    }
  }).png().toBuffer();

  // Step 4: 合成
  await sharp(bgBuffer)
    .composite([{ input: tmpPath, top: 0, left: 0 }])
    .toFile(outputPath);

  // Step 5: 清理临时文件
  if (fs.existsSync(tmpPath)) {
    fs.unlinkSync(tmpPath);
  }

  return outputPath;
}

module.exports = { removeBackground, replaceBackground };
