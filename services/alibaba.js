/**
 * �������Ӿ����� + ͨ������ һվʽ����
 * ============================================
 * ��������AIͼ��������
 *   1. ��ͼȥ�ף�ͨ�÷ָ�/����ָ
 *   2. ���������ָ��ϳɣ�
 *   3. ת4K���壨ͼ�񳬷ֱ��ʣ�
 *   4. ���Ǩ�ƣ�ͨ�����ࣩ
 *   5. ������ͼ��ͨ������ͼ��ͼ��
 *
 * ��Ѷ�ȣ�ÿ�ֹ��� 500��/�£��㹻����ʹ��
 * ע���ַ��https://vision.aliyun.com/
 * ��ȡ AccessKey��https://ram.console.aliyun.com/
 *
 * ����������
 *   ALIBABA_ACCESS_KEY_ID      - ������ AccessKey ID
 *   ALIBABA_ACCESS_KEY_SECRET  - ������ AccessKey Secret
 *   ALIBABA_REGION             - ����Ĭ�� cn-shanghai��
 * ============================================
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

// ---------- ���� ----------
const REGION = process.env.ALIBABA_REGION || "cn-shanghai";
const ACCESS_KEY_ID = process.env.ALIBABA_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIBABA_ACCESS_KEY_SECRET;

const VIAPI_ENDPOINT = "viapi." + REGION + ".aliyuncs.com";
const DASHSCOPE_ENDPOINT = "dashscope.aliyuncs.com";

// ---------- ���ߺ��� ----------

/** HMAC-SHA1 ǩ�� */
function sign(stringToSign, secret) {
  return crypto.createHmac("sha1", secret).update(stringToSign).digest().toString("base64");
}

/** ���ɰ����� API ����ǩ��ͷ */
function buildHeaders(method, path, body, action) {
  var date = new Date().toUTCString();
  var md5 = crypto.createHash("md5").update(body || "").digest("base64");
  var contentType = "application/json;charset=utf-8";

  var stringToSign = method + "\n" + "application/json" + "\n" + md5 + "\n" + contentType + "\n" + date + "\n" + "x-acs-action:" + action + "\n" + "x-acs-version:2020-03-20" + "\n" + path;
  var signature = sign(stringToSign, ACCESS_KEY_SECRET);

  return {
    "Authorization": "acs " + ACCESS_KEY_ID + ":" + signature,
    "Content-Type": contentType,
    "Content-MD5": md5,
    "Date": date,
    "x-acs-version": "2020-03-20",
    "Accept": "application/json"
  };
}

/** HTTP �����װ */
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
          console.error("��������Ӧ����ʧ��:", data.substring(0, 500)); reject(new Error("Parse failed: " + data.substring(0, 200)));
        }
      });
    });
    req.on("error", function(e) { console.error("����������ʧ��:", host, path, e.message); reject(e); });
    req.setTimeout(120000, function() { req.destroy(); console.error("����������ʱ:", host, path); reject(new Error("Timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

/** �����Ӿ�����ƽ̨ API */
async function callViapi(action, params) {
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("������δ����: ������ ALIBABA_ACCESS_KEY_ID �� ALIBABA_ACCESS_KEY_SECRET");
  }
  var body = JSON.stringify(params);
  var headers = buildHeaders("POST", "/", body, action);
  headers["x-acs-action"] = action;
  var result = await request("POST", VIAPI_ENDPOINT, "/", headers, body);
  return result.Data || result;
}

/** �ļ�ת���õ�ͼƬ���� */
function imagePayload(inputPath, type) {
  var buf = fs.readFileSync(inputPath);
  var base64 = buf.toString("base64");
  return { ImageURL: "", ImageContent: base64 };
}

/** �����ļ� */
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
// 1. ��ͼȥ��
// ============================================================
async function removeBackground(inputPath, outputPath) {
  // ����ͨ�÷ָ����������+���壩
  var result = await callViapi("SegmentCommonImage", {
    ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64")
  });

  // ���ͨ�÷ָ��������룬��������ָ�
  if (!result || !result.PictureUrl) {
    result = await callViapi("SegmentBody", {
      ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64")
    });
  }

  if (result && result.PictureUrl) {
    await downloadFile(result.PictureUrl, outputPath);
    console.log("������ ��ͼ: �ɹ�");
    return outputPath;
  }

  // �߱��÷�������ȡ�ָ�����ϳ�
  if (result && (result.Elements || result.MaskURL)) {
    var maskUrl = result.MaskURL || result.Elements[0].MaskURL;
    if (maskUrl) {
      await applyMask(inputPath, maskUrl, outputPath);
      console.log("������ ��ͼ(����): �ɹ�");
      return outputPath;
    }
  }

  return null;
}

/** ������ϳɿ�ͼ��� */
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
// 2. ������
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
  console.log("������ ������: �ɹ�");
  return outputPath;
}

// ============================================================
// 3. ת4K���壨ͼ�񳬷ֱ��ʣ�
// ============================================================
async function upscale4K(inputPath, outputPath) {
  var result = await callViapi("MakeSuperResolutionImage", {
    ImageURL: "", ImageContent: fs.readFileSync(inputPath).toString("base64"),
    UpscaleFactor: 4,
    OutputFormat: "png"
  });

  if (result && result.PictureUrl) {
    await downloadFile(result.PictureUrl, outputPath);
    console.log("������ ת4K: �ɹ�");
    return outputPath;
  }
  return null;
}

// ============================================================
// 4. ���Ǩ��
// ============================================================
async function styleTransfer(inputPath, stylePrompt, outputPath) {
  // ʹ��ͨ������ API ���з��Ǩ��
  var result = await callDashScope("wanx-image-generation-v1", {
    model: "wanx-image-generation-v1",
    input: {
      image: { type: "image", imageContent: fs.readFileSync(inputPath).toString("base64") },
      prompt: "������ͼƬת����" + (stylePrompt || "�������") + "���"
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
      console.log("������ ���Ǩ��: �ɹ�");
      return outputPath;
    }
  }
  return null;
}

// ============================================================
// 5. ������ͼ��ͼ��ͼ��
// ============================================================
async function generateSimilar(inputPath, outputPath) {
  var result = await callDashScope("wanx-image-generation-v1", {
    model: "wanx-image-generation-v1",
    input: {
      image: { type: "image", imageContent: fs.readFileSync(inputPath).toString("base64") },
      prompt: "������ͼƬΪ�ο�������һ�ŷ�����Ƶ�ͼƬ"
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
      console.log("������ ������ͼ: �ɹ�");
      return outputPath;
    }
  }
  return null;
}

// ============================================================
// ͨ������ API ����
// ============================================================
async function callDashScope(model, params) {
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("������δ����");
  }

  var body = JSON.stringify(params);
  // DashScope ʹ�ò�ͬ����֤��ʽ��API Key��
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
    req.on("error", function(e) { console.error("����������ʧ��:", host, path, e.message); reject(e); });
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
