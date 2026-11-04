import { createHash } from 'node:crypto';
import { Primitive } from '@gltf-transform/core';
import { reorder, weld } from '@gltf-transform/functions';

export const FOLIAGE_TOWN_TREE_ASSETS = Object.freeze([
  {
    path: 'models/foliage/pine_1.glb',
    inputSha256: '78dcb783364e151c8ee17e07d365aecd6f31fe24e9cd9119132d9c196aaed7e5',
    outputSha256: 'cdad3f039064450c357cbe87c33b2e560615913b4dcc6835679c41b497bd7799',
    semanticSha256: 'd72fb90ead75df40f11eff17103ce453369d5a8a688911413cc19d36c28e42de',
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: 'eaac25dab0b1c7b0c1da3aa8df25fb0b670cbc9c3425098413eb95de7e045e26',
    outputSha256: '646a28a9e5faec1ce8caede92a1d92ce3437256ea12b485b02f9ab93e2fbeeed',
    semanticSha256: 'a2a91ab9492687502fa5d62836e1d817b0f7cae591d57f2fdaeabacea36c7d53',
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '660270acbf9b4a32760365122cfafc2946fb84c7ef2102183f89d010ba53aab7',
    outputSha256: '43eacf51dceb2ca03d3d6dd31222ade3889657fef96d2e25e56c2ab37e3291f0',
    semanticSha256: 'db75c6fe80422ba7d07d9e72387df928e147b0c31e21ca479aca7e53d5112885',
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: '5e61db323e5bf68c42696fec8917d5c7d64482de757ed0b8226018abbd394e9d',
    outputSha256: '6af936e4158a62350c1a018cdc71170b0c451afce507732aa3be6a32b6ae7f17',
    semanticSha256: '84ccf91e258c41ac9e6d5db1727b41c996beaf6ac3dda8e11e296361bcc141a8',
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: '3a32608ed5cc4472eec7b59dae6469d5790a4153dd4941efbaef95409f297a26',
    outputSha256: 'd2d4e8f5181b00f37bd83833b60cb8e1e1ebe2bc20f665bf18e9ffb7f9bec87d',
    semanticSha256: 'b2a50f8b1aae9b40e98d4f3f135a9138fa67a41b6313457c585ef51414a2e4d5',
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: '898c537f9aceffb3e0550731f8808736eb45a0974e10dc7d23ec7fd225d3d4be',
    outputSha256: '8dc4c2499901fdde7f9cbe46bb7969badd44296150baf3b0059ecffd96bd2edd',
    semanticSha256: 'a83ce5724a570de2f2ad6ffbf49dd7f713c2628372bda6a4ac4b03c29902bbe4',
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: 'b04605fb523c95be62f3119d9018c477ac4df7d676cd6f2362f7e696f29968b9',
    outputSha256: '37892d97cb0012a41397958d6d126c195a3c4419ac37da93163b23c0d9d5c99e',
    semanticSha256: 'f17f7a172fb8fdbae7097ffe103b70c5269e4a56d80cc6ed794a12efb4338ec7',
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '226d40a4ea5004b57db56576b7d30fad0d0fc52dd99b36acedebb439d29d443b',
    outputSha256: 'c765344102ec3e8b833ffe2d937db76c06d93617922324701e81c2bd25ffad0c',
    semanticSha256: 'be3b6d0587cae11d9c7553ab12cc10218089333e2a00a186cf0c821d79f02a38',
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: '601c46968891b3831647dad68d4d3b8f885cdba173a3b16a886cd9be49e94b47',
    outputSha256: '584d816b262718828a2c072b615a8549929c4aa684d65fcf05d9822c8397a809',
    semanticSha256: '826f3458ea072360a39928a107deed0f7f761ce48817370ba0cc708e5356c806',
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
