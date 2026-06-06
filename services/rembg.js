const sharp = require("sharp");
const fs = require("fs");

async function removeBackground(inputPath, outputPath) {
  await sharp(inputPath)
    .toFormat("png")
    .toFile(outputPath);
  return outputPath;
}

async function replaceBackground(inputPath, bgColor, outputPath) {
  const color = bgColor || "#ffffff";
  const metadata = await sharp(inputPath).metadata();
  const bgBuffer = await sharp({
    create: { width: metadata.width, height: metadata.height, channels: 4, background: color }
  }).png().toBuffer();
  await sharp(bgBuffer)
    .composite([{ input: inputPath, top: 0, left: 0 }])
    .toFile(outputPath);
  return outputPath;
}

module.exports = { removeBackground, replaceBackground };