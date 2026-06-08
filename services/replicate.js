const fs = require("fs");
const path = require("path");
const https = require("https");

let replicate = null;

function getClient() {
  if (replicate) return replicate;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  try {
    const Replicate = require("replicate");
    replicate = new Replicate({ auth: token });
    return replicate;
  } catch(e) {
    console.warn("Replicate client init failed:", e.message);
    return null;
  }
}

// Model versions (pinned for stability)
const MODELS = {
  "remove-bg": "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
  "upscale": "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41606ed7d15a1184",
  "upscale4k": "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41606ed7d15a1184",
  "style-transfer": "timothybrooks/instruct-pix2pix:30c1d0b916a6f8efce20493f5d61ee27491ab9a60437c893c8316e6f0b6b3b3b",
  "similar": "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
};

/**
 * Call Replicate API for image processing.
 * Falls back to returning null if REPLICATE_API_TOKEN is not set.
 */
async function processImage(inputPath, type, params = {}) {
  const client = getClient();
  if (!client) return null; // fallback to sharp-based processing

  try {
    let model = MODELS[type];
    if (!model) return null;

    let input = { image: fs.createReadStream(inputPath) };

    // Model-specific parameters
    switch (type) {
      case "style-transfer":
        input.prompt = params.stylePrompt || "动漫风格";
        break;
      case "replace-bg":
        // Use rembg to remove background, then compose
        model = MODELS["remove-bg"];
        break;
      case "upscale4k":
        // ESRGAN with higher scale
        input.scale = 4;
        break;
      case "similar":
        input.prompt = "a similar image to this";
        input.denoising_strength = 0.7;
        break;
    }

    const output = await client.run(model, { input });

    // Handle output - could be URL string or array of URLs
    let outputUrl;
    if (typeof output === "string") {
      outputUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      outputUrl = output[0];
    } else if (typeof output === "object" && output.url) {
      outputUrl = output.url;
    } else {
      console.warn("Unexpected Replicate output format:", typeof output);
      return null;
    }

    // Download the result
    const ext = type === "vectorize" ? ".svg" : ".png";
    const outputPath = path.join(path.dirname(inputPath), path.basename(inputPath, path.extname(inputPath)) + "_result" + ext);
    await downloadFile(outputUrl, outputPath);
    return outputPath;
  } catch (e) {
    console.error("Replicate processing error:", e.message);
    return null; // fallback
  }
}

/**
 * Handle replace-bg specially: remove background first, then composite
 */
async function replaceBackground(inputPath, bgColor, outputPath) {
  const client = getClient();
  if (!client) return null;

  try {
    // Step 1: Remove background
    const output = await client.run(MODELS["remove-bg"], {
      input: { image: fs.createReadStream(inputPath) }
    });

    let noBgUrl;
    if (typeof output === "string") noBgUrl = output;
    else if (Array.isArray(output)) noBgUrl = output[0];
    else return null;

    // Step 2: Download the no-bg image
    const tmpPath = outputPath.replace(/\.\w+$/, "_nobg.png");
    await downloadFile(noBgUrl, tmpPath);

    // Step 3: Composite with background color using sharp
    const sharp = require("sharp");
    const color = bgColor || "#ffffff";
    const metadata = await sharp(tmpPath).metadata();
    const bgBuffer = await sharp({
      create: { width: metadata.width, height: metadata.height, channels: 4, background: color }
    }).png().toBuffer();
    await sharp(bgBuffer)
      .composite([{ input: tmpPath, top: 0, left: 0 }])
      .toFile(outputPath);

    // Cleanup
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    return outputPath;
  } catch (e) {
    console.error("Replicate replace-bg error:", e.message);
    return null;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

module.exports = { processImage, replaceBackground };