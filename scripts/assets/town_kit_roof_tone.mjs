// Town kit roof tone (docs/design/town-layout-eastbrook.md, section 10): pulls the
// bright red and orange of a kit house's painted roof toward Eastbrook's palette
// (muted terracotta, weathered brown, or blue-grey slate) by recolouring the base
// colour texture in place. Same material, same program, same texture size: only
// the saturated warm-red pixels move, so plaster, timber and stone keep their paint.
//
//   node scripts/assets/town_kit_roof_tone.mjs <in.glb> <out.glb> terracotta|brown|slate
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const TONES = {
  // [target hue in degrees or null to keep, saturation scale, value scale]
  terracotta: [18, 0.72, 0.86],
  brown: [24, 0.5, 0.62],
  slate: [212, 0.25, 0.75],
};

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** Whether a pixel is roof red or orange: warm hue, saturated, not near black.
 *  `minSaturation` lowers the bar for a second, deeper pass on a roof whose
 *  paint was brighter than the first pass could reach. */
export function isWarmRoofPixel(h, s, v, minSaturation = 0.6) {
  return (h >= 350 || h <= 25) && s >= minSaturation && v >= 0.3;
}

//   optional 4th argument: the minimum saturation a pixel needs to move (default 0.6)
const [input, output, toneName, minSatArg] = process.argv.slice(2);
const minSaturation = minSatArg === undefined ? 0.6 : Number(minSatArg);
const tone = TONES[toneName];
if (!tone) throw new Error(`tone must be one of ${Object.keys(TONES).join(', ')}`);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
let moved = 0;
let total = 0;
for (const material of doc.getRoot().listMaterials()) {
  const texture = material.getBaseColorTexture();
  if (!texture) continue;
  const image = texture.getImage();
  if (!image) continue;
  const { data, info } = await sharp(Buffer.from(image))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    total++;
    const [h, s, v] = rgbToHsv(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    if (!isWarmRoofPixel(h, s, v, minSaturation)) continue;
    moved++;
    // Blend by how deep in the red band the pixel sits, so edges soften.
    const [r, g, b] = hsvToRgb(tone[0] ?? h, s * tone[1], v * tone[2]);
    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .removeAlpha()
    .webp({ quality: 88 })
    .toBuffer();
  texture.setImage(new Uint8Array(out)).setMimeType('image/webp');
}
await io.write(output, doc);
console.log(
  JSON.stringify({ input, output, tone: toneName, movedPixels: moved, totalPixels: total }),
);
