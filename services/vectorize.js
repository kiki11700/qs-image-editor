const sharp = require("sharp");
const fs = require("fs");

async function vectorize(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { data, info } = await sharp(inputPath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixels = new Uint8Array(data);

  // Simple edge detection
  const edgePixels = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = (pixels[(y-1)*width + (x+1)] + 2*pixels[y*width + (x+1)] + pixels[(y+1)*width + (x+1)])
               - (pixels[(y-1)*width + (x-1)] + 2*pixels[y*width + (x-1)] + pixels[(y+1)*width + (x-1)]);
      const gy = (pixels[(y+1)*width + (x-1)] + 2*pixels[(y+1)*width + x] + pixels[(y+1)*width + (x+1)])
               - (pixels[(y-1)*width + (x-1)] + 2*pixels[(y-1)*width + x] + pixels[(y-1)*width + (x+1)]);
      edgePixels[idx] = Math.min(255, Math.sqrt(gx*gx + gy*gy));
    }
  }

  const threshold = 80;
  for (let i = 0; i < edgePixels.length; i++) {
    edgePixels[i] = edgePixels[i] > threshold ? 255 : 0;
  }

  // Generate SVG
  let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + width + " " + height + "\">\n";
  let inPath = false;

  for (let y = 0; y < height; y += 2) {
    let pathStarted = false;
    for (let x = 0; x < width; x++) {
      if (edgePixels[y * width + x] > 0 && !pathStarted) {
        svg += "<path d=\"M" + x + "," + y + " ";
        pathStarted = true;
        inPath = true;
      } else if (edgePixels[y * width + x] === 0 && pathStarted) {
        svg += "\" fill=\"none\" stroke=\"black\" stroke-width=\"0.5\"/>\n";
        pathStarted = false;
        inPath = false;
      }
    }
    if (pathStarted) svg += "\" fill=\"none\" stroke=\"black\" stroke-width=\"0.5\"/>\n";
  }
  svg += "</svg>";

  fs.writeFileSync(outputPath, svg, "utf8");
  return outputPath;
}

module.exports = { vectorize };