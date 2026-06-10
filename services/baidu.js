const https = require("https");
const http = require("http");
const fs = require("fs");
const sharp = require("sharp");

const BAIDU_TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
const BAIDU_BODYSEG_URL = "https://aip.baidubce.com/rest/2.0/image-classify/v1/bodySeg";
const BAIDU_OBJECTSEG_URL = "https://aip.baidubce.com/rest/2.0/image-classify/v1/multi_object_segment";

let cachedToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireTime - 60000) return cachedToken;

  const apiKey = process.env.BAIDU_AI_API_KEY;
  const secretKey = process.env.BAIDU_AI_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error("百度AI未配置: 请设置 BAIDU_AI_API_KEY 和 BAIDU_AI_SECRET_KEY");
  }

  const url = BAIDU_TOKEN_URL + "?grant_type=client_credentials&client_id=" + apiKey + "&client_secret=" + secretKey;
  const data = await httpGet(url);
  if (data.error) throw new Error("百度AI token获取失败: " + (data.error_description || data.error));

  cachedToken = data.access_token;
  tokenExpireTime = now + (data.expires_in || 2592000) * 1000;
  console.log("百度AI: access_token 已刷新，有效期30天");
  return cachedToken;
}

async function removeBackground(inputPath, outputPath) {
  const token = await getAccessToken();
  const imageBase64 = fs.readFileSync(inputPath).toString("base64");

  const bodyResult = await callBaiduAPI(BAIDU_BODYSEG_URL, token, imageBase64);
  if (bodyResult && bodyResult.foreground) {
    const fgBuffer = Buffer.from(bodyResult.foreground, "base64");
    await sharp(fgBuffer).png().toFile(outputPath);
    console.log("百度AI 人像分割: 成功");
    return outputPath;
  }

  const objResult = await callBaiduAPI(BAIDU_OBJECTSEG_URL, token, imageBase64);
  if (objResult && objResult.labelmap) {
    await applyMaskToImage(inputPath, Buffer.from(objResult.labelmap, "base64"), outputPath);
    console.log("百度AI 通用物体分割: 成功");
    return outputPath;
  }

  return null;
}

async function replaceBackground(inputPath, bgColor, outputPath) {
  const tmpPath = outputPath.replace(/\.\w+$/, "_baidu_nobg.png");
  const result = await removeBackground(inputPath, tmpPath);
  if (!result) return null;

  const meta = await sharp(tmpPath).metadata();
  const bg = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: bgColor || "#ffffff" } }).png().toBuffer();
  await sharp(bg).composite([{ input: tmpPath, top: 0, left: 0 }]).toFile(outputPath);
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  return outputPath;
}

async function callBaiduAPI(apiUrl, token, imageBase64) {
  const url = apiUrl + "?access_token=" + token;
  const postData = "image=" + encodeURIComponent(imageBase64);
  try {
    const result = await httpPost(url, postData);
    if (result.error_code) { console.warn("百度AI API错误(" + result.error_code + "): " + result.error_msg); return null; }
    return result;
  } catch (e) { console.warn("百度AI API调用异常:", e.message); return null; }
}

async function applyMaskToImage(inputPath, maskBuffer, outputPath) {
  const [img, mask] = await Promise.all([
    sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(maskBuffer).raw().toBuffer({ resolveWithObject: true })
  ]);
  const w = img.info.width, h = img.info.height, c = img.info.channels;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const px = i * c, out = i * 4;
    rgba[out] = img.data[px]; rgba[out+1] = img.data[px+1]; rgba[out+2] = img.data[px+2];
    rgba[out+3] = mask.data[i * mask.info.channels];
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outputPath);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, function(res) { var d = ""; res.on("data", function(c) { d += c; }); res.on("end", function() { resolve(JSON.parse(d)); }); }).on("error", reject);
  });
}

function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const u = new URL(url);
    var opts = { hostname: u.hostname, path: u.pathname + u.search, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(data) } };
    var req = mod.request(opts, function(res) { var d = ""; res.on("data", function(c) { d += c; }); res.on("end", function() { resolve(JSON.parse(d)); }); });
    req.on("error", reject); req.write(data); req.end();
  });
}

module.exports = { removeBackground, replaceBackground };
