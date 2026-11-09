import sharp from "sharp";

const inputLimit = 12 * 1024 * 1024;
const outputLimit = 2 * 1024 * 1024;
const maxPixels = 16_000_000;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hasStaticChunks(bytes, start, littleEndian) {
  for (let at = start; at + (littleEndian ? 8 : 12) <= bytes.length;) {
    const size = littleEndian ? bytes.readUInt32LE(at + 4) : bytes.readUInt32BE(at);
    const type = bytes.toString(
      "ascii",
      at + (littleEndian ? 0 : 4),
      at + (littleEndian ? 4 : 8),
    );
    if (["acTL", "fcTL", "fdAT", "ANIM", "ANMF"].includes(type)) return false;
    const next = at + (littleEndian ? 8 + size + (size % 2) : 12 + size);
    if (next > bytes.length) return false;
    if (type === "IEND") return size === 0 && next === bytes.length;
    at = next;
    if (littleEndian && at === bytes.length) return true;
  }
  return false;
}

function formatOf(bytes) {
  if (bytes.subarray(0, 8).equals(png))
    return hasStaticChunks(bytes, 8, false) ? "png" : null;
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "gif";
  if (
    bytes.length >= 20 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  )
    return hasStaticChunks(bytes, 12, true) ? "webp" : null;
  return null;
}

try {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > inputLimit) throw Error();
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, length);
  const format = formatOf(bytes);
  if (!format || process.argv[2] !== `image/${format}`) throw Error();
  sharp.concurrency(1);
  sharp.cache(false);
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: maxPixels });
  const { format: decoded, width, height, pages, hasAlpha } = await image.metadata();
  if (
    format !== decoded ||
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > maxPixels ||
    (pages !== undefined && pages !== 1)
  )
    throw Error();
  const side = hasAlpha ? 1024 : 1536;
  const resized = image
    .autoOrient()
    .resize(side, side, { fit: "inside", withoutEnlargement: true });
  const output = await (
    hasAlpha ? resized.png({ palette: true, effort: 2 }) : resized.jpeg({ quality: 82 })
  ).toBuffer();
  if (!output.length || output.length > outputLimit) throw Error();
  process.stdout.write(output);
} catch {
  process.stderr.write("UNIVERSAL_V3_IMAGE_REJECTED\n");
  process.exitCode = 1;
}
