const OpenAI = require("openai");
const fs = require("fs");

let openai = null;

function getOpenAI() {
  if (!openai) {
    const config = { apiKey: process.env.OPENAI_API_KEY };
    if (process.env.OPENAI_BASE_URL) {
      config.baseURL = process.env.OPENAI_BASE_URL;
    }
    openai = new OpenAI(config);
  }
  return openai;
}

async function upscale(inputPath, outputPath) {
  const response = await getOpenAI().images.createVariation({
    image: fs.createReadStream(inputPath),
    n: 1,
    size: "1024x1024",
    response_format: "b64_json"
  });
  const data = response.data[0].b64_json;
  fs.writeFileSync(outputPath, Buffer.from(data, "base64"));
  return outputPath;
}

async function styleTransfer(inputPath, stylePrompt, outputPath) {
  const response = await getOpenAI().images.edit({
    image: fs.createReadStream(inputPath),
    prompt: stylePrompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json"
  });
  const data = response.data[0].b64_json;
  fs.writeFileSync(outputPath, Buffer.from(data, "base64"));
  return outputPath;
}

async function generateSimilar(inputPath, outputPath) {
  const response = await getOpenAI().images.createVariation({
    image: fs.createReadStream(inputPath),
    n: 1,
    size: "1024x1024",
    response_format: "b64_json"
  });
  const data = response.data[0].b64_json;
  fs.writeFileSync(outputPath, Buffer.from(data, "base64"));
  return outputPath;
}

async function upscaleTo4K(inputPath, outputPath) {
  const response = await getOpenAI().images.createVariation({
    image: fs.createReadStream(inputPath),
    n: 1,
    size: "1024x1024",
    response_format: "b64_json"
  });
  const data = response.data[0].b64_json;
  fs.writeFileSync(outputPath, Buffer.from(data, "base64"));
  return outputPath;
}

module.exports = { upscale, styleTransfer, generateSimilar, upscaleTo4K };
