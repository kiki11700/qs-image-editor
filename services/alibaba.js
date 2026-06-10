/**
 * 阿里云视觉智能 + 通义万相 一站式服务
 * ============================================
 * 覆盖所有AI图像处理需求：
 *   1. 抠图去底（通用分割/人像分割）
 *   2. 换背景（分割后合成）
 *   3. 转4K高清（图像超分辨率）
 *   4. 风格迁移（通义万相）
 *   5. 出类似图（通义万相图生图）
 *
 * 免费额度：每种功能 500次/月，足够初期使用
 * 注册地址：https://vision.aliyun.com/
 * 获取 AccessKey：https://ram.console.aliyun.com/
 *
 * 环境变量：
 *   ALIBABA_ACCESS_KEY_ID      - 阿里云 AccessKey ID
 *   ALIBABA_ACCESS_KEY_SECRET  - 阿里云 AccessKey Secret
 *   ALIBABA_REGION             - 地域（默认 cn-shanghai）
 * ============================================
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

// ---------- 配置 ----------
const REGION = process.env.ALIBABA_REGION || "cn-shanghai";
const ACCESS_KEY_ID = process.env.ALIBABA_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIBABA_ACCESS_KEY_SECRET;

const SEG_ENDPOINT = "imageseg." + REGION + ".aliyuncs.com";
const ENHANCE_ENDPOINT = "imageenhan." + REGION + ".aliyuncs.com";
const DASHSCOPE_ENDPOINT = "dashscope.aliyuncs.com";

// ---------- 工具函数 ----------

/** HMAC-SHA1 签名 */
function sign(stringToSign, secret) {
  return crypto.createHmac("sha1", secret).update(stringToSign).digest().toString("base64");
}

/** 生成阿里云 API 请求签名头 */
function buildHeaders(method, path, body, action, version) {
  var date = new Date().toUTCString();
  var md5 = crypto.createHash("md5").update(body || "").digest("base64");
  var contentType = "application/json;charset=utf-8";
  var v = version || "2020-03-20";
  var stringToSign = method + "\n" + "application/json" + "\n" + md5 + "\n" + contentType + "\n" + date + "\n" + "x-acs-action:" + action + "\n" + "x-acs-version:" + v + "\n" + path;
  var signature = sign(stringToSign, ACCESS_KEY_SECRET);

  return {
    "Authorization": "acs " + ACCESS_KEY_ID + ":" + signature,
    "Content-Type": contentType,
    "Content-MD5": md5,
    "Date": date,
    "x-acs-version": v,
    "Accept": "application/json"
  };
}

/** HTTP 请求封装 */
function request(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    var opts = {
      hostname: host,
      path: path,
      method: method,
      headers: headers,
      timeout: 120000
    };
    var req = https.request(opts, function(res) {
      var data = "";
      res.on("data", function(c) { data += c; });
      res.on("end", function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.Code && parsed.Code !== "200") {
            reject(new Error(parsed.Message || parsed.Code));
          } else {
            resolve(parsed);
          }
        } catch(e) {
          console.error("阿里云响应解析失败:", data.substring(0, 500)); reject(new Error("Parse failed: " + data.substring(0, 200)));
        }
      });
    });
    req.on("error", function(e) { console.error("阿里云请求失败:", host, path, e.message); reject(e); });
    req.setTimeout(120000, function() { req.destroy(); console.error("阿里云请求超时:", host, path); reject(new Error("Timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

/** 调用视觉智能平台 API */
async function callViapi(endpoint, version, action, params) {
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("阿里云未配置: 请设置 ALIBABA_ACCESS_KEY_ID 和 ALIBABA_ACCESS_KEY_SECRET");
  }
  var body = JSON.stringify(params);
  var headers = buildHeaders("POST", "/", body, action, version);
  headers["x-acs-action"] = action;
  headers["x-acs-version"] = version;
  var result = await request("POST", endpoint, "/", headers, body);
  return result.Data || result;
}

/** 文件转可用的图片数据 */
function imagePayload(inputPath, type) {
  var buf = fs.readFileSync(inputPath);
  var base64 = buf.toString("base64");
  return { ImageURL: "", ImageContent: base64 };
}

/** 下载文件 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    var file = fs.createWriteStream(dest);
    https.get(url, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", function() { file.close(); resolve(dest); });
    }).on("error", function(err) { file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err); });
  });
}

// ============================================================
// 1. 抠图去底
// ============================================================
async function removeBackground(inputPath, outputPath) {
  // 优先通用分割（适用于人物+物体）
  var result = await callViapi(SEG_ENDPOINT, "2019-12-30", "SegmentCommonImage", {
    ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64")
  });

  // 如果通用分割结果不理想，尝试人像分割
  if (!result || !result.PictureUrl) {
    result = await callViapi(SEG_ENDPOINT, "2019-12-30", "SegmentBody", {
      ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64")
    });
  }

  if (result && result.PictureUrl) {
    await downloadFile(result.PictureUrl, outputPath);
    console.log("阿里云 抠图: 成功");
    return outputPath;
  }

  // 走备用方案：获取分割结果后合成
  if (result && (result.Elements || result.MaskURL)) {
    var maskUrl = result.MaskURL || result.Elements[0].MaskURL;
    if (maskUrl) {
      await applyMask(inputPath, maskUrl, outputPath);
      console.log("阿里云 抠图(掩码): 成功");
      return outputPath;
    }
  }

  return null;
}

/** 用掩码合成抠图结果 */
async function applyMask(inputPath, maskUrl, outputPath) {
  var sharp = require("sharp");
  var [imgData, maskBuffer] = await Promise.all([
    sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    downloadFile(maskUrl, outputPath + ".mask")
  ]);
  var maskRaw = await sharp(maskBuffer).raw().toBuffer({ resolveWithObject: true });
  try { fs.unlinkSync(outputPath + ".mask"); } catch(e) {}

  var w = imgData.info.width, h = imgData.info.height, c = imgData.info.channels;
  var rgba = Buffer.alloc(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    var px = i * c, out = i * 4;
    rgba[out] = imgData.data[px];
    rgba[out + 1] = imgData.data[px + 1];
    rgba[out + 2] = imgData.data[px + 2];
    rgba[out + 3] = maskRaw.data[i * maskRaw.info.channels];
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outputPath);
}

// ============================================================
// 2. 换背景
// ============================================================
async function replaceBackground(inputPath, bgColor, outputPath) {
  var tmpPath = outputPath.replace(/\.\w+$/, "_ali_nobg.png");
  var result = await removeBackground(inputPath, tmpPath);
  if (!result) return null;

  var sharp = require("sharp");
  var meta = await sharp(tmpPath).metadata();
  var bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: bgColor || "#ffffff" } }).png().toBuffer();
  await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  try { fs.unlinkSync(tmpPath); } catch(e) {}
  console.log("阿里云 换背景: 成功");
  return outputPath;
}

// ============================================================
// 3. 转4K高清（图像超分辨率）
// ============================================================
async function upscale4K(inputPath, outputPath) {
  var result = await callViapi(ENHANCE_ENDPOINT, "2019-09-30", "MakeSuperResolutionImage", {
    ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64"),
    UpscaleFactor: 4,
    OutputFormat: "png"
  });

  if (result && result.PictureUrl) {
    await downloadFile(result.PictureUrl, outputPath);
    console.log("阿里云 转4K: 成功");
    return outputPath;
  }
  return null;
}

// ============================================================
// 4. 风格迁移
// ============================================================
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  // 使用通义万相 API 进行风格迁移
  var result = await callDashScope("wanx-image-generation-v1", {
    model: "wanx-image-generation-v1",
    input: {
      image: { type: "image", imageContent: fs.readFileSync(inputPath).toString("base64") },
      prompt: "将这张图片转换成" + (stylePrompt || "动漫风格") + "风格"
    },
    parameters: {
      style: stylePrompt || "anime",
      n: 1,
      size: "1024*1024"
    }
  });

  if (result && result.output && result.output.results && result.output.results.length > 0) {
    var imgUrl = result.output.results[0].url;
    if (imgUrl) {
      await downloadFile(imgUrl, outputPath);
      console.log("阿里云 风格迁移: 成功");
      return outputPath;
    }
  }
  return null;
}

// ============================================================
// 5. 出类似图（图生图）
// ============================================================
async function generateSimilar(inputPath, outputPath) {
  var result = await callDashScope("wanx-image-generation-v1", {
    model: "wanx-image-generation-v1",
    input: {
      image: { type: "image", imageContent: fs.readFileSync(inputPath).toString("base64") },
      prompt: "以这张图片为参考，生成一张风格相似的图片"
    },
    parameters: {
      n: 1,
      size: "1024*1024",
      imageCount: 1
    }
  });

  if (result && result.output && result.output.results && result.output.results.length > 0) {
    var imgUrl = result.output.results[0].url;
    if (imgUrl) {
      await downloadFile(imgUrl, outputPath);
      console.log("阿里云 出类似图: 成功");
      return outputPath;
    }
  }
  return null;
}

// ============================================================
// 通义万相 API 调用
// ============================================================
async function callDashScope(model, params) {
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("阿里云未配置");
  }

  var body = JSON.stringify(params);
  // DashScope 使用不同的认证方式（API Key）
  var dashscopeApiKey = process.env.ALIBABA_DASHSCOPE_API_KEY || ACCESS_KEY_ID;

  return new Promise((resolve, reject) => {
    var opts = {
      hostname: DASHSCOPE_ENDPOINT,
      path: "/api/v1/services/aigc/image-generation/generation",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + dashscopeApiKey,
        "X-DashScope-Async": "disable"
      },
      timeout: 180000
    };
    var req = https.request(opts, function(res) {
      var data = "";
      res.on("data", function(c) { data += c; });
      res.on("end", function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.code) reject(new Error(parsed.message || parsed.code));
          else resolve(parsed);
        } catch(e) { reject(new Error("DashScope parse failed")); }
      });
    });
    req.on("error", function(e) { console.error("阿里云请求失败:", host, path, e.message); reject(e); });
    req.setTimeout(180000, function() { req.destroy(); reject(new Error("DashScope Timeout")); });
    req.write(body);
    req.end();
  });
}

module.exports = {
  removeBackground,
  replaceBackground,
  upscale4K,
  styleTransfer,
  generateSimilar
};
