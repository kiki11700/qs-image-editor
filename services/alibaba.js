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

/** URL 编码（POP API 专用） */
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/** POP API 签名 */
function popSign(stringToSign, secret) {
  return crypto.createHmac("sha1", secret + "&").update(stringToSign).digest().toString("base64");
}

/** 生成 SignatureNonce */
function genNonce() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

/** 调用 POP API（imageseg/imageenhan） */
async function callPOPApi(endpoint, version, action, params) {
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("阿里云未配置: 请设置 ALIBABA_ACCESS_KEY_ID 和 ALIBABA_ACCESS_KEY_SECRET");
  }

  var body = JSON.stringify(params);
  var timestamp = new Date().toISOString().split(".")[0] + "Z";

  var popParams = [
    ["AccessKeyId", ACCESS_KEY_ID],
    ["Action", action],
    ["Format", "JSON"],
    ["SignatureMethod", "HMAC-SHA1"],
    ["SignatureNonce", genNonce()],
    ["SignatureVersion", "1.0"],
    ["Timestamp", timestamp],
    ["Version", version]
  ];

  // 排序 + 编码
  popParams.sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  var canonicalized = popParams.map(function(p) {
    return percentEncode(p[0]) + "=" + percentEncode(p[1]);
  }).join("&");

  // 签名
  var stringToSign = "POST&" + percentEncode("/") + "&" + percentEncode(canonicalized);
  var signature = popSign(stringToSign, ACCESS_KEY_SECRET);
  var queryStr = canonicalized + "&" + percentEncode("Signature") + "=" + percentEncode(signature);

  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: endpoint,
      path: "/?" + queryStr,
      method: "POST",
      timeout: 120000,
      headers: { "Content-Type": "application/json;charset=utf-8" }
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
          console.error("POP API 响应解析失败:", data.substring(0, 300)); reject(new Error("POP Parse failed"));
        }
      });
    });
    req.on("error", function(e) { console.error("POP API 请求失败:", e.message); reject(e); });
    req.setTimeout(120000, function() { req.destroy(); reject(new Error("POP Timeout")); });
    req.write(body);
    req.end();
  });
}

/** 下载文件 */
function downloadFile(url, dest) {
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(dest);
    var mod = url.startsWith("https") ? https : require("http");
    mod.get(url, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", function() { file.close(); resolve(dest); });
    }).on("error", function(err) { file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err); });
  });
}

/**
 * 通义万相 API 调用（wanx2.1 新版）
 * 使用 DashScope API Key 认证
 * API 文档：https://help.aliyun.com/zh/model-studio/
 */
async function callWanx21(messages, parameters) {
  var apiKey = process.env.ALIBABA_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("阿里云 DashScope 未配置: 请设置 ALIBABA_DASHSCOPE_API_KEY");
  }

  var body = JSON.stringify({
    model: "wanx2.1-t2i-turbo",
    input: { messages: messages },
    parameters: parameters || { size: "1024x1024", n: 1 }
  });

  return new Promise((resolve, reject) => {
    var opts = {
      hostname: DASHSCOPE_ENDPOINT,
      path: "/api/v1/services/aigc/image-generation/generation",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
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
          // DashScope 错误格式：{ code: "...", message: "..." }
          if (parsed.code) {
            reject(new Error("DashScope 错误: " + (parsed.message || parsed.code)));
          } else {
            resolve(parsed);
          }
        } catch(e) {
          console.error("DashScope 响应解析失败:", data.substring(0, 300));
          reject(new Error("DashScope 响应解析失败"));
        }
      });
    });
    req.on("error", function(e) {
      console.error("DashScope 请求失败:", DASHSCOPE_ENDPOINT, e.message);
      reject(e);
    });
    req.setTimeout(180000, function() { req.destroy(); reject(new Error("DashScope 请求超时")); });
    req.write(body);
    req.end();
  });
}

/** 从 wanx2.1 响应中提取图片 URL */
function extractImageFromWanxResponse(result) {
  if (!result || !result.output) return null;

  // 格式1: choices[0].message.content[].image_url.url
  if (result.output.choices && result.output.choices.length > 0) {
    var content = result.output.choices[0].message.content;
    if (Array.isArray(content)) {
      for (var ci = 0; ci < content.length; ci++) {
        if (content[ci].type === "image_url" && content[ci].image_url && content[ci].image_url.url) {
          return content[ci].image_url.url;
        }
      }
    }
  }

  // 格式2: output.results[].url（旧版兼容）
  if (result.output.results && result.output.results.length > 0) {
    return result.output.results[0].url || result.output.results[0].image_url;
  }

  return null;
}

/** 保存图片（URL 下载或 base64 内联） */
async function saveImage(imgUrl, outputPath) {
  if (imgUrl.startsWith("data:image")) {
    var matches = imgUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      fs.writeFileSync(outputPath, Buffer.from(matches[2], "base64"));
      return true;
    }
    return false;
  }
  await downloadFile(imgUrl, outputPath);
  return true;
}

// ============================================================
// 1. 抠图去底
// ============================================================
async function removeBackground(inputPath, outputPath) {
  // 优先通用分割（适用于人物+物体）
  var result = await callPOPApi(SEG_ENDPOINT, "2019-12-30", "SegmentCommonImage", {
    ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64")
  });

  if (result && result.Data && result.Data.ImageURL) {
    await downloadFile(result.Data.ImageURL, outputPath);
    console.log("阿里云 抠图去底: 成功");
    return outputPath;
  }
  return null;
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
  try {
    var result = await callPOPApi(ENHANCE_ENDPOINT, "2019-09-30", "MakeSuperResolutionImage", {
      ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64"),
      UpscaleFactor: 4,
      OutputFormat: "png"
    });

    var picUrl = null;
    if (result && result.PictureUrl) picUrl = result.PictureUrl;
    else if (result && result.Data && result.Data.PictureUrl) picUrl = result.Data.PictureUrl;

    if (picUrl) {
      await downloadFile(picUrl, outputPath);
      console.log("阿里云 转4K: 成功");
      return outputPath;
    }
  } catch(e) {
    console.error("阿里云 转4K API 调用失败:", e.message);
  }
  return null;
}

// ============================================================
// 4. 风格迁移 - 使用通义万相 wanx2.1
// ============================================================
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  try {
    var imgB64 = fs.readFileSync(inputPath).toString("base64");
    var styleText = stylePrompt || "anime";

    var result = await callWanx21([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "data:image/png;base64," + imgB64 } },
          { type: "text", text: "将这张图片的风格转换成" + styleText + "风格，保持原图内容和构图不变" }
        ]
      }
    ], { size: "1024x1024", n: 1 });

    var imgUrl = extractImageFromWanxResponse(result);
    if (imgUrl) {
      await saveImage(imgUrl, outputPath);
      console.log("阿里云 风格迁移: 成功");
      return outputPath;
    }
  } catch(e) {
    console.error("阿里云 风格迁移 API 调用失败:", e.message);
  }
  return null;
}

// ============================================================
// 5. 出类似图（图生图）
// ============================================================
async function generateSimilar(inputPath, outputPath) {
  try {
    var imgB64 = fs.readFileSync(inputPath).toString("base64");

    var result = await callWanx21([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "data:image/png;base64," + imgB64 } },
          { type: "text", text: "以这张图片为参考，生成一张风格和构图相似的图片，保持主体一致但略有变化" }
        ]
      }
    ], { size: "1024x1024", n: 1 });

    var imgUrl = extractImageFromWanxResponse(result);
    if (imgUrl) {
      await saveImage(imgUrl, outputPath);
      console.log("阿里云 出类似图: 成功");
      return outputPath;
    }
  } catch(e) {
    console.error("阿里云 出类似图 API 调用失败:", e.message);
  }
  return null;
}

module.exports = {
  removeBackground,
  replaceBackground,
  upscale4K,
  styleTransfer,
  generateSimilar
};
