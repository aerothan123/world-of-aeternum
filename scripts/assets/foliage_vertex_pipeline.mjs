import { createHash } from 'node:crypto';
import { Primitive } from '@gltf-transform/core';
import { reorder, weld } from '@gltf-transform/functions';

export const FOLIAGE_TOWN_TREE_ASSETS = Object.freeze([
  {
    path: 'models/foliage/pine_1.glb',
    inputSha256: '31a76e626def6daf9611365b53dc58cb170f6cddd4315ed95579e2c60078f675',
    outputSha256: 'ecbbc9720a97a74e16b218a366c994c74597b9a6b88b6d1bc6affb6afeb1613b',
    semanticSha256: '55d31eb650c377a5e2810dce1455ee053ac426de71248a1726e68454fa3bb633',
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: '98047c27de982c8c132266b64e80db2e9858805c36d512d19ea931617e29c116',
    outputSha256: 'ccee3bd8ab160f2e611fe3a374f4a8dc665d80dc20a348f6d8c4e1559128dbd4',
    semanticSha256: '62b49e80aaddb6d27ce0328c3d4db584239f870f4d0402cbe2a9077435bee1d3',
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '69a56b68efaae361d0e7f28de35b9fb851f59414f0a9f254373e7c798c21cd21',
    outputSha256: '8a10627cec57530e2bbfcdd5e38ed6392baeb4c8521ab25a5b44bf535a198ad6',
    semanticSha256: '7ba75d5efc383a774f465e52f7c54756e252f0b742db4a8cb69c4d4ec590dc8c',
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: '12bfd15a7ba8fca2bdca0806c979f1fd178778f19d204760b32ad7e763d99820',
    outputSha256: 'a91cca4c39666dd0814db29904b798036f05851a4a0639f45945359357ca166a',
    semanticSha256: 'c52e639b2b9ce8a8a5caf87d2f7702538c39b2cecba52e15e7efafffc58e7a02',
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: 'd5d44b90f577f74dacfd4f98161cf4d32694ca3834bea5429ce4c4be57d17693',
    outputSha256: 'ddc65fe9715309f3a35a2cec37201b8739f5695979413f3af82be6274483da20',
    semanticSha256: 'a5b20476ce8047cfa8e641bd305a5b2de7a479b2a6f98a3b32c320ec5d0d7d31',
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: '424230625f822f8ade09addc313596687fda291b41fed8f786b099bde40f7353',
    outputSha256: 'dca286be3fc655c14e024234461fd665d856b554e232e8f345609e2238f79f92',
    semanticSha256: 'ea31866413a42520b65e71ed1ea97154d13d28f18ed80e435ef58da623a682e2',
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: 'a7126bb3a2cc8a83e63c05edb73d807dc0b81f818b6f403841f14f52a2088fb9',
    outputSha256: '0d478b176b62b4dc6ea470ba8f498112d286518ced8f1137621d73caeb3dcc7f',
    semanticSha256: 'f2eb742522c4f11001ccd26241ce269b83b0bc75dffc78030331d4b12a4fd289',
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '0043c61c3fc964fe7b0ce92944c520e4159b5bf882ff303e4e5595f90dffdec3',
    outputSha256: '18f6ddbf280be80dab09b17030cc7700d0badaea9fe83e9a4a8329fb0f6f64f7',
    semanticSha256: '0c6e1fb6746cf3136d1f49b7ccf6cb7c6c212708055e647e83b651360c29d497',
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: 'dd767648f6ca39f37d8787a967fed952d8db6753e100d090b60b8c08158c1b1b',
    outputSha256: 'e1f29f1dfc7f30b4209633c79c0fcdc286a2504e1e4398376d36244d051a328c',
    semanticSha256: '2cc9a905ef552571f1d205177906d718b2d15c39e0449053bba89863adfadefe',
  },
]);

function hashField(hash, value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  hash.update(length);
  hash.update(bytes);
}

function hashAccessorElement(hash, accessor, index) {
  const array = accessor.getArray();
  if (!array) throw new Error(`Accessor ${accessor.getName() || '<unnamed>'} has no array`);
  const bytesPerElement = array.BYTES_PER_ELEMENT;
  const byteOffset = array.byteOffset + index * accessor.getElementSize() * bytesPerElement;
  hash.update(
    new Uint8Array(array.buffer, byteOffset, accessor.getElementSize() * bytesPerElement),
  );
}

function cornerHash(primitive, vertexIndex) {
  const hash = createHash('sha256');
  const semantics = primitive.listSemantics().sort();
  for (const semantic of semantics) {
    const accessor = primitive.getAttribute(semantic);
    if (!accessor) throw new Error(`Primitive lost ${semantic}`);
    hashField(
      hash,
      `${semantic}:${accessor.getComponentType()}:${accessor.getType()}:${accessor.getNormalized()}`,
    );
    hashAccessorElement(hash, accessor, vertexIndex);
  }
  for (const [targetIndex, target] of primitive.listTargets().entries()) {
    for (const semantic of target.listSemantics().sort()) {
      const accessor = target.getAttribute(semantic);
      if (!accessor) throw new Error(`Morph target ${targetIndex} lost ${semantic}`);
      hashField(
        hash,
        `target:${targetIndex}:${semantic}:${accessor.getComponentType()}:${accessor.getType()}:${accessor.getNormalized()}`,
      );
      hashAccessorElement(hash, accessor, vertexIndex);
    }
  }
  return hash.digest('hex');
}

function canonicalTriangles(primitive, label) {
  if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
    throw new Error(`${label} is not TRIANGLES`);
  }
  const indices = primitive.getIndices()?.getArray();
  const position = primitive.getAttribute('POSITION');
  if (!position) throw new Error(`${label} has no POSITION`);
  const cornerCount = indices?.length ?? position.getCount();
  if (cornerCount % 3 !== 0) {
    throw new Error(`${label} has partial triangles`);
  }
  const triangles = [];
  for (let corner = 0; corner < cornerCount; corner += 3) {
    const a = indices ? indices[corner] : corner;
    const b = indices ? indices[corner + 1] : corner + 1;
    const c = indices ? indices[corner + 2] : corner + 2;
    const corners = [cornerHash(primitive, a), cornerHash(primitive, b), cornerHash(primitive, c)];
    // EXT_meshopt's index codec may rotate (a,b,c) to (b,c,a) while
    // retaining winding. Canonicalize only cyclic rotations, never the
    // reversed order.
    triangles.push(
      [
        `${corners[0]}:${corners[1]}:${corners[2]}`,
        `${corners[1]}:${corners[2]}:${corners[0]}`,
        `${corners[2]}:${corners[0]}:${corners[1]}`,
      ].sort()[0],
    );
  }
  return triangles.sort();
}

/**
 * Fingerprint the winding-preserving corner attributes of every triangle
 * while ignoring triangle submission order, cyclic corner rotation, and
 * numeric vertex IDs. Equal fingerprints prove that a weld/cache/fetch
 * reorder retained every triangle and shader-visible vertex value bit for bit.
 */
export function triangleAttributeFingerprint(document) {
  const hash = createHash('sha256');
  for (const [meshIndex, mesh] of document.getRoot().listMeshes().entries()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      const triangles = canonicalTriangles(
        primitive,
        `Mesh ${meshIndex} primitive ${primitiveIndex}`,
      );
      hashField(
        hash,
        `mesh:${meshIndex}:primitive:${primitiveIndex}:triangles:${triangles.length}`,
      );
      for (const triangle of triangles) hashField(hash, triangle);
    }
  }
  return hash.digest('hex');
}

/** The same fingerprint over one primitive, independent of its mesh or index. */
export function primitiveTriangleAttributeFingerprint(primitive) {
  const hash = createHash('sha256');
  const triangles = canonicalTriangles(primitive, 'Primitive');
  hashField(hash, `triangles:${triangles.length}`);
  for (const triangle of triangles) hashField(hash, triangle);
  return hash.digest('hex');
}

/**
 * Merge only bitwise-identical complete vertices, then optimize triangle and
 * vertex storage order for GPU locality. This changes no attribute value or
 * triangle, and runs only in the offline asset pipeline.
 */
export async function optimizeFoliageVertexDocument(document, encoder) {
  await document.transform(
    weld(),
    reorder({
      encoder,
      target: 'performance',
    }),
  );
}
