const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/**
 * AI 图片处理服务
 *
 * 设计原则：
 * - 开发期用 sharp 做真实处理（效果够用）
 * - 有 Replicate Token 时自动切换 AI 处理
 * - 接口统一，前端无需改动
 */

// 尝试加载 Replicate
let replicateClient = null;
function getReplicate() {
  if (replicateClient) return replicateClient;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === "your-replicate-api-token") return null;
  try {
    const Replicate = require("replicate");
    replicateClient = new Replicate({ auth: token });
    return replicateClient;
  } catch (e) {
    console.warn("Replicate 加载失败:", e.message);
    return null;
  }
}

/**
 * AI 超分（2x）- 使用真实 sharp 放大 + 锐化
 */
async function upscale(inputPath, outputPath) {
  const client = getReplicate();

  if (client) {
    try {
      // 用 Replicate ESRGAN 做真实 AI 超分
      const replicateService = require("./replicate");
      const result = await replicateService.processImage(inputPath, "upscale");
      if (result) {
        fs.copyFileSync(result, outputPath);
        return outputPath;
      }
    } catch (e) {
      console.warn("Replicate upscale 失败，回退到 sharp:", e.message);
    }
  }

  // sharp 保底方案：lanczos3 放大 + 锐化
  const metadata = await sharp(inputPath).metadata();
  const newWidth = Math.round(metadata.width * 2);
  const newHeight = Math.round(metadata.height * 2);

  await sharp(inputPath)
    .resize(newWidth, newHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
      withoutReduction: true
    })
    .sharpen({
      sigma: 1.5,
      m1: 0.5,
      m2: 1.0
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * 4K 超分 - 放大到 4K（3840x2160）或 4x
 */
async function upscaleTo4K(inputPath, outputPath) {
  const client = getReplicate();

  if (client) {
    try {
      const replicateService = require("./replicate");
      const result = await replicateService.processImage(inputPath, "upscale4k");
      if (result) {
        fs.copyFileSync(result, outputPath);
        return outputPath;
      }
    } catch (e) {
      console.warn("Replicate upscale4k 失败，回退到 sharp:", e.message);
    }
  }

  const metadata = await sharp(inputPath).metadata();

  // 目标尺寸：4x 或 3840x2160，取较大值
  const targetWidth = Math.max(3840, metadata.width * 4);
  const targetHeight = Math.max(2160, metadata.height * 4);
  const aspect = metadata.width / metadata.height;

  let finalWidth, finalHeight;
  if (targetWidth / targetHeight > aspect) {
    finalHeight = targetHeight;
    finalWidth = Math.round(targetHeight * aspect);
  } else {
    finalWidth = targetWidth;
    finalHeight = Math.round(targetWidth / aspect);
  }

  await sharp(inputPath)
    .resize(finalWidth, finalHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
      withoutReduction: true
    })
    .sharpen({
      sigma: 2.0,
      m1: 0.5,
      m2: 1.0
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * 风格迁移 - 应用颜色滤镜效果
 */
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  const client = getReplicate();

  if (client) {
    try {
      const replicateService = require("./replicate");
      const result = await replicateService.processImage(inputPath, "style-transfer", { stylePrompt });
      if (result) {
        fs.copyFileSync(result, outputPath);
        return outputPath;
      }
    } catch (e) {
      console.warn("Replicate style-transfer 失败，回退到 sharp:", e.message);
    }
  }

  // sharp 保底：根据风格描述应用不同的颜色变换
  const prompt = (stylePrompt || "动漫风格").toLowerCase();

  let tintColor = { r: 0, g: 0, b: 0 };
  let saturation = 1.1;
  let gamma = 1.0;
  let blur = false;

  if (prompt.includes("动漫") || prompt.includes("anime") || prompt.includes("卡通")) {
    tintColor = { r: 10, g: 5, b: 15 };
    saturation = 1.3;
    gamma = 0.9;
  } else if (prompt.includes("油画") || prompt.includes("oil")) {
    tintColor = { r: 5, g: 5, b: 0 };
    saturation = 1.2;
    gamma = 0.85;
  } else if (prompt.includes("水彩") || prompt.includes("water")) {
    tintColor = { r: 0, g: 10, b: 20 };
    saturation = 0.9;
    gamma = 1.1;
    blur = true;
  } else if (prompt.includes("黑白") || prompt.includes("灰度") || prompt.includes("gray") || prompt.includes("bw") || prompt.includes("mono")) {
    await sharp(inputPath)
      .greyscale()
      .png()
      .toFile(outputPath);
    return outputPath;
  } else if (prompt.includes("复古") || prompt.includes("怀旧") || prompt.includes("vintage") || prompt.includes("retro")) {
    tintColor = { r: 30, g: 15, b: 0 };
    saturation = 0.8;
    gamma = 0.9;
  } else if (prompt.includes("赛博") || prompt.includes("赛博朋克") || prompt.includes("cyber") || prompt.includes("neon")) {
    tintColor = { r: 0, g: 20, b: 30 };
    saturation = 1.5;
    gamma = 0.95;
  }

  let pipeline = sharp(inputPath);

  // 调整饱和度（先转 HSV 调整再转回 - 简化版使用 linear 和 modulate）
  pipeline = pipeline.modulate({ saturation });

  // 色调偏移
  if (tintColor.r !== 0 || tintColor.g !== 0 || tintColor.b !== 0) {
    pipeline = pipeline.tint({ r: 255 + tintColor.r, g: 255 + tintColor.g, b: 255 + tintColor.b });
  }

  // Gamma 调整（对比度）
  if (gamma !== 1.0) {
    pipeline = pipeline.gamma(gamma);
  }

  // 模糊效果（水彩风格）
  if (blur) {
    pipeline = pipeline.blur(1.5);
  }

  await pipeline.png().toFile(outputPath);
  return outputPath;
}

/**
 * 生成类似图 - 基于原图生成相似风格的新图
 */
async function generateSimilar(inputPath, outputPath) {
  const client = getReplicate();

  if (client) {
    try {
      const replicateService = require("./replicate");
      const result = await replicateService.processImage(inputPath, "similar");
      if (result) {
        fs.copyFileSync(result, outputPath);
        return outputPath;
      }
    } catch (e) {
      console.warn("Replicate similar 失败，回退到 sharp:", e.message);
    }
  }

  // sharp 保底：加轻微颜色变化
  const hueShift = Math.floor(Math.random() * 40) - 20; // -20 到 +20
  const satShift = 1.0 + (Math.random() * 0.3 - 0.15); // 0.85 到 1.15

  await sharp(inputPath)
    .modulate({ saturation: satShift })
    .tint({
      r: 255 + hueShift,
      g: 255 - Math.floor(hueShift * 0.5),
      b: 255 - Math.floor(hueShift * 0.3)
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}

module.exports = { upscale, styleTransfer, generateSimilar, upscaleTo4K };
