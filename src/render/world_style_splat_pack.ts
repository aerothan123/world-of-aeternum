// World Style Refined splat pack: pack plain decoded images into one RGBA8 byte buffer, one square layer per
// image, rows written bottom-up so a DataArrayTexture (which never flips)
// samples exactly like the flipY image textures it stands in for. Used for
// the World Style Refined detail normals (terrain.ts): the painted sets ship
// as JPGs with no KTX2 sibling, so their normal array is packed here instead
// of concatenated from compressed mip chains.
//
// A layer whose image has not resolved is filled with `fill` (RGBA) and the
// result reports itself incomplete, so the caller can retry on a later
// material build the way the albedo pack does.

import { isCanvasDrawableImage } from './canvas_drawable';

export interface PackedImageLayers {
  data: Uint8Array;
  complete: boolean;
}

export function packImageLayers(
  images: readonly unknown[],
  size: number,
  fill: readonly [number, number, number, number],
): PackedImageLayers {
  const data = new Uint8Array(size * size * 4 * images.length);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let complete = true;
  images.forEach((raw, layer) => {
    const dst = data.subarray(layer * size * size * 4, (layer + 1) * size * size * 4);
    const img = isCanvasDrawableImage(raw) ? raw : undefined;
    const w = (img as { width?: number } | undefined)?.width;
    if (!ctx || !img || !w) {
      for (let i = 0; i < dst.length; i += 4) dst.set(fill, i);
      complete = false;
      return;
    }
    ctx.save();
    ctx.translate(0, size);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0, size, size);
    ctx.restore();
    dst.set(ctx.getImageData(0, 0, size, size).data);
  });
  return { data, complete };
}
